"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { getStoredApplications, saveApplications } from "@/lib/mock-data";
import type { Application, InterviewType, NotificationChannel } from "@/lib/types";
import { sendExternalInterviewNotifications } from "@/lib/notification-api";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";

export default function AddApplicationPage() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [interviewType, setInterviewType] = useState<InterviewType | "">("");
  const [isSaving, setIsSaving] = useState(false);
  const savingRef = useRef(false);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (savingRef.current) return;
    const form = new FormData(event.currentTarget);

    const company = String(form.get("company") || "").trim();
    const position = String(form.get("position") || "").trim();
    const date = String(form.get("date") || "").trim();
    const type = String(form.get("type") || "");
    const applicationStatus = String(form.get("status") || "");
    const arrangement = String(form.get("arrangement") || "");
    const notes = String(form.get("notes") || "").trim();
    const applicationLink = String(form.get("applicationLink") || "").trim();
    const interviewDate = String(form.get("interviewDate") || "").trim();
    const interviewTime = String(form.get("interviewTime") || "").trim();
    const interviewTypeValue = String(form.get("interviewType") || "").trim();
    const interviewLocation = String(form.get("interviewLocation") || "").trim();
    const normalizedInterviewType = interviewTypeValue as InterviewType;
    const notificationChannels = form.getAll("notificationChannel") as NotificationChannel[];

    if (!company || !position || !date || !type || !applicationStatus || !arrangement || !notes) {
      setError("Please complete all required fields.");
      return;
    }

    if (applicationLink && !/^https?:\/\//i.test(applicationLink)) {
      setError("The application link must start with http:// or https://.");
      return;
    }

    if (applicationStatus === "Interview" && (!interviewDate || !interviewTime || !interviewTypeValue)) {
      setError("Add the interview date, time, and type before saving an interview application.");
      return;
    }

    setIsSaving(true);
    savingRef.current = true;
    setError("");
    const applications = getStoredApplications();
    const applicationId = `app-${Date.now()}`;
    const defaultInterviewChannels: NotificationChannel[] = ["In-app"];
    const selectedChannels = notificationChannels.filter((channel) => channel === "In-app");
    const payload: Application = {
      id: applicationId,
      company,
      position,
      date,
      type: type as Application["type"],
      status: applicationStatus as Application["status"],
      arrangement: arrangement as Application["arrangement"],
      notes,
      ...(applicationLink ? { applicationLink } : {}),
      ...(applicationStatus === "Interview"
        ? {
            interviewDate,
            interviewTime,
            interviewType: normalizedInterviewType,
            ...(interviewLocation ? { interviewLocation } : {}),
            notificationChannels: selectedChannels.length ? selectedChannels : defaultInterviewChannels,
          }
        : {}),
    };

    const token = window.localStorage.getItem("applyflow_token");
    let notificationApplicationId = applicationId;
    let notificationNotice = "";

    if (token) {
      try {
        const response = await fetch(`${API_URL}/api/applications`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(payload),
        });

        const data = (await response.json().catch(() => ({ message: "Unable to save application." }))) as {
          message?: string;
          application?: Pick<Application, "id">;
          notificationSchedule?: { message?: string };
        };

        if (!response.ok) {
          throw new Error(data.message || "Unable to save application.");
        }

        const savedApplication = data.application?.id
          ? { ...payload, id: String(data.application.id) }
          : payload;
        notificationApplicationId = savedApplication.id;
        notificationNotice = data.notificationSchedule?.message || "";
        saveApplications([...applications, savedApplication]);
      } catch (saveError) {
        setError(saveError instanceof Error ? saveError.message : "Unable to save application.");
        setIsSaving(false);
        savingRef.current = false;
        return;
      }
    } else {
      saveApplications([...applications, payload]);
    }

    setError("");
    if (applicationStatus === "Interview") {
      if (token) {
        if (notificationNotice) {
          window.sessionStorage.setItem("applyflow_delivery_notice", notificationNotice);
        }
      } else {
        try {
          const delivery = await sendExternalInterviewNotifications({
            applicationId: notificationApplicationId,
            company,
            position,
            interviewDate,
            interviewTime,
            interviewType: normalizedInterviewType,
            applicationLink,
            notificationChannels: selectedChannels.length ? selectedChannels : defaultInterviewChannels,
          });
          window.sessionStorage.setItem("applyflow_delivery_notice", delivery.message);
        } catch {
          window.sessionStorage.setItem("applyflow_delivery_notice", "Application saved, but its reminder could not be scheduled.");
        }
      }
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
              <select name="status" value={status} onChange={(event) => {
                setStatus(event.target.value);
                if (event.target.value !== "Interview") setInterviewType("");
              }} className="w-full rounded-2xl border border-[#e7d6dd] bg-[#fffafc] px-4 py-3 text-slate-800 outline-none focus:border-[#38b7b9]">
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

          {status === "Interview" ? (
            <InterviewFields interviewType={interviewType} onInterviewTypeChange={setInterviewType} />
          ) : null}

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
            <button type="submit" disabled={isSaving} className="rounded-full bg-[#1db7b5] px-5 py-3 text-sm font-semibold text-white shadow-sm hover:bg-[#169a9a] disabled:cursor-not-allowed disabled:opacity-60">
              {isSaving ? "Saving..." : "Save Application"}
            </button>
          </div>
        </form>
      </div>
    </AppShell>
  );
}

function InterviewFields({
  interviewType,
  onInterviewTypeChange,
}: {
  interviewType: InterviewType | "";
  onInterviewTypeChange: (value: InterviewType | "") => void;
}) {
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
        <div className="sm:col-span-2">
          <label className="mb-2 block text-sm font-medium text-slate-700">Type of interview</label>
          <select required name="interviewType" value={interviewType} onChange={(event) => onInterviewTypeChange(event.target.value as InterviewType | "")} className="w-full rounded-2xl border border-[#e7d6dd] bg-white px-4 py-3 text-slate-800 outline-none focus:border-[#38b7b9]">
            <option value="">Select interview type</option>
            <option>Phone</option>
            <option>Video</option>
            <option>In-person</option>
            <option>Technical</option>
            <option>Panel</option>
            <option>Other</option>
          </select>
        </div>
        {interviewType === "In-person" ? (
          <div className="sm:col-span-2">
            <label htmlFor="interviewLocation" className="mb-2 block text-sm font-medium text-slate-700">
              Interview Location / Address <span className="font-normal text-slate-500">(optional)</span>
            </label>
            <textarea
              id="interviewLocation"
              name="interviewLocation"
              rows={2}
              placeholder="Company Name, Building Name, Street, Suburb, City"
              className="w-full rounded-2xl border border-[#e7d6dd] bg-white px-4 py-3 text-slate-800 outline-none focus:border-[#38b7b9]"
            />
          </div>
        ) : null}
      </div>
      <p className="mt-4 text-sm text-slate-500">In-app reminders appear in ApplyFlow.</p>
      <div className="mt-3 flex flex-wrap gap-4 text-sm text-slate-700">
        <label className="flex items-center gap-2">
          <input type="checkbox" name="notificationChannel" value="In-app" defaultChecked />
          In-app
        </label>
      </div>
    </fieldset>
  );
}