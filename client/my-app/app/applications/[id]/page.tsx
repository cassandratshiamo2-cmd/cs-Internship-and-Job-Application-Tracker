"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { notFound, useParams } from "next/navigation";
import { AppShell, StatusBadge } from "@/components/app-shell";
import { getStoredApplications } from "@/lib/mock-data";
import type { Application } from "@/lib/types";

export default function ApplicationDetailPage() {
  const params = useParams<{ id: string }>();
  const [application, setApplication] = useState<Application | null>(null);

  useEffect(() => {
    const foundApplication = getStoredApplications().find((item) => item.id === params.id);
    setApplication(foundApplication ?? null);
  }, [params.id]);

  if (!application) {
    return notFound();
  }

  return (
    <AppShell title="Application Details">
      <div className="mx-auto max-w-3xl rounded-[28px] border border-white/60 bg-white/80 p-5 shadow-[0_10px_30px_rgba(203,213,225,0.26)] sm:p-8">
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-medium uppercase tracking-[0.18em] text-[#0f766e]">Application</p>
            <h2 className="text-3xl font-bold text-slate-800">{application.company}</h2>
          </div>
          <StatusBadge status={application.status} />
        </div>

        <div className="grid gap-5 md:grid-cols-2">
          <InfoRow label="Position" value={application.position} />
          <InfoRow label="Application Date" value={application.date} />
          <InfoRow label="Application Type" value={application.type} />
          <InfoRow label="Application Status" value={application.status} />
          <InfoRow label="Work Arrangement" value={application.arrangement} />
          <InfoRow label="Notes" value={application.notes} />
        </div>

        <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-end">
          <Link href="/applications" className="inline-flex items-center justify-center rounded-full border border-[#e7d6dd] bg-white px-5 py-3 text-sm font-semibold text-slate-700">
            Back
          </Link>
          <Link href={`/applications/${application.id}/edit`} className="inline-flex items-center justify-center rounded-full border border-[#d0f4ef] bg-[#ebfffd] px-5 py-3 text-sm font-semibold text-[#0f766e]">
            Edit
          </Link>
          <Link href={`/applications/${application.id}/delete`} className="inline-flex items-center justify-center rounded-full border border-[#ffd6df] bg-[#fff3f6] px-5 py-3 text-sm font-semibold text-[#b3506e]">
            Delete
          </Link>
        </div>
      </div>
    </AppShell>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-[#f0e7ef] bg-[#fffafc] p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">{label}</p>
      <p className="mt-2 text-base font-medium text-slate-700">{value}</p>
    </div>
  );
}
