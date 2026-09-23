"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AppShell, SectionTitle, StatCard, StatusBadge } from "@/components/app-shell";
import { getCurrentUser, getStoredApplications } from "@/lib/mock-data";
import type { Application } from "@/lib/types";

export default function DashboardPage() {
  const [applications, setApplications] = useState<Application[]>([]);
  const [userName, setUserName] = useState("Your profile");

  useEffect(() => {
    const user = getCurrentUser();
    setUserName(user?.fullName || "Your profile");
    setApplications(getStoredApplications());
  }, []);

  const totalApplications = applications.length;
  const appliedCount = applications.filter((item) => item.status === "Applied").length;
  const interviewCount = applications.filter((item) => item.status === "Interview" && item.interviewDate && item.interviewTime).length;
  const offersCount = applications.filter((item) => item.status === "Offer").length;

  return (
    <AppShell title="Dashboard">
      <div className="space-y-6">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-medium uppercase tracking-[0.2em] text-[#0f766e]">Welcome back</p>
            <h2 className="text-3xl font-bold text-slate-800">{userName}, your applications are on track.</h2>
          </div>
          <Link
            href="/applications"
            className="inline-flex items-center justify-center rounded-full bg-[#2ec4c0] px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#1ca3a5]"
          >
            View applications
          </Link>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Total Applications" value={String(totalApplications)} accent="bg-[#ffb8c9]" />
          <StatCard label="Applied" value={String(appliedCount)} accent="bg-[#f8cda8]" />
          <StatCard label="Interviews" value={String(interviewCount)} accent="bg-[#d7c6ff]" />
          <StatCard label="Offers" value={String(offersCount)} accent="bg-[#7fe2d4]" />
        </div>

        <div className="grid gap-6 xl:grid-cols-[1.5fr_1fr]">
          <section className="rounded-[28px] border border-white/60 bg-white/80 p-5 shadow-[0_10px_30px_rgba(203,213,225,0.26)]">
            <SectionTitle title="Recent applications" />
            <div className="space-y-3">
              {applications.length > 0 ? (
                applications.slice(0, 4).map((application) => (
                  <div key={application.id} className="flex flex-col gap-3 rounded-2xl border border-[#f0e7ef] bg-[#fffafc] p-4 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-lg font-semibold text-slate-800">{application.company}</p>
                      <p className="text-sm text-slate-500">{application.position}</p>
                      <p className="mt-1 text-xs text-slate-400">{application.date}</p>
                    </div>
                    <StatusBadge status={application.status} />
                  </div>
                ))
              ) : (
                <div className="rounded-2xl border border-dashed border-[#e7d6dd] bg-[#fffafc] p-6 text-center text-sm text-slate-500">
                  No applications yet. Add your first opportunity to get started.
                </div>
              )}
            </div>
          </section>

          <section className="rounded-[28px] border border-white/60 bg-white/80 p-5 shadow-[0_10px_30px_rgba(203,213,225,0.26)]">
            <SectionTitle title="Application progress" />
            <div className="space-y-4">
              {[
                { label: "Applied", value: applications.length ? Math.min(100, Math.round((applications.filter((item) => item.status === "Applied").length / applications.length) * 100)) : 0 },
                { label: "Assessment", value: applications.length ? Math.min(100, Math.round((applications.filter((item) => item.status === "Assessment").length / applications.length) * 100)) : 0 },
                { label: "Interview", value: applications.length ? Math.min(100, Math.round((applications.filter((item) => item.status === "Interview").length / applications.length) * 100)) : 0 },
                { label: "Offer", value: applications.length ? Math.min(100, Math.round((applications.filter((item) => item.status === "Offer").length / applications.length) * 100)) : 0 },
              ].map((item) => (
                <div key={item.label}>
                  <div className="mb-2 flex items-center justify-between text-sm text-slate-600">
                    <span>{item.label}</span>
                    <span>{item.value}%</span>
                  </div>
                  <div className="h-2.5 rounded-full bg-slate-100">
                    <div
                      className="h-2.5 rounded-full bg-[linear-gradient(90deg,#ffb5c8,#f8cda8,#8adfdd)]"
                      style={{ width: `${item.value}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </AppShell>
  );
}
