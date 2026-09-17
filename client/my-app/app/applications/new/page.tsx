"use client";

import Link from "next/link";
import { useState } from "react";
import { AppShell } from "@/components/app-shell";
import { getStoredApplications, saveApplications } from "@/lib/mock-data";

export default function AddApplicationPage() {
  const [error, setError] = useState("");

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget as HTMLFormElement);

    const company = String(form.get("company") || "").trim();
    const position = String(form.get("position") || "").trim();
    const date = String(form.get("date") || "").trim();
    const type = String(form.get("type") || "");
    const status = String(form.get("status") || "");
    const arrangement = String(form.get("arrangement") || "");
    const notes = String(form.get("notes") || "").trim();

    if (!company || !position || !date || !type || !status || !arrangement || !notes) {
      setError("Please complete all required fields.");
      return;
    }

    const applications = getStoredApplications();
    applications.push({
      id: `app-${Date.now()}`,
      company,
      position,
      date,
      type: type as "Internship" | "WIL" | "Graduate Job" | "Full-Time Job",
      status: status as "Saved" | "Applied" | "Assessment" | "Shortlisted" | "Interview" | "Offer" | "Rejected" | "Withdrawn",
      arrangement: arrangement as "Remote" | "Hybrid" | "Onsite",
      notes,
    });

    saveApplications(applications);
    setError("");
    window.location.href = "/applications";
  };

  return (
    <AppShell title="Add Application">
      <div className="mx-auto max-w-3xl rounded-[28px] border border-white/60 bg-white/80 p-5 shadow-[0_10px_30px_rgba(203,213,225,0.26)] sm:p-8">
        <div className="mb-6 flex items-center justify-between gap-3">
          <h2 className="text-2xl font-bold text-slate-800">Add Application</h2>
          <Link href="/applications" className="text-sm font-medium text-[#0f766e]">
            Back to list
          </Link>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="grid gap-5 md:grid-cols-2">
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">Company Name</label>
              <input name="company" className="w-full rounded-2xl border border-[#e7d6dd] bg-[#fffafc] px-4 py-3 text-slate-800 outline-none focus:border-[#38b7b9]" />
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">Position / Job Title</label>
              <input name="position" className="w-full rounded-2xl border border-[#e7d6dd] bg-[#fffafc] px-4 py-3 text-slate-800 outline-none focus:border-[#38b7b9]" />
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">Application Date</label>
              <input type="date" name="date" className="w-full rounded-2xl border border-[#e7d6dd] bg-[#fffafc] px-4 py-3 text-slate-800 outline-none focus:border-[#38b7b9]" />
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">Application Type</label>
              <select name="type" className="w-full rounded-2xl border border-[#e7d6dd] bg-[#fffafc] px-4 py-3 text-slate-800 outline-none focus:border-[#38b7b9]">
                <option value="">Select</option>
                <option>Internship</option>
                <option>WIL</option>
                <option>Graduate Job</option>
                <option>Full-Time Job</option>
              </select>
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">Application Status</label>
              <select name="status" className="w-full rounded-2xl border border-[#e7d6dd] bg-[#fffafc] px-4 py-3 text-slate-800 outline-none focus:border-[#38b7b9]">
                <option value="">Select</option>
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
              <select name="arrangement" className="w-full rounded-2xl border border-[#e7d6dd] bg-[#fffafc] px-4 py-3 text-slate-800 outline-none focus:border-[#38b7b9]">
                <option value="">Select</option>
                <option>Remote</option>
                <option>Hybrid</option>
                <option>Onsite</option>
              </select>
            </div>
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-slate-700">Notes</label>
            <textarea name="notes" rows={5} className="w-full rounded-2xl border border-[#e7d6dd] bg-[#fffafc] px-4 py-3 text-slate-800 outline-none focus:border-[#38b7b9]" />
          </div>

          {error ? (
            <div className="rounded-2xl border border-[#f8c8d5] bg-[#fff4f7] px-4 py-3 text-sm text-[#b3506e]">
              {error}
            </div>
          ) : null}

          <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
            <Link href="/applications" className="inline-flex items-center justify-center rounded-full border border-[#e7d6dd] bg-white px-5 py-3 text-sm font-semibold text-slate-700">
              Cancel
            </Link>
            <button type="submit" className="rounded-full bg-[#1db7b5] px-5 py-3 text-sm font-semibold text-white shadow-sm hover:bg-[#169a9a]">
              Save Application
            </button>
          </div>
        </form>
      </div>
    </AppShell>
  );
}
