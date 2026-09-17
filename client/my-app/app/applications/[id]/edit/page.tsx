"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { getStoredApplications, saveApplications } from "@/lib/mock-data";
import type { Application } from "@/lib/types";

export default function EditApplicationPage() {
  const params = useParams<{ id: string }>();
  const [application, setApplication] = useState<Application | null>(null);

  useEffect(() => {
    const foundApplication = getStoredApplications().find((item) => item.id === params.id);
    setApplication(foundApplication ?? null);
  }, [params.id]);

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!application) {
      return;
    }

    const form = new FormData(event.currentTarget);
    const updatedApplications = getStoredApplications().map((item) => {
      if (item.id !== application.id) {
        return item;
      }

      return {
        ...item,
        company: String(form.get("company") || item.company).trim(),
        position: String(form.get("position") || item.position).trim(),
        date: String(form.get("date") || item.date),
        type: String(form.get("type") || item.type) as Application["type"],
        status: String(form.get("status") || item.status) as Application["status"],
        arrangement: String(form.get("arrangement") || item.arrangement) as Application["arrangement"],
        notes: String(form.get("notes") || item.notes).trim(),
      };
    });

    saveApplications(updatedApplications);
    window.location.href = `/applications/${application.id}`;
  };

  if (!application) {
    return (
      <AppShell title="Edit Application">
        <div className="rounded-[28px] border border-dashed border-[#e7d6dd] bg-white/70 p-10 text-center text-slate-500">
          Application not found.
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell title="Edit Application">
      <div className="mx-auto max-w-3xl rounded-[28px] border border-white/60 bg-white/80 p-5 shadow-[0_10px_30px_rgba(203,213,225,0.26)] sm:p-8">
        <div className="mb-6 flex items-center justify-between gap-3">
          <h2 className="text-2xl font-bold text-slate-800">Edit Application</h2>
          <Link href={`/applications/${application.id}`} className="text-sm font-medium text-[#0f766e]">
            View details
          </Link>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="grid gap-5 md:grid-cols-2">
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">Company Name</label>
              <input name="company" defaultValue={application.company} className="w-full rounded-2xl border border-[#e7d6dd] bg-[#fffafc] px-4 py-3 text-slate-800 outline-none focus:border-[#38b7b9]" />
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">Position / Job Title</label>
              <input name="position" defaultValue={application.position} className="w-full rounded-2xl border border-[#e7d6dd] bg-[#fffafc] px-4 py-3 text-slate-800 outline-none focus:border-[#38b7b9]" />
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">Application Date</label>
              <input type="date" name="date" defaultValue={application.date} className="w-full rounded-2xl border border-[#e7d6dd] bg-[#fffafc] px-4 py-3 text-slate-800 outline-none focus:border-[#38b7b9]" />
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">Application Type</label>
              <select name="type" defaultValue={application.type} className="w-full rounded-2xl border border-[#e7d6dd] bg-[#fffafc] px-4 py-3 text-slate-800 outline-none focus:border-[#38b7b9]">
                <option>Internship</option>
                <option>WIL</option>
                <option>Graduate Job</option>
                <option>Full-Time Job</option>
              </select>
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">Application Status</label>
              <select name="status" defaultValue={application.status} className="w-full rounded-2xl border border-[#e7d6dd] bg-[#fffafc] px-4 py-3 text-slate-800 outline-none focus:border-[#38b7b9]">
                <option>Saved</option>
                <option>Applied</option>
                <option>Assessment</option>
                <option>Shortlisted</option>
                <option>Interview</option>
                <option>Offer</option>
                <option>Rejected</option>
                <option>Withdrawn</option>
              </select>
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">Work Arrangement</label>
              <select name="arrangement" defaultValue={application.arrangement} className="w-full rounded-2xl border border-[#e7d6dd] bg-[#fffafc] px-4 py-3 text-slate-800 outline-none focus:border-[#38b7b9]">
                <option>Remote</option>
                <option>Hybrid</option>
                <option>Onsite</option>
              </select>
            </div>
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-slate-700">Notes</label>
            <textarea name="notes" defaultValue={application.notes} rows={5} className="w-full rounded-2xl border border-[#e7d6dd] bg-[#fffafc] px-4 py-3 text-slate-800 outline-none focus:border-[#38b7b9]" />
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
            <Link href={`/applications/${application.id}`} className="inline-flex items-center justify-center rounded-full border border-[#e7d6dd] bg-white px-5 py-3 text-sm font-semibold text-slate-700">
              Cancel
            </Link>
            <button type="submit" className="rounded-full bg-[#1db7b5] px-5 py-3 text-sm font-semibold text-white shadow-sm hover:bg-[#169a9a]">
              Save Changes
            </button>
          </div>
        </form>
      </div>
    </AppShell>
  );
}
