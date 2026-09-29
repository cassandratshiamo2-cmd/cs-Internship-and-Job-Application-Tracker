"use client";

import { useEffect, useState } from "react";
import { AppShell, SectionTitle, StatusBadge } from "@/components/app-shell";
import { getStoredInterviews, getStoredNotifications, syncInterviewNotifications } from "@/lib/mock-data";
import type { Interview, NotificationItem } from "@/lib/types";

export default function InterviewsPage() {
  const [interviews, setInterviews] = useState<Interview[]>([]);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);

  useEffect(() => {
    const nextInterviews = getStoredInterviews();
    setInterviews(nextInterviews);
    setNotifications(getStoredNotifications());
    syncInterviewNotifications(nextInterviews);
  }, []);

  return (
    <AppShell title="Interviews">
      <div className="space-y-6">
        <SectionTitle title="Upcoming and past interviews" />

        {notifications.length > 0 ? (
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
      </div>
    </AppShell>
  );
}
