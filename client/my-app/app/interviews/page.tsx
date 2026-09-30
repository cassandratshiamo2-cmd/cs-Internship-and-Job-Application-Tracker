"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { AppShell, SectionTitle, StatusBadge } from "@/components/app-shell";
import {
  getNotificationState,
  getServerNotificationState,
  refreshUserNotifications,
  subscribeToNotifications,
} from "@/lib/notification-api";
import type { Application } from "@/lib/types";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";

function normalizeDateOnly(value: unknown) {
  if (typeof value !== "string") {
    return "";
  }

  const normalizedValue = value.trim();
  const isoDate = /^(\d{4})-(\d{2})-(\d{2})/.exec(normalizedValue);
  if (isoDate) {
    return `${isoDate[1]}-${isoDate[2]}-${isoDate[3]}`;
  }

  const javascriptDate = /^(?:\w{3} )?(\w{3}) (\d{1,2}) (\d{4})\b/.exec(normalizedValue);
  if (javascriptDate) {
    const [, abbreviatedMonth, day, year] = javascriptDate;
    const month = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"].indexOf(abbreviatedMonth);
    if (month >= 0) {
      return `${year}-${String(month + 1).padStart(2, "0")}-${day.padStart(2, "0")}`;
    }
  }

  return "";
}

function normalizeInterviewApplication(value: unknown): Application | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const row = value as Record<string, unknown>;
  const status = String(row.status || "").trim();
  const interviewDate = normalizeDateOnly(row.interviewDate ?? row.interview_date);
  const interviewTime = String(row.interviewTime ?? row.interview_time ?? "").trim().slice(0, 5);

  return {
    ...(row as unknown as Application),
    status: status as Application["status"],
    interviewDate,
    interviewTime,
  };
}

export default function InterviewsPage() {
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
    }

    async function loadApplications() {
      try {
        if (!token) {
          throw new Error("Please log in to view interviews.");
        }

        const response = await fetch(`${API_URL}/api/applications`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const payload = await response.json().catch(() => null) as unknown;

        if (!response.ok) {
          const message = payload && typeof payload === "object" && "message" in payload
            ? String(payload.message)
            : "Unable to load interviews.";
          throw new Error(message);
        }

        const rows = Array.isArray(payload)
          ? payload
          : payload && typeof payload === "object" && "applications" in payload && Array.isArray(payload.applications)
            ? payload.applications
            : null;

        if (!rows) {
          throw new Error("The applications response did not contain an application list.");
        }

        const loadedApplications = rows
          .map(normalizeInterviewApplication)
          .filter((application): application is Application => Boolean(
            application &&
            application.status.trim().toLowerCase() === "interview" &&
            application.interviewDate &&
            application.interviewTime
          ));

        if (isMounted) {
          setApplications(loadedApplications);
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

  const notifications = notificationState.notifications;
  const isNotificationLoading = notificationState.isLoading;
  const notificationError = notificationState.message || "";

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