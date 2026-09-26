"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { getStoredApplications, saveApplications } from "@/lib/mock-data";
import type { Application, NotificationChannel } from "@/lib/types";
import { cancelExternalInterviewNotifications, sendExternalInterviewNotifications } from "@/lib/notification-api";

export default function EditApplicationPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [application, setApplication] = useState<Application | null>(null);
  const [status, setStatus] = useState<Application["status"] | "Saved">("Saved");

  useEffect(() => {
    const foundApplication = getStoredApplications().find((item) => item.id === params.id);
    const syncApplication = window.setTimeout(() => {
      setApplication(foundApplication ?? null);
      setStatus(foundApplication?.status ?? "Saved");
    }, 0);

    return () => window.clearTimeout(syncApplication);
  }, [params.id]);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!application) {
      return;
    }

    const form = new FormData(event.currentTarget);
    const nextStatus = String(form.get("status") || application.status) as Application["status"];
    const interviewDate = String(form.get("interviewDate") || "").trim();
    const interviewTime = String(form.get("interviewTime") || "").trim();
    const applicationLink = String(form.get("applicationLink") || "").trim();
    const notificationChannels = form.getAll("notificationChannel") as NotificationChannel[];
    const savedChannels: NotificationChannel[] = notificationChannels.length ? notificationChannels : ["In-app"];
    const interviewEmail = String(form.get("interviewEmail") || "").trim();

    if (nextStatus === "Interview" && (!interviewDate || !interviewTime)) {
      return;
    }

    if (nextStatus === "Interview" && savedChannels.includes("Email") && !interviewEmail) {
      return;
    }

    if (applicationLink && !/^https?:\/\//i.test(applicationLink)) {
      return;
    }

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
        status: nextStatus,
        arrangement: String(form.get("arrangement") || item.arrangement) as Application["arrangement"],
        notes: String(form.get("notes") || item.notes).trim(),
        applicationLink: applicationLink || undefined,
        ...(nextStatus === "Interview" ? { interviewDate, interviewTime, notificationChannels: savedChannels, interviewEmail } : { interviewDate: undefined, interviewTime: undefined, notificationChannels: undefined, interviewEmail: undefined }),
      };
    });

    saveApplications(updatedApplications);
    if (nextStatus === "Interview") {
      const hasExternalChannel = savedChannels.includes("Email");
      if (hasExternalChannel) {
        const delivery = await sendExternalInterviewNotifications({ applicationId: application.id, company: String(form.get("company") || application.company).trim(), position: String(form.get("position") || application.position).trim(), interviewDate, interviewTime, scheduledAt: new Date(`${interviewDate}T${interviewTime}`).toISOString(), applicationLink, notificationChannels: savedChannels, email: interviewEmail });
        window.sessionStorage.setItem("applyflow_delivery_notice", delivery.message);
      } else {
        await cancelExternalInterviewNotifications(application.id);
        window.sessionStorage.setItem("applyflow_delivery_notice", "In-app reminder saved.");
      }
    } else {
      await cancelExternalInterviewNotifications(application.id);
    }
    router.push(`/applications/${application.id}`);
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
            <div className="md:col-span-2">
              <label className="mb-2 block text-sm font-medium text-slate-700">Job post link (optional)</label>
              <input type="url" name="applicationLink" defaultValue={application.applicationLink} placeholder="https://company.com/jobs/role" className="w-full rounded-2xl border border-[#e7d6dd] bg-[#fffafc] px-4 py-3 text-slate-800 outline-none focus:border-[#38b7b9]" />
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
                <option>Job</option>
              </select>
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">Application Status</label>
              <select name="status" value={status} onChange={(event) => setStatus(event.target.value as Application["status"])} className="w-full rounded-2xl border border-[#e7d6dd] bg-[#fffafc] px-4 py-3 text-slate-800 outline-none focus:border-[#38b7b9]">
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

          {status === "Interview" ? (
            <fieldset className="rounded-2xl border border-[#d9d3ff] bg-[#faf8ff] p-4">
              <legend className="px-1 text-sm font-semibold text-[#5d4b9f]">Interview schedule and reminders</legend>
              <div className="grid gap-5 sm:grid-cols-2">
                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-700">Interview date</label>
                  <input required type="date" name="interviewDate" defaultValue={application.interviewDate} className="w-full rounded-2xl border border-[#e7d6dd] bg-white px-4 py-3 text-slate-800 outline-none focus:border-[#38b7b9]" />
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-700">Interview time</label>
                  <input required type="time" name="interviewTime" defaultValue={application.interviewTime} className="w-full rounded-2xl border border-[#e7d6dd] bg-white px-4 py-3 text-slate-800 outline-none focus:border-[#38b7b9]" />
                </div>
              </div>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-700">Reminder email</label>
                  <input type="email" name="interviewEmail" defaultValue={application.interviewEmail} placeholder="you@example.com" className="w-full rounded-2xl border border-[#e7d6dd] bg-white px-4 py-3 text-slate-800 outline-none focus:border-[#38b7b9]" />
                </div>
              </div>
              <p className="mt-4 text-sm text-slate-500">Email reminders use the address above. In-app reminders appear in ApplyFlow.</p>
              <div className="mt-3 flex flex-wrap gap-4 text-sm text-slate-700">
                {(["In-app", "Email"] as NotificationChannel[]).map((channel) => (
                  <label key={channel} className="flex items-center gap-2">
                    <input type="checkbox" name="notificationChannel" value={channel} defaultChecked={(application.notificationChannels || ["In-app"]).includes(channel)} />
                    {channel}
                  </label>
                ))}
              </div>
            </fieldset>
          ) : null}

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
