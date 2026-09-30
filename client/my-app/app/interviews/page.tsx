"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { AppShell, SectionTitle, StatusBadge } from "@/components/app-shell";
import { getStoredApplications, getStoredInterviews, getStoredNotifications, syncInterviewNotifications } from "@/lib/mock-data";
import {
  getNotificationState,
  getServerNotificationState,
  refreshUserNotifications,
  subscribeToNotifications,
} from "@/lib/notification-api";
import type { Application, Interview, NotificationItem } from "@/lib/types";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";

export default function InterviewsPage() {
  const [interviews, setInterviews] = useState<Interview[]>([]);
  const [localNotifications, setLocalNotifications] = useState<NotificationItem[] | null>(null);
  const [applications, setApplications] = useState<Application[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const notificationState = useSyncExternalStore(
    subscribeToNotifications,
    getNotificationState,
    getServerNotificationState
  );

  useEffect(() => {
    let isMounted = true;
    const token = window.localStorage.getItem("applyflow_token");

    if (token) {
      void refreshUserNotifications();
    } else {
      void Promise.resolve().then(() => {
        if (!isMounted) {
          return;
        }

        const localInterviews = getStoredInterviews();
        setInterviews(localInterviews);
        setLocalNotifications(getStoredNotifications());
        syncInterviewNotifications(localInterviews);
      });
    }

    async function loadApplications() {
      try {
        let loadedApplications: Application[];

        if (!token) {
          loadedApplications = getStoredApplications();
        } else {
          const response = await fetch(`${API_URL}/api/applications`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          const payload = (await response.json().catch(() => ({}))) as {
            applications?: Application[];
            message?: string;
          };

          if (!response.ok) {
            throw new Error(payload.message || "Unable to load interviews.");
          }

          loadedApplications = payload.applications || [];
        }

        if (isMounted) {
          setApplications(
            loadedApplications.filter(
              (application) =>
                application.status === "Interview" &&
                application.interviewDate &&
                application.interviewTime
            )
          );
        }
      } catch (error) {
        if (isMounted) {
          setLoadError(error instanceof Error ? error.message : "Unable to load interviews.");
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    void loadApplications();

    return () => {
      isMounted = false;
    };
  }, []);

  const notifications = localNotifications ?? notificationState.notifications;
  const isNotificationLoading = localNotifications === null && notificationState.isLoading;
  const notificationError = localNotifications === null ? notificationState.message : "";

  const getInterviewStatus = (interviewDate?: string, interviewTime?: string) => {
    if (!interviewDate || !interviewTime) {
      return "Upcoming";
    }

    const currentSastParts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Africa/Johannesburg",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(new Date());

    const currentSast = Object.fromEntries(
      currentSastParts
        .filter((part) => part.type !== "literal")
        .map((part) => [part.type, part.value])
    );
    const currentSastDateTime = `${currentSast.year}-${currentSast.month}-${currentSast.day}T${currentSast.hour}:${currentSast.minute}`;
    const interviewSastDateTime = `${interviewDate}T${interviewTime}`;

    return interviewSastDateTime < currentSastDateTime ? "Past" : "Upcoming";
  };

  return (
    <AppShell title="Interviews">
      <div className="space-y-6">
        <SectionTitle title="Upcoming and past interviews" />

        {isNotificationLoading ? (
          <div className="rounded-[28px] border border-dashed border-[#e7d6dd] bg-white/70 p-6 text-sm text-slate-500">
            Loading reminders...
          </div>
        ) : notificationError ? (
          <div role="alert" className="rounded-[28px] border border-[#f8c8d5] bg-[#fff4f7] p-4 text-sm text-[#b3506e]">
            {notificationError}
          </div>
        ) : notifications.length > 0 ? (
          <div className="rounded-[28px] border border-[#f7d9e5] bg-[#fffafc] p-4 shadow-[0_10px_30px_rgba(203,213,225,0.18)]">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#b3506e]">Upcoming reminders</p>
            <div className="mt-3 space-y-2">
              {notifications.map((notification) => (
                <div key={notification.id} className="rounded-2xl border border-[#f4d4df] bg-white/70 p-3 text-sm text-slate-600">
                  <p className="font-semibold text-slate-800">{notification.title}</p>
                  <p className="mt-1">{notification.message}</p>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {interviews.length > 0 ? (
          <div className="grid gap-4 lg:grid-cols-2">
            {interviews.map((interview) => (
              <div key={interview.id} className="rounded-[28px] border border-white/60 bg-white/80 p-5 shadow-[0_10px_30px_rgba(203,213,225,0.26)]">
                <div className="mb-4 flex items-start justify-between gap-2">
                  <div>
                    <p className="text-xl font-semibold text-slate-800">{interview.company}</p>
                    <p className="text-sm text-slate-500">{interview.position}</p>
                  </div>
                  <StatusBadge status={interview.status} />
                </div>
                <div className="space-y-2 text-sm text-slate-600">
                  <p><span className="font-semibold text-slate-700">Date:</span> {interview.date}</p>
                  <p><span className="font-semibold text-slate-700">Time:</span> {interview.time}</p>
                  <p><span className="font-semibold text-slate-700">Type:</span> {interview.type}</p>
                  <p><span className="font-semibold text-slate-700">Status:</span> {interview.status}</p>
                  <p><span className="font-semibold text-slate-700">Details:</span> {interview.details}</p>
                </div>
              </div>
            ))}
          </div>
        ) : null}

        <div className="grid gap-4 lg:grid-cols-2">
          {isLoading ? (
            <div className="rounded-[28px] border border-dashed border-[#e7d6dd] bg-white/70 p-8 text-center text-slate-500">
              Loading interviews...
            </div>
          ) : loadError ? (
            <div role="alert" className="rounded-[28px] border border-[#f8c8d5] bg-[#fff4f7] p-6 text-sm text-[#b3506e]">
              {loadError}
            </div>
          ) : applications.length ? (
            applications.map((application) => {
              const interviewStatus = getInterviewStatus(application.interviewDate, application.interviewTime);

              return (
                <div key={application.id} className="rounded-[28px] border border-white/60 bg-white/80 p-5 shadow-[0_10px_30px_rgba(203,213,225,0.26)]">
                  <div className="mb-4 flex items-start justify-between gap-2">
                    <div>
                      <p className="text-xl font-semibold text-slate-800">{application.company}</p>
                      <p className="text-sm text-slate-500">{application.position}</p>
                    </div>
                    <StatusBadge status={interviewStatus} />
                  </div>
                  <div className="space-y-2 text-sm text-slate-600">
                    <p><span className="font-semibold text-slate-700">Type:</span> {application.interviewType || "Not specified"}</p>
                    <p><span className="font-semibold text-slate-700">Date:</span> {application.interviewDate}</p>
                    <p><span className="font-semibold text-slate-700">Time:</span> {application.interviewTime}</p>
                    <p><span className="font-semibold text-slate-700">Reminders:</span> {application.notificationChannels?.join(", ") || "In-app"}</p>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="rounded-[28px] border border-dashed border-[#e7d6dd] bg-white/70 p-8 text-center text-slate-500">
              No interviews scheduled yet. Set an application status to Interview to add one.
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}