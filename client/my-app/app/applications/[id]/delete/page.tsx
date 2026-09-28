"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { getApplicationById, getStoredApplications, saveApplications } from "@/lib/mock-data";
import { cancelExternalInterviewNotifications } from "@/lib/notification-api";
import type { Application } from "@/lib/types";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:5000";

export default function DeleteApplicationPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [application, setApplication] = useState<Application | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function loadApplication() {
      const token = window.localStorage.getItem("applyflow_token");
      const fallbackApplication = getApplicationById(params?.id);

      if (!token) {
        if (isMounted) {
          setApplication(fallbackApplication ?? null);
        }
        return;
      }

      try {
        const response = await fetch(`${API_URL}/api/applications/${encodeURIComponent(String(params?.id || ""))}`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        const payload = (await response.json().catch(() => ({ message: "Unable to load application." }))) as {
          application?: Application;
          message?: string;
        };

        if (!response.ok) {
          if (isMounted) {
            setApplication(fallbackApplication ?? null);
          }
          return;
        }

        if (isMounted) {
          setApplication(payload.application ?? fallbackApplication ?? null);
        }
      } catch {
        if (isMounted) {
          setApplication(fallbackApplication ?? null);
        }
      }
    }

    void loadApplication();

    return () => {
      isMounted = false;
    };
  }, [params?.id]);

  const handleDelete = async () => {
    if (!application) {
      return;
    }

    const token = window.localStorage.getItem("applyflow_token");

    if (token) {
      try {
        const response = await fetch(`${API_URL}/api/applications/${encodeURIComponent(application.id)}`, {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (response.ok) {
          await cancelExternalInterviewNotifications(application.id);
          const filteredApplications = getStoredApplications().filter(
            (item) => String(item.id) !== String(application.id)
          );
          saveApplications(filteredApplications);
          router.push("/applications");
          return;
        }
      } catch {
        // Fall through to local delete if the backend is unavailable.
      }
    }

    await cancelExternalInterviewNotifications(application.id);
    const filteredApplications = getStoredApplications().filter(
      (item) => String(item.id) !== String(application.id)
    );
    saveApplications(filteredApplications);
    router.push("/applications");
  };

  if (!application) {
    return (
      <AppShell title="Delete Application">
        <div className="rounded-[28px] border border-dashed border-[#e7d6dd] bg-white/70 p-10 text-center text-slate-500">
          Application not found.
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell title="Delete Application">
      <div className="mx-auto max-w-xl rounded-[28px] border border-white/60 bg-white/80 p-6 shadow-[0_10px_30px_rgba(203,213,225,0.26)]">
        <h2 className="text-2xl font-bold text-slate-800">Delete application</h2>
        <p className="mt-4 text-slate-600">
          Are you sure you want to delete this application?
        </p>
        <div className="mt-5 rounded-2xl border border-[#f0e7ef] bg-[#fffafc] p-4">
          <p className="text-lg font-semibold text-slate-800">{application.company}</p>
          <p className="text-sm text-slate-500">{application.position}</p>
        </div>

        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-end">
          <Link href={`/applications/${application.id}`} className="inline-flex items-center justify-center rounded-full border border-[#e7d6dd] bg-white px-5 py-3 text-sm font-semibold text-slate-700">
            Cancel
          </Link>
          <button
            type="button"
            onClick={handleDelete}
            className="inline-flex items-center justify-center rounded-full bg-[#e11d48] px-5 py-3 text-sm font-semibold text-white shadow-sm hover:bg-[#be134a]"
          >
            Delete
          </button>
        </div>
      </div>
    </AppShell>
  );
}
