"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AppShell, SectionTitle, StatCard, StatusBadge } from "@/components/app-shell";
import {
  getActionStates,
  updateActionState,
  type SnoozePreset,
} from "@/lib/action-centre-api";
import { getActionRecommendations } from "@/lib/action-centre";
import { getCurrentUser, getStoredApplications } from "@/lib/mock-data";
import type { Application } from "@/lib/types";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";

export default function DashboardPage() {
  const [applications, setApplications] = useState<Application[]>([]);
  const [userName, setUserName] = useState("Your profile");
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [authToken, setAuthToken] = useState<string | null>(null);
  const [actionStates, setActionStates] = useState<Record<string, {
    state: "completed" | "snoozed";
    snoozedUntil?: string;
  }>>({});
  const [actionStatesLoaded, setActionStatesLoaded] = useState(false);
  const [actionStateError, setActionStateError] = useState("");
  const [workingActionId, setWorkingActionId] = useState("");
  const [actionUpdateError, setActionUpdateError] = useState("");
  const [currentTime, setCurrentTime] = useState(() => new Date());

  useEffect(() => {
    let isMounted = true;

    async function loadDashboard() {
      const user = getCurrentUser();

      if (isMounted) {
        setUserName(user?.fullName || "Your profile");
      }

      const token = window.localStorage.getItem("applyflow_token");
      if (isMounted) {
        setAuthToken(token || "");
      }

      // Guest/demo mode keeps the existing mock data.
      if (!token) {
        if (isMounted) {
          setApplications(getStoredApplications());
          setIsLoading(false);
        }
        return;
      }

      try {
        const response = await fetch(`${API_URL}/api/applications`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        const payload = (await response.json().catch(() => ({}))) as {
          applications?: Application[];
          message?: string;
        };

        if (!response.ok) {
          throw new Error(payload.message || "Unable to load applications.");
        }

        if (isMounted) {
          setApplications(payload.applications || []);
        }
      } catch (error) {
        if (isMounted) {
          setLoadError(
            error instanceof Error
              ? error.message
              : "Unable to load applications."
          );
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    void loadDashboard();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (authToken === null) {
      return;
    }
    if (!authToken) {
      return;
    }

    let isMounted = true;
    void getActionStates(authToken)
      .then((states) => {
        if (!isMounted) {
          return;
        }
        setActionStates(Object.fromEntries(
          states.map((state) => [
            state.actionId,
            {
              state: state.state,
              snoozedUntil: state.snoozedUntil || undefined,
            },
          ])
        ));
        setActionStateError("");
      })
      .catch((error) => {
        if (isMounted) {
          setActionStateError(error instanceof Error ? error.message : "Unable to load action states.");
        }
      })
      .finally(() => {
        if (isMounted) {
          setActionStatesLoaded(true);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [authToken]);

  useEffect(() => {
    const intervalId = window.setInterval(() => setCurrentTime(new Date()), 30_000);
    return () => window.clearInterval(intervalId);
  }, []);

  async function handleActionState(
    action: ReturnType<typeof getActionRecommendations>[number],
    state: "completed" | "snoozed",
    snoozePreset?: SnoozePreset
  ) {
    if (!authToken || workingActionId) {
      return;
    }
    setWorkingActionId(action.cycleKey);
    setActionUpdateError("");
    try {
      const result = await updateActionState(authToken, {
        applicationId: action.applicationId,
        actionId: action.cycleKey,
        kind: action.kind,
        state,
        snoozePreset,
      });
      setActionStates((current) => ({
        ...current,
        [result.action.actionId]: {
          state: result.action.state,
          snoozedUntil: result.action.snoozedUntil || undefined,
        },
      }));
    } catch (error) {
      setActionUpdateError(error instanceof Error ? error.message : "Unable to update this action.");
    } finally {
      setWorkingActionId("");
    }
  }

  const totalApplications = applications.length;

  const appliedCount = applications.filter(
    (item) => item.status === "Applied"
  ).length;

  const interviewCount = applications.filter(
    (item) => item.status === "Interview"
  ).length;

  const offersCount = applications.filter(
    (item) => item.status === "Offer"
  ).length;
  const actionRecommendations = getActionRecommendations(applications, currentTime, actionStates);
  const actionStatesLoading = Boolean(authToken && !actionStatesLoaded);

  const progressItems = [
    {
      label: "Applied",
      count: appliedCount,
    },
    {
      label: "Assessment",
      count: applications.filter(
        (item) => item.status === "Assessment"
      ).length,
    },
    {
      label: "Interview",
      count: interviewCount,
    },
    {
      label: "Offer",
      count: offersCount,
    },
  ];

  return (
    <AppShell title="Dashboard">
      <div className="space-y-6">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-medium uppercase tracking-[0.2em] text-[#0f766e]">
              Welcome back
            </p>

            <h2 className="text-3xl font-bold text-slate-800">
              {userName}, your applications are on track.
            </h2>
          </div>

          <Link
            href="/applications"
            className="inline-flex items-center justify-center rounded-full bg-[#2ec4c0] px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#1ca3a5]"
          >
            View applications
          </Link>
        </div>

        {isLoading ? (
          <div className="rounded-[28px] border border-dashed border-[#e7d6dd] bg-white/70 p-10 text-center text-slate-500">
            Loading dashboard...
          </div>
        ) : loadError ? (
          <div
            role="alert"
            className="rounded-[28px] border border-[#f8c8d5] bg-[#fff4f7] p-6 text-sm text-[#b3506e]"
          >
            {loadError}
          </div>
        ) : (
          <>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <StatCard
                label="Total Applications"
                value={String(totalApplications)}
                accent="bg-[#ffb8c9]"
              />

              <StatCard
                label="Applied"
                value={String(appliedCount)}
                accent="bg-[#f8cda8]"
              />

              <StatCard
                label="Interviews"
                value={String(interviewCount)}
                accent="bg-[#d7c6ff]"
              />

              <StatCard
                label="Offers"
                value={String(offersCount)}
                accent="bg-[#7fe2d4]"
              />
            </div>

            <section
              aria-labelledby="action-centre-title"
              className="rounded-[28px] border border-white/60 bg-white/80 p-5 shadow-[0_10px_30px_rgba(203,213,225,0.26)]"
            >
              <div className="mb-4">
                <h3
                  id="action-centre-title"
                  className="text-xl font-semibold text-slate-800"
                >
                  Action Centre
                </h3>
                <p className="mt-1 text-sm text-slate-500">
                  A few helpful next steps based on your saved application
                  details.
                </p>
              </div>

              {actionStateError ? (
                <p role="alert" className="mb-3 rounded-xl border border-[#f8c8d5] bg-[#fff4f7] p-3 text-sm text-[#b3506e]">
                  Action completion and snoozing are temporarily unavailable: {actionStateError}
                </p>
              ) : null}
              {actionUpdateError ? (
                <p role="alert" className="mb-3 rounded-xl border border-[#f8c8d5] bg-[#fff4f7] p-3 text-sm text-[#b3506e]">
                  {actionUpdateError}
                </p>
              ) : null}

              {actionRecommendations.length > 0 ? (
                <ul className="space-y-3">
                  {actionRecommendations.map((action) => {
                    const priorityStyle = {
                      Urgent: "bg-[#fff0f3] text-[#b3506e]",
                      High: "bg-[#fff4e8] text-[#a85d24]",
                      Medium: "bg-[#f2efff] text-[#6e58a7]",
                      Low: "bg-[#e9f9f6] text-[#167c75]",
                    }[action.priority];

                    return (
                      <li
                        key={action.key}
                        className="flex flex-col gap-3 rounded-2xl border border-[#f0e7ef] bg-[#fffafc] p-4 sm:flex-row sm:items-center sm:justify-between"
                      >
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="font-semibold text-slate-800">
                              {action.company}
                            </p>
                            <span
                              className={`rounded-full px-2.5 py-1 text-xs font-semibold ${priorityStyle}`}
                            >
                              {action.priority} priority
                            </span>
                          </div>
                          <p className="text-sm text-slate-600">
                            {action.position}
                          </p>
                          <p className="mt-1 text-sm text-slate-500">
                            {action.reason}
                          </p>
                        </div>

                        <div className="flex shrink-0 flex-wrap gap-2">
                          <Link
                            href={action.href}
                            className="inline-flex items-center justify-center rounded-full border border-[#bce9e5] bg-white px-4 py-2 text-sm font-semibold text-[#167c75] transition hover:bg-[#e9f9f6]"
                          >
                            View application
                          </Link>
                          {authToken ? (
                            <>
                              <button
                                type="button"
                                disabled={actionStatesLoading || Boolean(workingActionId)}
                                onClick={() => void handleActionState(action, "completed")}
                                className="rounded-full border border-[#d9e9e5] bg-white px-3 py-2 text-sm font-semibold text-slate-700 disabled:opacity-50"
                              >
                                {workingActionId === action.cycleKey ? "Saving..." : "Done"}
                              </button>
                              <button
                                type="button"
                                disabled={actionStatesLoading || Boolean(workingActionId)}
                                onClick={() => void handleActionState(action, "snoozed", "tomorrow")}
                                className="rounded-full border border-[#e7d6dd] bg-white px-3 py-2 text-sm font-semibold text-slate-700 disabled:opacity-50"
                              >
                                Tomorrow
                              </button>
                              <button
                                type="button"
                                disabled={actionStatesLoading || Boolean(workingActionId)}
                                onClick={() => void handleActionState(action, "snoozed", "one-week")}
                                className="rounded-full border border-[#e7d6dd] bg-white px-3 py-2 text-sm font-semibold text-slate-700 disabled:opacity-50"
                              >
                                In one week
                              </button>
                            </>
                          ) : null}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              ) : isLoading || actionStatesLoading ? (
                <div className="rounded-2xl border border-dashed border-[#e7d6dd] bg-[#fffafc] p-6 text-center text-sm text-slate-500">
                  Checking for actions...
                </div>
              ) : (
                <div className="rounded-2xl border border-dashed border-[#e7d6dd] bg-[#fffafc] p-6 text-center text-sm text-slate-500">
                  No actions need your attention right now. New reminders will appear here when there is a helpful next step.
                </div>
              )}
            </section>

            <div className="grid gap-6 xl:grid-cols-[1.5fr_1fr]">
              <section className="rounded-[28px] border border-white/60 bg-white/80 p-5 shadow-[0_10px_30px_rgba(203,213,225,0.26)]">
                <SectionTitle title="Recent applications" />

                <div className="space-y-3">
                  {applications.length > 0 ? (
                    applications.slice(0, 4).map((application) => (
                      <div
                        key={application.id}
                        className="flex flex-col gap-3 rounded-2xl border border-[#f0e7ef] bg-[#fffafc] p-4 sm:flex-row sm:items-center sm:justify-between"
                      >
                        <div>
                          <p className="text-lg font-semibold text-slate-800">
                            {application.company}
                          </p>

                          <p className="text-sm text-slate-500">
                            {application.position}
                          </p>

                          <p className="mt-1 text-xs text-slate-400">
                            {application.date}
                          </p>
                        </div>

                        <StatusBadge status={application.status} />
                      </div>
                    ))
                  ) : (
                    <div className="rounded-2xl border border-dashed border-[#e7d6dd] bg-[#fffafc] p-6 text-center text-sm text-slate-500">
                      No applications yet. Add your first opportunity to get
                      started.
                    </div>
                  )}
                </div>
              </section>

              <section className="rounded-[28px] border border-white/60 bg-white/80 p-5 shadow-[0_10px_30px_rgba(203,213,225,0.26)]">
                <SectionTitle title="Application progress" />

                <div className="space-y-4">
                  {progressItems.map((item) => {
                    const percentage = totalApplications
                      ? Math.min(
                          100,
                          Math.round(
                            (item.count / totalApplications) * 100
                          )
                        )
                      : 0;

                    return (
                      <div key={item.label}>
                        <div className="mb-2 flex items-center justify-between text-sm text-slate-600">
                          <span>{item.label}</span>
                          <span>{percentage}%</span>
                        </div>

                        <div className="h-2.5 rounded-full bg-slate-100">
                          <div
                            className="h-2.5 rounded-full bg-[linear-gradient(90deg,#ffb5c8,#f8cda8,#8adfdd)]"
                            style={{ width: `${percentage}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}