"use client";

import { useEffect, useState } from "react";
import { AppShell, SectionTitle, StatusBadge } from "@/components/app-shell";
import { getStoredApplications } from "@/lib/mock-data";
import type { Application } from "@/lib/types";

export default function InterviewsPage() {
  const [applications, setApplications] = useState<Application[]>([]);

  useEffect(() => {
    setApplications(getStoredApplications().filter((application) => application.status === "Interview" && application.interviewDate && application.interviewTime));
  }, []);

  return (
    <AppShell title="Interviews">
      <div className="space-y-6">
        <SectionTitle title="Upcoming and past interviews" />

        <div className="grid gap-4 lg:grid-cols-2">
          {applications.length ? applications.map((application) => (
            <div key={application.id} className="rounded-[28px] border border-white/60 bg-white/80 p-5 shadow-[0_10px_30px_rgba(203,213,225,0.26)]">
              <div className="mb-4 flex items-start justify-between gap-2">
                <div>
                  <p className="text-xl font-semibold text-slate-800">{application.company}</p>
                  <p className="text-sm text-slate-500">{application.position}</p>
                </div>
                <StatusBadge status="Upcoming" />
              </div>

              <div className="space-y-2 text-sm text-slate-600">
                <p><span className="font-semibold text-slate-700">Date:</span> {application.interviewDate}</p>
                <p><span className="font-semibold text-slate-700">Time:</span> {application.interviewTime}</p>
                <p><span className="font-semibold text-slate-700">Reminders:</span> {application.notificationChannels?.join(", ") || "In-app"}</p>
              </div>
            </div>
          )) : (
            <div className="rounded-[28px] border border-dashed border-[#e7d6dd] bg-white/70 p-8 text-center text-slate-500">
              No interviews scheduled yet. Set an application status to Interview to add one.
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}
