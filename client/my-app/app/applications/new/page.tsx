"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { AppShell } from "@/components/app-shell";
import { getStoredApplications, saveApplications } from "@/lib/mock-data";
import type { NotificationChannel } from "@/lib/types";
import { sendExternalInterviewNotifications } from "@/lib/notification-api";

export default function AddApplicationPage() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget as HTMLFormElement);

    const company = String(form.get("company") || "").trim();
    const position = String(form.get("position") || "").trim();
    const date = String(form.get("date") || "").trim();
    const type = String(form.get("type") || "");
    const status = String(form.get("status") || "");
    const arrangement = String(form.get("arrangement") || "");
    const notes = String(form.get("notes") || "").trim();
    const applicationLink = String(form.get("applicationLink") || "").trim();
    const interviewDate = String(form.get("interviewDate") || "").trim();
    const interviewTime = String(form.get("interviewTime") || "").trim();
    const notificationChannels = form.getAll("notificationChannel") as NotificationChannel[];
    const interviewEmail = String(form.get("interviewEmail") || "").trim();
    const interviewPhone = String(form.get("interviewPhone") || "").trim();

    if (!company || !position || !date || !type || !status || !arrangement || !notes) {
      setError("Please complete all required fields.");
      return;
    }

    if (applicationLink && !/^https?:\/\//i.test(applicationLink)) {
      setError("The application link must start with http:// or https://.");
      return;
    }

    if (status === "Interview" && (!interviewDate || !interviewTime)) {
      setError("Add the interview date and time before saving an interview application.");
      return;
    }

    if (status === "Interview" && notificationChannels.includes("Email") && !interviewEmail) {
      setError("Add an email address for email reminders.");
      return;
    }

    if (status === "Interview" && (notificationChannels.includes("SMS") || notificationChannels.includes("Phone")) && !interviewPhone) {
      setError("Add your account phone number for SMS reminders.");
      return;
    }

    if (status === "Interview" && (notificationChannels.includes("SMS") || notificationChannels.includes("Phone")) && !/^\+[1-9]\d{7,14}$/.test(interviewPhone)) {
      setError("Use an international phone number in E.164 format, such as +27123456789.");
      return;
    }

    const applications = getStoredApplications();
    const applicationId = `app-${Date.now()}`;
    applications.push({
      id: applicationId,
      company,
      position,
      date,
      type: type as "Internship" | "WIL" | "Graduate Job" | "Full-Time Job" | "Job",
      status: status as "Saved" | "Applied" | "Assessment" | "Shortlisted" | "Interview" | "Offer" | "Rejected" | "Withdrawn",
      arrangement: arrangement as "Remote" | "Hybrid" | "Onsite",
      notes,
      ...(applicationLink ? { applicationLink } : {}),
      ...(status === "Interview" ? { interviewDate, interviewTime, notificationChannels: notificationChannels.length ? notificationChannels : ["In-app"], interviewEmail, interviewPhone } : {}),
    });

    saveApplications(applications);
    setError("");
    if (status === "Interview") {
      const delivery = await sendExternalInterviewNotifications({ applicationId, company, position, interviewDate, interviewTime, scheduledAt: new Date(`${interviewDate}T${interviewTime}`).toISOString(), applicationLink, notificationChannels, email: interviewEmail, phoneNumber: interviewPhone });
      window.sessionStorage.setItem("applyflow_delivery_notice", delivery.message);
    }
    router.push("/applications");
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
            <div className="md:col-span-2">
              <label className="mb-2 block text-sm font-medium text-slate-700">Job post link (optional)</label>
              <input type="url" name="applicationLink" placeholder="https://company.com/jobs/role" className="w-full rounded-2xl border border-[#e7d6dd] bg-[#fffafc] px-4 py-3 text-slate-800 outline-none focus:border-[#38b7b9]" />
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
                <option>Job</option>
              </select>
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">Application Status</label>
              <select name="status" value={status} onChange={(event) => setStatus(event.target.value)} className="w-full rounded-2xl border border-[#e7d6dd] bg-[#fffafc] px-4 py-3 text-slate-800 outline-none focus:border-[#38b7b9]">
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

          {status === "Interview" ? <InterviewFields /> : null}

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

function InterviewFields() {
  return (
    <fieldset className="rounded-2xl border border-[#d9d3ff] bg-[#faf8ff] p-4">
      <legend className="px-1 text-sm font-semibold text-[#5d4b9f]">Interview schedule and reminders</legend>
      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <label className="mb-2 block text-sm font-medium text-slate-700">Interview date</label>
          <input required type="date" name="interviewDate" className="w-full rounded-2xl border border-[#e7d6dd] bg-white px-4 py-3 text-slate-800 outline-none focus:border-[#38b7b9]" />
        </div>
        <div>
          <label className="mb-2 block text-sm font-medium text-slate-700">Interview time</label>
          <input required type="time" name="interviewTime" className="w-full rounded-2xl border border-[#e7d6dd] bg-white px-4 py-3 text-slate-800 outline-none focus:border-[#38b7b9]" />
        </div>
      </div>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-2 block text-sm font-medium text-slate-700">Reminder email</label>
          <input type="email" name="interviewEmail" placeholder="you@example.com" className="w-full rounded-2xl border border-[#e7d6dd] bg-white px-4 py-3 text-slate-800 outline-none focus:border-[#38b7b9]" />
        </div>
        <div>
          <label className="mb-2 block text-sm font-medium text-slate-700">Account phone for SMS reminders</label>
          <input type="tel" name="interviewPhone" placeholder="+27123456789" className="w-full rounded-2xl border border-[#e7d6dd] bg-white px-4 py-3 text-slate-800 outline-none focus:border-[#38b7b9]" />
        </div>
      </div>
      <p className="mt-4 text-sm text-slate-500">Email reminders use the address above. SMS reminders use the phone number stored on your account.</p>
      <div className="mt-3 flex flex-wrap gap-4 text-sm text-slate-700">
        {(["In-app", "Email", "SMS"] as NotificationChannel[]).map((channel) => (
          <label key={channel} className="flex items-center gap-2">
            <input type="checkbox" name="notificationChannel" value={channel} defaultChecked={channel === "In-app"} />
            {channel}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
