'use client';

import { useEffect, useState } from 'react';
import { AppShell, SectionTitle, StatusBadge } from '@/components/app-shell';
import {
  beginGmailConnection,
  decideGmailReview,
  disconnectGmail,
  getGmailProcessingHistory,
  getGmailReviewQueue,
  getGmailStatus,
  retryGmailMessage,
  syncGmail,
  type GmailConnectionStatus,
  type GmailProcessedMessage,
  type GmailReviewMessage,
} from '@/lib/gmail-api';
import { retryAndRefresh } from '@/lib/gmail-retry';
import type { Application } from '@/lib/types';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';

function formatSyncOutcomeSummary(outcomes: string[] = []) {
  const labels: Record<string, string> = {
    updated: 'updated',
    review: 'sent for review',
    ignored: 'ignored',
    duplicate: 'duplicates skipped',
    already_up_to_date: 'already up to date',
    warning: 'sent for review with a processing warning',
  };
  const counts = new Map<string, number>();
  for (const outcome of outcomes) {
    counts.set(outcome, (counts.get(outcome) || 0) + 1);
  }

  return Array.from(counts.entries())
    .map(([outcome, count]) => `${count} ${labels[outcome] || outcome.replaceAll('_', ' ')}`)
    .join(', ');
}

export default function GmailIntegrationPage() {
  const [token] = useState(() =>
    typeof window === 'undefined' ? '' : window.localStorage.getItem('applyflow_token') || ''
  );
  const [status, setStatus] = useState<GmailConnectionStatus | null>(null);
  const [messages, setMessages] = useState<GmailReviewMessage[]>([]);
  const [history, setHistory] = useState<GmailProcessedMessage[]>([]);
  const [applications, setApplications] = useState<Application[]>([]);
  const [selectedApplicationIds, setSelectedApplicationIds] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isWorking, setIsWorking] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  async function loadIntegrationData(activeToken: string) {
    const [nextStatus, nextMessages, nextHistory, applicationsResponse] = await Promise.all([
      getGmailStatus(activeToken),
      getGmailReviewQueue(activeToken),
      getGmailProcessingHistory(activeToken),
      fetch(`${API_URL}/api/applications`, {
        headers: { Authorization: `Bearer ${activeToken}` },
      }),
    ]);
    const applicationsPayload = (await applicationsResponse.json().catch(() => ({}))) as {
      applications?: Application[];
      message?: string;
    };
    if (!applicationsResponse.ok) {
      throw new Error(applicationsPayload.message || 'Unable to load applications.');
    }
    setStatus(nextStatus);
    setMessages(nextMessages);
    setHistory(nextHistory);
    setApplications(applicationsPayload.applications || []);
    setSelectedApplicationIds((current) => {
      const next = { ...current };
      for (const message of nextMessages) {
        if (!next[message.id] && message.candidate_application_ids?.length === 1) {
          next[message.id] = message.candidate_application_ids[0];
        }
      }
      return next;
    });
    return nextMessages;
  }

  useEffect(() => {
    const activeToken = token;
    const params = new URLSearchParams(window.location.search);
    queueMicrotask(() => {
      if (params.get('gmail') === 'connected') setNotice('Gmail connected. Syncing recent messages now.');
      if (params.get('gmail') && params.get('gmail') !== 'connected') {
        setError('Gmail connection did not complete. Check the OAuth setup and try again.');
      }
    });
    if (!activeToken) {
      queueMicrotask(() => {
        setError('Log in to connect a Gmail account.');
        setIsLoading(false);
      });
      return;
    }

    void Promise.resolve()
      .then(() => loadIntegrationData(activeToken))
      .catch((loadError) => setError(loadError instanceof Error ? loadError.message : 'Unable to load Gmail settings.'))
      .finally(() => setIsLoading(false));
  }, [token]);

  async function refreshData() {
    if (!token) return null;
    return loadIntegrationData(token);
  }

  async function handleConnect() {
    setIsWorking(true);
    setError('');
    try {
      const authorizationUrl = await beginGmailConnection(token);
      window.location.assign(authorizationUrl);
    } catch (connectError) {
      setError(connectError instanceof Error ? connectError.message : 'Unable to connect Gmail.');
      setIsWorking(false);
    }
  }

  async function handleDisconnect() {
    setIsWorking(true);
    setError('');
    try {
      await disconnectGmail(token);
      await refreshData();
      setNotice('Gmail disconnected.');
    } catch (disconnectError) {
      setError(disconnectError instanceof Error ? disconnectError.message : 'Unable to disconnect Gmail.');
    } finally {
      setIsWorking(false);
    }
  }

  async function handleSync() {
    if (isWorking) return;
    setIsWorking(true);
    setError('');
    setNotice('');
    try {
      const result = await syncGmail(token);
      if (result.inProgress) {
        setNotice(result.message);
        try {
          await refreshData();
        } catch (refreshError) {
          setError(
            `A Gmail sync is already running, but the page could not be refreshed: ${
              refreshError instanceof Error ? refreshError.message : 'Please try again.'
            }`
          );
        }
        return;
      }

      const checkedLabel = `${result.processed} message${result.processed === 1 ? '' : 's'} checked.`;
      const outcomeSummary = formatSyncOutcomeSummary(result.outcomes);
      setNotice(
        `${result.message} ${checkedLabel}${outcomeSummary ? ` Outcomes: ${outcomeSummary}.` : ''}`
      );
      try {
        await refreshData();
      } catch (refreshError) {
        setError(
          `Gmail sync completed, but the page could not be refreshed: ${
            refreshError instanceof Error ? refreshError.message : 'Please refresh the page.'
          }`
        );
      }
    } catch (syncError) {
      const message = syncError instanceof Error ? syncError.message : 'Unable to check Gmail.';
      setError(message);
      try {
        await refreshData();
      } catch (refreshError) {
        setError(
          `${message} Gmail status could not be refreshed: ${
            refreshError instanceof Error ? refreshError.message : 'Please refresh the page.'
          }`
        );
      }
    } finally {
      setIsWorking(false);
    }
  }

  async function handleRetry(messageId: string) {
    if (isWorking) return;
    setIsWorking(true);
    setError('');
    setNotice('');
    try {
      const { result, refreshFailed, refreshError } = await retryAndRefresh(
        () => retryGmailMessage(token, messageId),
        refreshData,
      );
      const outcome = result.outcomes[0];
      setNotice(
        outcome === 'updated'
          ? 'Email reprocessed and application status updated.'
          : outcome === 'review'
            ? 'Email reprocessed and added to the review queue.'
            : outcome === 'ignored'
              ? 'Email reprocessed; no supported application status was detected.'
              : 'Email retry completed without a duplicate status update.'
      );
      if (refreshFailed) {
        setError(
          `Email retry completed, but Gmail data could not be refreshed: ${
            refreshError instanceof Error ? refreshError.message : 'Please refresh the page.'
          }`
        );
      }
    } catch (retryError) {
      setError(retryError instanceof Error ? retryError.message : 'Unable to retry this email.');
      try {
        await refreshData();
      } catch {
        setError((current) => `${current} Gmail data could not be refreshed.`);
      }
    } finally {
      setIsWorking(false);
    }
  }

  async function handleReview(message: GmailReviewMessage, action: 'apply' | 'dismiss') {
    const applicationId = selectedApplicationIds[message.id];
    if (action === 'apply' && !applicationId) {
      setError('Select an application before applying this status update.');
      return;
    }

    setIsWorking(true);
    setError('');
    try {
      await decideGmailReview(
        token,
        message.id,
        action === 'apply' ? { action, applicationId } : { action },
      );
      await refreshData();
      setNotice(action === 'apply' ? 'Application status updated.' : 'Email dismissed.');
    } catch (reviewError) {
      const latestMessages = await refreshData().catch(() => null);
      if (latestMessages && !latestMessages.some((item) => item.id === message.id)) {
        setError('');
        setNotice('This email was processed. The review queue has been refreshed.');
        return;
      }
      setError(reviewError instanceof Error ? reviewError.message : 'Unable to update this review item.');
    } finally {
      setIsWorking(false);
    }
  }

  return (
    <AppShell title="Gmail Integration">
      <div className="space-y-6">
        <SectionTitle title="Gmail Integration" />

        <section className="rounded-[24px] border border-white/70 bg-white/80 p-5 shadow-[0_10px_30px_rgba(203,213,225,0.2)] sm:p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold text-slate-800">Connection status</p>
              {isLoading ? (
                <p className="mt-1 text-sm text-slate-500">Loading Gmail connection...</p>
              ) : status?.connected ? (
                <>
                  <p className="mt-1 text-sm text-slate-600">Connected as {status.email}</p>
                  <p className="mt-1 text-xs text-slate-500">
                    Last sync attempt: {status.lastSyncAt ? new Date(status.lastSyncAt).toLocaleString() : 'Not synced yet'}
                  </p>
                </>
              ) : (
                <p className="mt-1 text-sm text-slate-600">No Gmail account connected.</p>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              {status?.connected ? (
                <>
                  <button type="button" disabled={isWorking} onClick={handleSync} className="rounded-full bg-[#1b9aa1] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60">
                    Check for New Emails
                  </button>
                  <button type="button" disabled={isWorking} onClick={handleDisconnect} className="rounded-full border border-[#e7d6dd] bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 disabled:opacity-60">
                    Disconnect Gmail
                  </button>
                </>
              ) : (
                <button type="button" disabled={isWorking || isLoading || !token} onClick={handleConnect} className="rounded-full bg-[#1b9aa1] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60">
                  Connect Gmail
                </button>
              )}
            </div>
          </div>
          {status?.lastSyncError ? (
            <p role="alert" className="mt-4 rounded-xl border border-[#f8c8d5] bg-[#fff4f7] px-3 py-2 text-sm text-[#b3506e]">
              Last sync error: {status.lastSyncError}
            </p>
          ) : null}
          {notice ? <p role="status" className="mt-4 text-sm text-[#0f766e]">{notice}</p> : null}
          {error ? <p role="alert" className="mt-4 text-sm text-[#b3506e]">{error}</p> : null}
        </section>

        <section>
          <SectionTitle title={`Emails to review (${messages.length})`} />
          {isLoading ? (
            <div className="rounded-2xl border border-dashed border-[#e7d6dd] bg-white/70 p-8 text-center text-sm text-slate-500">Loading review queue...</div>
          ) : messages.length ? (
            <div className="space-y-3">
              {messages.map((message) => {
                const candidateIds = message.candidate_application_ids || [];
                return (
                  <article key={message.id} className="rounded-[20px] border border-[#eadce2] bg-white/85 p-4 shadow-sm sm:p-5">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="break-words font-semibold text-slate-800">{message.subject || '(No subject)'}</p>
                        <p className="mt-1 break-all text-sm text-slate-500">{message.sender}</p>
                        <p className="mt-1 text-xs text-slate-500">{new Date(message.received_at).toLocaleString()}</p>
                      </div>
                      {message.detected_status ? <StatusBadge status={message.detected_status} /> : null}
                    </div>
                    <p className="mt-3 text-sm text-slate-600">
                      {message.review_reason || 'Choose the matching application to apply the detected status.'}
                    </p>
                    <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                      <select
                        aria-label={`Application for ${message.subject || 'email'}`}
                        value={selectedApplicationIds[message.id] || ''}
                        onChange={(event) => setSelectedApplicationIds((current) => ({ ...current, [message.id]: event.target.value }))}
                        className="min-w-0 flex-1 rounded-xl border border-[#e7d6dd] bg-[#fffafc] px-3 py-2.5 text-sm text-slate-700"
                      >
                        <option value="">Select application</option>
                        {applications.map((application) => (
                          <option key={application.id} value={application.id}>
                            {application.company} - {application.position} ({application.status})
                          </option>
                        ))}
                      </select>
                      <button type="button" disabled={isWorking || !message.detected_status} onClick={() => void handleReview(message, 'apply')} className="rounded-full bg-[#1b9aa1] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">
                        Apply Status
                      </button>
                      <button type="button" disabled={isWorking} onClick={() => void handleReview(message, 'dismiss')} className="rounded-full border border-[#e7d6dd] bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 disabled:opacity-60">
                        Dismiss
                      </button>
                      {message.retryable ? (
                        <button type="button" disabled={isWorking} onClick={() => void handleRetry(message.id)} className="rounded-full border border-[#b9e7e4] bg-[#f0fbfa] px-4 py-2.5 text-sm font-semibold text-[#0f766e] disabled:opacity-60">
                          Retry email
                        </button>
                      ) : null}
                    </div>
                    {candidateIds.length ? (
                      <p className="mt-2 text-xs text-slate-500">Possible matches: {candidateIds.map((id) => applications.find((application) => application.id === id)?.company || `Application ${id}`).join(', ')}</p>
                    ) : null}
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-[#e7d6dd] bg-white/70 p-8 text-center text-sm text-slate-500">No emails need review.</div>
          )}
        </section>

        <section>
          <SectionTitle title={`Processed email history (${history.length})`} />
          {isLoading ? (
            <div className="rounded-2xl border border-dashed border-[#e7d6dd] bg-white/70 p-8 text-center text-sm text-slate-500">Loading processed email history...</div>
          ) : history.length ? (
            <div className="space-y-3">
              {history.map((message) => (
                <article key={message.id} className="rounded-[20px] border border-[#eadce2] bg-white/85 p-4 shadow-sm sm:p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="break-words font-semibold text-slate-800">{message.subject || '(No subject)'}</p>
                      <p className="mt-1 break-all text-sm text-slate-500">{message.sender}</p>
                      <p className="mt-1 text-xs text-slate-500">Processed {message.processed_at ? new Date(message.processed_at).toLocaleString() : 'recently'}</p>
                    </div>
                    {message.detected_status ? <StatusBadge status={message.detected_status} /> : null}
                  </div>
                  <p className="mt-3 text-sm font-medium text-slate-700">
                    {message.outcome === 'updated' ? 'Automatically applied' : message.outcome === 'reviewed' ? 'Applied from review' : message.outcome === 'dismissed' ? 'Dismissed' : 'Processed'}
                    {message.application_company ? ` to ${message.application_company} - ${message.application_position || 'Application'}` : ''}
                  </p>
                  <dl className="mt-3 grid gap-x-6 gap-y-1 text-sm text-slate-600 sm:grid-cols-2 lg:grid-cols-4">
                    <div><dt className="inline font-medium">Application status: </dt><dd className="inline">{message.application_status || message.detected_status || 'Not available'}</dd></div>
                    <div><dt className="inline font-medium">Interview date: </dt><dd className="inline">{message.detected_interview_date || message.application_interview_date || 'Not detected'}</dd></div>
                    <div><dt className="inline font-medium">Interview time: </dt><dd className="inline">{message.detected_interview_time?.slice(0, 5) || message.application_interview_time?.slice(0, 5) || 'Not detected'}</dd></div>
                    <div><dt className="inline font-medium">Interview type: </dt><dd className="inline">{message.detected_interview_type || message.application_interview_type || 'Not specified'}</dd></div>
                  </dl>
                  {message.retryable ? (
                    <button type="button" disabled={isWorking} onClick={() => void handleRetry(message.id)} className="mt-4 rounded-full border border-[#b9e7e4] bg-[#f0fbfa] px-4 py-2 text-sm font-semibold text-[#0f766e] disabled:opacity-60">
                      Retry email
                    </button>
                  ) : null}
                </article>
              ))}
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-[#e7d6dd] bg-white/70 p-8 text-center text-sm text-slate-500">No processed Gmail emails yet.</div>
          )}
        </section>
      </div>
    </AppShell>
  );
}