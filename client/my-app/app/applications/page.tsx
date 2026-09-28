"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AppShell, SectionTitle, StatusBadge } from "@/components/app-shell";
import { getStoredApplications } from "@/lib/mock-data";
import type { Application, ApplicationStatus, ApplicationType, WorkArrangement } from "@/lib/types";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";

const statusOptions: Array<ApplicationStatus | "All"> = [
  "All",
  "Saved",
  "Applied",
  "Assessment",
  "Shortlisted",
  "Interview",
  "Offer",
  "Rejected",
  "Withdrawn",
];

const typeOptions: Array<ApplicationType | "All"> = [
  "All",
  "Internship",
  "WIL",
  "Graduate Job",
  "Full-Time Job",
  "Job",
];

const arrangementOptions: Array<WorkArrangement | "All"> = ["All", "Remote", "Hybrid", "Onsite"];

export default function ApplicationsPage() {
  const [applications, setApplications] = useState<Application[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<ApplicationStatus | "All">("All");
  const [type, setType] = useState<ApplicationType | "All">("All");
  const [arrangement, setArrangement] = useState<WorkArrangement | "All">("All");

  useEffect(() => {
    let isMounted = true;

    async function loadApplications() {
      const token = window.localStorage.getItem("applyflow_token");

      if (!token) {
        if (isMounted) {
          setApplications(getStoredApplications());
          setError("");
          setIsLoading(false);
        }
        return;
      }

      try {
        const response = await fetch(`${API_URL}/api/applications`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        const payload = (await response.json().catch(() => ({ applications: [] }))) as {
          applications?: Application[];
          message?: string;
        };

        if (!response.ok) {
          if (isMounted) {
            setApplications(getStoredApplications());
            setError(payload.message || "Unable to load your applications.");
            setIsLoading(false);
          }
          return;
        }

        if (isMounted) {
          setApplications(payload.applications || getStoredApplications());
          setError("");
          setIsLoading(false);
        }
      } catch {
        if (isMounted) {
          setApplications(getStoredApplications());
          setError("Unable to connect to the server. Showing saved local applications.");
          setIsLoading(false);
        }
      }
    }

    loadApplications();

    return () => {
      isMounted = false;
    };
  }, []);

  const filteredApplications = useMemo(() => {
    return applications.filter((application) => {
      const matchesSearch =
        application.company.toLowerCase().includes(search.toLowerCase()) ||
        application.position.toLowerCase().includes(search.toLowerCase());
      const matchesStatus = status === "All" || application.status === status;
      const matchesType = type === "All" || application.type === type;
      const matchesArrangement = arrangement === "All" || application.arrangement === arrangement;

      return matchesSearch && matchesStatus && matchesType && matchesArrangement;
    });
  }, [applications, search, status, type, arrangement]);

  return (
    <AppShell title="Applications">
      <div className="space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <SectionTitle title="Applications" />
          <Link
            href="/applications/new"
            className="inline-flex items-center justify-center rounded-full bg-[#2ec4c0] px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#1ca3a5]"
          >
            Add Application
          </Link>
        </div>

        <div className="grid gap-3 rounded-[28px] border border-white/60 bg-white/80 p-4 shadow-[0_10px_30px_rgba(203,213,225,0.26)] md:grid-cols-4">
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="rounded-2xl border border-[#e7d6dd] bg-[#fffafc] px-4 py-3 text-sm text-slate-700 outline-none focus:border-[#38b7b9]"
            placeholder="Search company or role"
          />

          <select
            value={status}
            onChange={(event) => setStatus(event.target.value as ApplicationStatus | "All")}
            className="rounded-2xl border border-[#e7d6dd] bg-[#fffafc] px-4 py-3 text-sm text-slate-700 outline-none focus:border-[#38b7b9]"
          >
            {statusOptions.map((option) => (
              <option key={option} value={option}>{option === "All" ? "All statuses" : option}</option>
            ))}
          </select>

          <select
            value={type}
            onChange={(event) => setType(event.target.value as ApplicationType | "All")}
            className="rounded-2xl border border-[#e7d6dd] bg-[#fffafc] px-4 py-3 text-sm text-slate-700 outline-none focus:border-[#38b7b9]"
          >
            {typeOptions.map((option) => (
              <option key={option} value={option}>{option === "All" ? "All types" : option}</option>
            ))}
          </select>

          <select
            value={arrangement}
            onChange={(event) => setArrangement(event.target.value as WorkArrangement | "All")}
            className="rounded-2xl border border-[#e7d6dd] bg-[#fffafc] px-4 py-3 text-sm text-slate-700 outline-none focus:border-[#38b7b9]"
          >
            {arrangementOptions.map((option) => (
              <option key={option} value={option}>{option === "All" ? "All arrangements" : option}</option>
            ))}
          </select>
        </div>

        {error ? (
          <div className="rounded-2xl border border-[#f8c8d5] bg-[#fff4f7] px-4 py-3 text-sm text-[#b3506e]">
            {error}
          </div>
        ) : null}

        <div className="space-y-3">
          {isLoading ? (
            <div className="rounded-[28px] border border-dashed border-[#e7d6dd] bg-white/70 p-10 text-center text-slate-500">
              Loading applications...
            </div>
          ) : filteredApplications.length > 0 ? (
            filteredApplications.map((application) => (
              <div key={application.id} className="rounded-[28px] border border-white/60 bg-white/80 p-4 shadow-[0_10px_30px_rgba(203,213,225,0.26)]">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-xl font-semibold text-slate-800">{application.company}</p>
                      <StatusBadge status={application.status} />
                    </div>
                    <p className="mt-1 text-sm text-slate-500">{application.position}</p>
                    <div className="mt-2 flex flex-wrap gap-3 text-xs text-slate-500">
                      <span>{application.date}</span>
                      <span>{application.type}</span>
                      <span>{application.arrangement}</span>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <Link
                      href={`/applications/${application.id}`}
                      className="rounded-full border border-[#d9d3ff] bg-[#f6f1ff] px-3 py-2 text-sm font-medium text-[#4f46e5]"
                    >
                      View
                    </Link>
                    <Link
                      href={`/applications/${application.id}/edit`}
                      className="rounded-full border border-[#d0f4ef] bg-[#ebfffd] px-3 py-2 text-sm font-medium text-[#0f766e]"
                    >
                      Edit
                    </Link>
                    <Link
                      href={`/applications/${application.id}/delete`}
                      className="rounded-full border border-[#ffd6df] bg-[#fff3f6] px-3 py-2 text-sm font-medium text-[#b3506e]"
                    >
                      Delete
                    </Link>
                  </div>
                </div>
              </div>
            ))
          ) : (
            <div className="rounded-[28px] border border-dashed border-[#e7d6dd] bg-white/70 p-10 text-center text-slate-500">
              No applications yet. Create your first one to start tracking your job search.
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}
