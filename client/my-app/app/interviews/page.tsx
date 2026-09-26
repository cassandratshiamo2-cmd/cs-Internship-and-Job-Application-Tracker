"use client";

import { useState } from "react";
import { AppShell, SectionTitle, StatusBadge } from "@/components/app-shell";
import { getStoredApplications } from "@/lib/mock-data";
import type { Application } from "@/lib/types";

export default function InterviewsPage() {
  const [applications] = useState<Application[]>(() =>
    getStoredApplications().filter(
      (application) =>
        application.status === "Interview" &&
        application.interviewDate &&
        application.interviewTime
    )
  );

  const getInterviewStatus = (
    interviewDate?: string,
    interviewTime?: string
  ) => {
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

        <div className="grid gap-4 lg:grid-cols-2">
          {applications.length ? (
            applications.map((application) => {
              const interviewStatus = getInterviewStatus(
                application.interviewDate,
                application.interviewTime
              );

              return (
                <div
                  key={application.id}
                  className="rounded-[28px] border border-white/60 bg-white/80 p-5 shadow-[0_10px_30px_rgba(203,213,225,0.26)]"
                >
                  <div className="mb-4 flex items-start justify-between gap-2">
                    <div>
                      <p className="text-xl font-semibold text-slate-800">
                        {application.company}
                      </p>

                      <p className="text-sm text-slate-500">
                        {application.position}
                      </p>
                    </div>

                    <StatusBadge status={interviewStatus} />
                  </div>

                  <div className="space-y-2 text-sm text-slate-600">
                    <p>
                      <span className="font-semibold text-slate-700">
                        Date:
                      </span>{" "}
                      {application.interviewDate}
                    </p>

                    <p>
                      <span className="font-semibold text-slate-700">
                        Time:
                      </span>{" "}
                      {application.interviewTime}
                    </p>

                    <p>
                      <span className="font-semibold text-slate-700">
                        Reminders:
                      </span>{" "}
                      {application.notificationChannels?.join(", ") ||
                        "In-app"}
                    </p>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="rounded-[28px] border border-dashed border-[#e7d6dd] bg-white/70 p-8 text-center text-slate-500">
              No interviews scheduled yet. Set an application status tojb
              Interview to add one.
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}
