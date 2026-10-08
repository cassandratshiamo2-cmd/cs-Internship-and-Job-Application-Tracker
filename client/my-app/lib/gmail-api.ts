import type { Application } from '@/lib/types';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';

export type GmailConnectionStatus = {
  connected: boolean;
  email: string | null;
  lastSyncAt: string | null;
  lastSyncError: string | null;
};

export type GmailReviewMessage = {
  id: string;
  gmail_message_id: string;
  sender: string;
  subject: string;
  received_at: string;
  detected_status: Application['status'] | null;
  confidence: number;
  candidate_application_ids: string[];
  review_reason: string | null;
};

export type GmailProcessedMessage = {
  id: string;
  gmail_message_id: string;
  sender: string;
  subject: string;
  received_at: string;
  processed_at: string | null;
  detected_status: Application['status'] | null;
  detected_interview_date: string | null;
  detected_interview_time: string | null;
  detected_interview_type: string | null;
  outcome: 'updated' | 'reviewed' | 'dismissed' | 'ignored';
  application_company: string | null;
  application_position: string | null;
  application_status: Application['status'] | null;
  application_interview_date: string | null;
  application_interview_time: string | null;
  application_interview_type: string | null;
};

type ApiOptions = RequestInit & { token: string };

async function apiRequest<T>(path: string, options: ApiOptions): Promise<T> {
  const { token, headers, ...requestOptions } = options;
  const response = await fetch(`${API_URL}/api/gmail${path}`, {
    ...requestOptions,
    headers: {
      ...(requestOptions.body ? { 'Content-Type': 'application/json' } : {}),
      ...headers,
      Authorization: `Bearer ${token}`,
    },
  });
  const payload = (await response.json().catch(() => ({}))) as T & { message?: string };
  if (!response.ok) throw new Error(payload.message || 'Gmail request failed.');
  return payload;
}

export function getGmailStatus(token: string) {
  return apiRequest<GmailConnectionStatus>('/status', { token });
}

export async function getGmailReviewQueue(token: string) {
  const result = await apiRequest<{ messages: GmailReviewMessage[] }>('/review', {
    token,
    cache: 'no-store',
  });
  return result.messages;
}

export async function getGmailProcessingHistory(token: string) {
  const result = await apiRequest<{ messages: GmailProcessedMessage[] }>('/history', {
    token,
    cache: 'no-store',
  });
  return result.messages;
}

export async function beginGmailConnection(token: string) {
  const result = await apiRequest<{ authorizationUrl: string }>('/connect', {
    token,
    method: 'POST',
  });
  return result.authorizationUrl;
}

export function disconnectGmail(token: string) {
  return apiRequest<{ disconnected: boolean }>('/connection', {
    token,
    method: 'DELETE',
  });
}

export function syncGmail(token: string) {
  return apiRequest<{
    message: string;
    processed: number;
    inProgress?: boolean;
    retryAfterSeconds?: number;
  }>('/sync', {
    token,
    method: 'POST',
  });
}

export function decideGmailReview(
  token: string,
  messageId: string,
  decision: { action: 'apply'; applicationId: string } | { action: 'dismiss' },
) {
  return apiRequest<{ message: string }>(`/review/${encodeURIComponent(messageId)}`, {
    token,
    method: 'POST',
    body: JSON.stringify(decision),
  });
}