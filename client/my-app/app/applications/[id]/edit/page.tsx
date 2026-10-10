"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { getApplicationById, getStoredApplications, saveApplications } from "@/lib/mock-data";
import type { Application, InterviewType, NotificationChannel } from "@/lib/types";
import { cancelExternalInterviewNotifications, sendExternalInterviewNotifications } from "@/lib/notification-api";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:5000";

export default function EditApplicationPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [application, setApplication] = useState<Application | null>(null);
  const [status, setStatus] = useState<Application["status"]>("Saved");
  const [interviewType, setInterviewType] = useState<InterviewType | "">("");
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [saveError, setSaveError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const savingRef = useRef(false);

  useEffect(() => {
    let isMounted = true;
    const fallbackApplication = getApplicationById(params?.id);

    async function loadApplication() {
      const token = window.localStorage.getItem("applyflow_token");

      if (!token) {
        if (isMounted) {
          setApplication(fallbackApplication);
          setStatus(fallbackApplication?.status ?? "Saved");
          setInterviewType(fallbackApplication?.interviewType ?? "");
          setIsLoading(false);
        }
        return;
      }

      try {
        const response = await fetch(`${API_URL}/api/applications/${encodeURIComponent(String(params?.id || ""))}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const payload = (await response.json().catch(() => ({}))) as {
          application?: Application;
          message?: string;
        };

        if (!response.ok) {
          if (isMounted) {
            setErrorMessage(response.status === 404 ? "Application not found." : payload.message || "Unable to load application.");
          }
          return;
        }

        if (isMounted) {
          const loadedApplication = payload.application ?? fallbackApplication;
          setApplication(loadedApplication);
          setStatus(loadedApplication?.status ?? "Saved");
          setInterviewType(loadedApplication?.interviewType ?? "");
        }
      } catch {
        if (isMounted) {
          setErrorMessage("Unable to connect to the server. Please try again.");
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    void loadApplication();
    return () => {
      isMounted = false;
    };
  }, [params?.id]);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (savingRef.current) return;
    if (!application) return;

    const form = new FormData(event.currentTarget);
    const nextStatus = String(form.get("status") || application.status) as Application["status"];
    const interviewDate = String(form.get("interviewDate") || "").trim();
    const interviewTime = String(form.get("interviewTime") || "").trim();
    const interviewTypeValue = String(form.get("interviewType") || "").trim();
    const interviewLocation = String(form.get("interviewLocation") || "").trim();
    const normalizedInterviewType = interviewTypeValue as InterviewType;
    const applicationLink = String(form.get("applicationLink") || "").trim();
    const notificationChannels = form.getAll("notificationChannel") as NotificationChannel[];
    const savedChannels: NotificationChannel[] = notificationChannels.includes("In-app") ? ["In-app"] : ["In-app"];

    if (nextStatus === "Interview" && (!interviewDate || !interviewTime || !interviewTypeValue)) {
      setSaveError("Add the interview date, time, and type before saving an interview application.");
      return;
    }
    if (applicationLink && !/^https?:\/\//i.test(applicationLink)) {
      setSaveError("The application link must start with http:// or https://.");
      return;
    }

    const token = window.localStorage.getItem("applyflow_token");
    let notificationNotice = "";
    setIsSaving(true);
    savingRef.current = true;
    setSaveError("");

    if (token) {
      try {
        const response = await fetch(`${API_URL}/api/applications/${encodeURIComponent(application.id)}`, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            company: String(form.get("company") || application.company).trim(),
            position: String(form.get("position") || application.position).trim(),
            date: String(form.get("date") || application.date),
            type: String(form.get("type") || application.type) as Application["type"],
            status: nextStatus,
            arrangement: String(form.get("arrangement") || application.arrangement) as Application["arrangement"],
            notes: String(form.get("notes") || application.notes).trim(),
            applicationLink: applicationLink || undefined,
            ...(nextStatus === "Interview"
              ? { interviewDate, interviewTime, interviewType: normalizedInterviewType, interviewLocation, notificationChannels: savedChannels }
              : { interviewDate: undefined, interviewTime: undefined, interviewType: undefined, notificationChannels: undefined, interviewEmail: undefined }),
          }),
        });
        const payload = (await response.json().catch(() => ({}))) as {
          message?: string;
          notificationSchedule?: { message?: string };
        };

        if (!response.ok) {
          setSaveError(payload.message || "Unable to save application and schedule its reminder.");
          setIsSaving(false);
          savingRef.current = false;
          return;
        }
        notificationNotice = payload.notificationSchedule?.message || "";
      } catch (error) {
        setSaveError(error instanceof Error ? error.message : "Unable to connect to the server.");
        setIsSaving(false);
        savingRef.current = false;
        return;
      }
    }

    const updatedApplications = getStoredApplications().map((item) => {
      if (String(item.id) !== String(application.id)) return item;
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
        ...(nextStatus === "Interview"
          ? { interviewDate, interviewTime, interviewType: normalizedInterviewType, interviewLocation, notificationChannels: savedChannels, interviewEmail: undefined }
          : { interviewDate: undefined, interviewTime: undefined, interviewType: undefined, notificationChannels: undefined, interviewEmail: undefined }),
      };
    });
    saveApplications(updatedApplications);

    try {
      if (nextStatus === "Interview") {
        if (token) {
          if (notificationNotice) window.sessionStorage.setItem("applyflow_delivery_notice", notificationNotice);
        } else {
          const delivery = await sendExternalInterviewNotifications({
            applicationId: application.id,
            company: String(form.get("company") || application.company).trim(),
            position: String(form.get("position") || application.position).trim(),
            interviewDate,
            interviewTime,
            interviewType: normalizedInterviewType,
            applicationLink,
            notificationChannels: savedChannels,
          });
          window.sessionStorage.setItem("applyflow_delivery_notice", delivery.message);
        }
      } else {
        await cancelExternalInterviewNotifications(application.id);
      }
    } catch {
      window.sessionStorage.setItem("applyflow_delivery_notice", "Application saved, but its reminder could not be updated.");
    }
    router.push(`/applications/${application.id}`);
  };

  if (isLoading) {
    return <AppShell title="Edit Application"><div className="rounded-[28px] border border-dashed border-[#e7d6dd] bg-white/70 p-10 text-center text-slate-500">Loading application...</div></AppShell>;
  }
  if (errorMessage) {
    return <AppShell title="Edit Application"><div className="rounded-[28px] border border-dashed border-[#e7d6dd] bg-white/70 p-10 text-center text-slate-500">{errorMessage}</div></AppShell>;
  }
  if (!application) {
    return <AppShell title="Edit Application"><div className="rounded-[28px] border border-dashed border-[#e7d6dd] bg-white/70 p-10 text-center text-slate-500">Application not found.</div></AppShell>;
  }

  return (
    <AppShell title="Edit Application">
      <div className="mx-auto max-w-3xl rounded-[28px] border border-white/60 bg-white/80 p-5 shadow-[0_10px_30px_rgba(203,213,225,0.26)] sm:p-8">
        <div className="mb-6 flex items-center justify-between gap-3">
          <h2 className="text-2xl font-bold text-slate-800">Edit Application</h2>
          <Link href={`/applications/${application.id}`} className="text-sm font-medium text-[#0f766e]">View details</Link>
        </div>
        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="grid gap-5 md:grid-cols-2">
            <div><label className="mb-2 block text-sm font-medium text-slate-700">Company Name</label><input name="company" defaultValue={application.company} className="w-full rounded-2xl border border-[#e7d6dd] bg-[#fffafc] px-4 py-3 text-slate-800 outline-none focus:border-[#38b7b9]" /></div>
            <div className="md:col-span-2"><label className="mb-2 block text-sm font-medium text-slate-700">Job post link (optional)</label><input type="url" name="applicationLink" defaultValue={application.applicationLink} placeholder="https://company.com/jobs/role" className="w-full rounded-2xl border border-[#e7d6dd] bg-[#fffafc] px-4 py-3 text-slate-800 outline-none focus:border-[#38b7b9]" /></div>
            <div><label className="mb-2 block text-sm font-medium text-slate-700">Position / Job Title</label><input name="position" defaultValue={application.position} className="w-full rounded-2xl border border-[#e7d6dd] bg-[#fffafc] px-4 py-3 text-slate-800 outline-none focus:border-[#38b7b9]" /></div>
            <div><label className="mb-2 block text-sm font-medium text-slate-700">Application Date</label><input type="date" name="date" defaultValue={application.date} className="w-full rounded-2xl border border-[#e7d6dd] bg-[#fffafc] px-4 py-3 text-slate-800 outline-none focus:border-[#38b7b9]" /></div>
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">Application Type</label>
              <select name="type" defaultValue={application.type} className="w-full rounded-2xl border border-[#e7d6dd] bg-[#fffafc] px-4 py-3 text-slate-800 outline-none focus:border-[#38b7b9]">
                <option>Internship</option><option>WIL</option><option>Graduate Job</option><option>Full-Time Job</option><option>Job</option>
              </select>
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">Application Status</label>
              <select name="status" value={status} onChange={(event) => {
                setStatus(event.target.value as Application["status"]);
                if (event.target.value !== "Interview") setInterviewType("");
              }} className="w-full rounded-2xl border border-[#e7d6dd] bg-[#fffafc] px-4 py-3 text-slate-800 outline-none focus:border-[#38b7b9]">
                <option>Saved</option><option>Applied</option><option>Assessment</option><option>Shortlisted</option><option>Interview</option><option>Offer</option><option>Rejected</option><option>Withdrawn</option>
              </select>
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">Work Arrangement</label>
              <select name="arrangement" defaultValue={application.arrangement} className="w-full rounded-2xl border border-[#e7d6dd] bg-[#fffafc] px-4 py-3 text-slate-800 outline-none focus:border-[#38b7b9]">
                <option>Remote</option><option>Hybrid</option><option>Onsite</option>
              </select>
            </div>
          </div>
          {status === "Interview" ? (
            <fieldset className="rounded-2xl border border-[#d9d3ff] bg-[#faf8ff] p-4">
              <legend className="px-1 text-sm font-semibold text-[#5d4b9f]">Interview schedule and reminders</legend>
              <div className="grid gap-5 sm:grid-cols-2">
                <div><label className="mb-2 block text-sm font-medium text-slate-700">Interview date</label><input required type="date" name="interviewDate" defaultValue={application.interviewDate} className="w-full rounded-2xl border border-[#e7d6dd] bg-white px-4 py-3 text-slate-800 outline-none focus:border-[#38b7b9]" /></div>
                <div><label className="mb-2 block text-sm font-medium text-slate-700">Interview time</label><input required type="time" name="interviewTime" defaultValue={application.interviewTime} className="w-full rounded-2xl border border-[#e7d6dd] bg-white px-4 py-3 text-slate-800 outline-none focus:border-[#38b7b9]" /></div>
                <div className="sm:col-span-2">
                  <label className="mb-2 block text-sm font-medium text-slate-700">Type of interview</label>
                  <select required name="interviewType" value={interviewType} onChange={(event) => setInterviewType(event.target.value as InterviewType | "")} className="w-full rounded-2xl border border-[#e7d6dd] bg-white px-4 py-3 text-slate-800 outline-none focus:border-[#38b7b9]">
                    <option value="">Select interview type</option><option>Phone</option><option>Video</option><option>In-person</option><option>Technical</option><option>Panel</option><option>Other</option>
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
                      defaultValue={application.interviewLocation || ""}
                      placeholder="Company Name, Building Name, Street, Suburb, City"
                      className="w-full rounded-2xl border border-[#e7d6dd] bg-white px-4 py-3 text-slate-800 outline-none focus:border-[#38b7b9]"
                    />
                  </div>
                ) : null}
              </div>
              <p className="mt-4 text-sm text-slate-500">In-app reminders appear in ApplyFlow.</p>
              <label className="mt-3 flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" name="notificationChannel" value="In-app" defaultChecked={(application.notificationChannels || ["In-app"]).includes("In-app")} />In-app</label>
            </fieldset>
          ) : null}
          <div><label className="mb-2 block text-sm font-medium text-slate-700">Notes</label><textarea name="notes" defaultValue={application.notes} rows={5} className="w-full rounded-2xl border border-[#e7d6dd] bg-[#fffafc] px-4 py-3 text-slate-800 outline-none focus:border-[#38b7b9]" /></div>
          {saveError ? <div role="alert" className="rounded-2xl border border-[#f8c8d5] bg-[#fff4f7] px-4 py-3 text-sm text-[#b3506e]">{saveError}</div> : null}
          <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
            <Link href={`/applications/${application.id}`} className="inline-flex items-center justify-center rounded-full border border-[#e7d6dd] bg-white px-5 py-3 text-sm font-semibold text-slate-700">Cancel</Link>
            <button type="submit" disabled={isSaving} className="rounded-full bg-[#1db7b5] px-5 py-3 text-sm font-semibold text-white shadow-sm hover:bg-[#169a9a] disabled:cursor-not-allowed disabled:opacity-60">{isSaving ? "Saving..." : "Save Changes"}</button>
          </div>
        </form>
      </div>
    </AppShell>
  );
}