import type { Application } from "@/lib/types";

export type ActionPriority = "Urgent" | "High" | "Medium" | "Low";
export type ActionKind =
  | "upcoming-interview"
  | "urgent-follow-up"
  | "past-interview"
  | "follow-up"
  | "interview-details"
  | "saved-opportunity";

export interface ActionRecommendation {
  key: string;
  kind: ActionKind;
  company: string;
  position: string;
  reason: string;
  priority: ActionPriority;
  href: string;
  sortDate: number;
}

const DAY_IN_MILLISECONDS = 24 * 60 * 60 * 1000;
const FOLLOW_UP_STATUSES = new Set(["Applied", "Assessment", "Shortlisted"]);

function parseDateOnly(value: string | undefined): number | null {
  if (!value) {
    return null;
  }

  const match = /^(\d{4})-(\d{2})-(\d{2})(?:$|T)/.exec(value.trim());
  if (!match) {
    return null;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const timestamp = Date.UTC(year, month - 1, day);
  const date = new Date(timestamp);

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  return timestamp;
}

function getCalendarDay(timestamp: number): number {
  const date = new Date(timestamp);
  return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
}

function formatCalendarDate(timestamp: number): string {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeZone: "UTC",
  }).format(timestamp);
}

function describeDaysUntilInterview(daysUntil: number): string {
  if (daysUntil === 0) {
    return "Interview today";
  }

  if (daysUntil === 1) {
    return "Interview tomorrow";
  }

  return `Interview in ${daysUntil} days`;
}

export function getActionRecommendations(
  applications: Application[],
  today = new Date()
): ActionRecommendation[] {
  const todayCalendarDay = getCalendarDay(today.getTime());
  const actions: ActionRecommendation[] = [];

  for (const application of applications) {
    const company = application.company?.trim() || "Company not specified";
    const position = application.position?.trim() || "Position not specified";
    const href = `/applications/${encodeURIComponent(application.id)}`;

    if (FOLLOW_UP_STATUSES.has(application.status)) {
      const applicationDate = parseDateOnly(application.date);
      if (applicationDate !== null) {
        const daysSinceApplied = Math.floor(
          (todayCalendarDay - applicationDate) / DAY_IN_MILLISECONDS
        );

        if (daysSinceApplied >= 7) {
          const isUrgent = daysSinceApplied >= 14;
          actions.push({
            key: `${application.id}-follow-up`,
            kind: isUrgent ? "urgent-follow-up" : "follow-up",
            company,
            position,
            reason: `This application has been in ${application.status} for ${daysSinceApplied} days. Consider following up.`,
            priority: isUrgent ? "Urgent" : "Medium",
            href,
            sortDate: applicationDate,
          });
        }
      }
    }

    if (application.status === "Interview") {
      const interviewDate = parseDateOnly(application.interviewDate);
      if (interviewDate === null) {
        actions.push({
          key: `${application.id}-interview-details`,
          kind: "interview-details",
          company,
          position,
          reason:
            "No valid interview date is saved. Confirm the interview details in this application.",
          priority: "Medium",
          href,
          sortDate: Number.MAX_SAFE_INTEGER,
        });
        continue;
      }

      const daysUntil = Math.floor(
        (interviewDate - todayCalendarDay) / DAY_IN_MILLISECONDS
      );
      if (daysUntil < 0) {
        actions.push({
          key: `${application.id}-past-interview`,
          kind: "past-interview",
          company,
          position,
          reason:
            "The saved interview date has passed. Review the application status and update it if needed.",
          priority: "High",
          href,
          sortDate: interviewDate,
        });
      } else if (daysUntil <= 14) {
        const time = application.interviewTime?.trim();
        const dateAndTime = `${formatCalendarDate(interviewDate)}${time ? ` at ${time}` : ""}`;
        actions.push({
          key: `${application.id}-upcoming-interview`,
          kind: "upcoming-interview",
          company,
          position,
          reason: `${describeDaysUntilInterview(daysUntil)} - ${dateAndTime}.`,
          priority: daysUntil <= 1 ? "High" : "Medium",
          href,
          sortDate: interviewDate,
        });
      }
    }

    if (application.status === "Saved") {
      actions.push({
        key: `${application.id}-saved-opportunity`,
        kind: "saved-opportunity",
        company,
        position,
        reason: "Review this saved opportunity and decide whether to apply.",
        priority: "Low",
        href,
        sortDate: Number.MAX_SAFE_INTEGER,
      });
    }
  }

  const kindOrder: Record<ActionKind, number> = {
    "upcoming-interview": 0,
    "urgent-follow-up": 1,
    "past-interview": 2,
    "follow-up": 3,
    "interview-details": 4,
    "saved-opportunity": 5,
  };

  return actions
    .sort(
      (first, second) =>
        kindOrder[first.kind] - kindOrder[second.kind] ||
        first.sortDate - second.sortDate ||
        first.company.localeCompare(second.company)
    )
    .slice(0, 5);
}
