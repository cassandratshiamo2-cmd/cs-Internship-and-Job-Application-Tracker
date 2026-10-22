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
  applicationId: string;
  company: string;
  position: string;
  reason: string;
  priority: ActionPriority;
  href: string;
  sortDate: number;
  cycleKey: string;
}

const DAY_IN_MILLISECONDS = 24 * 60 * 60 * 1000;
const TIME_ZONE = "Africa/Johannesburg";
const FOLLOW_UP_STATUSES = new Set(["Applied", "Assessment", "Shortlisted"]);
const dateFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
const dateTimeFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

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
  const parts = dateFormatter.formatToParts(timestamp);
  const values = Object.fromEntries(
    parts.filter((part) => part.type !== "literal").map((part) => [part.type, part.value])
  );
  return Date.UTC(Number(values.year), Number(values.month) - 1, Number(values.day));
}

function getTimeZoneParts(timestamp: number) {
  const parts = dateTimeFormatter.formatToParts(timestamp);
  return Object.fromEntries(
    parts
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, Number(part.value)])
  );
}

function parseTime(value: string | undefined): { hour: number; minute: number } | null {
  if (!value) {
    return null;
  }

  const match = /^(\d{2}):(\d{2})(?::\d{2})?$/.exec(value.trim());
  if (!match) {
    return null;
  }

  const hour = Number(match[1]);
  const minute = Number(match[2]);
  return hour <= 23 && minute <= 59 ? { hour, minute } : null;
}

function getJohannesburgInstant(dateKey: string, time: string): number | null {
  const date = parseDateOnly(dateKey);
  const parsedTime = parseTime(time);
  if (date === null || !parsedTime) {
    return null;
  }

  const target = new Date(date);
  target.setUTCHours(parsedTime.hour, parsedTime.minute, 0, 0);
  let instant = target.getTime();

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const local = getTimeZoneParts(instant);
    const representedWallTime = Date.UTC(
      local.year,
      local.month - 1,
      local.day,
      local.hour,
      local.minute,
      local.second
    );
    const adjustment = target.getTime() - representedWallTime;
    if (adjustment === 0) {
      return instant;
    }
    instant += adjustment;
  }

  return null;
}

function formatCalendarDate(timestamp: number): string {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeZone: TIME_ZONE,
  }).format(timestamp);
}

function formatCalendarTime(timestamp: number): string {
  return new Intl.DateTimeFormat("en", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: TIME_ZONE,
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
  today = new Date(),
  actionStates: Record<string, { state: "completed" | "snoozed"; snoozedUntil?: string }> = {}
): ActionRecommendation[] {
  const todayCalendarDay = getCalendarDay(today.getTime());
  const actions: ActionRecommendation[] = [];

  for (const application of applications) {
    const company = application.company?.trim() || "Company not specified";
    const position = application.position?.trim() || "Position not specified";
    const href = `/applications/${encodeURIComponent(application.id)}`;

    if (FOLLOW_UP_STATUSES.has(application.status)) {
      const activity = application.recruitmentActivityAt
        ? Date.parse(application.recruitmentActivityAt)
        : parseDateOnly(application.date);
      if (activity !== null && Number.isFinite(activity)) {
        const activityCalendarDay = getCalendarDay(activity);
        const daysSinceApplied = Math.floor(
          (todayCalendarDay - activityCalendarDay) / DAY_IN_MILLISECONDS
        );

        if (daysSinceApplied >= 7) {
          const isUrgent = daysSinceApplied >= 14;
          const kind = isUrgent ? "urgent-follow-up" : "follow-up";
          const cycleKey = `follow-up:${application.id}:${new Date(activity).toISOString()}`;
          if (!isActionSuppressed(actionStates[cycleKey], today)) {
            actions.push({
              key: `${application.id}-follow-up`,
              kind,
              applicationId: String(application.id),
              company,
              position,
              reason: `There has been no meaningful recruitment activity on this ${application.status} application for ${daysSinceApplied} days. Consider following up.`,
              priority: isUrgent ? "Urgent" : "Medium",
              href,
              sortDate: activity,
              cycleKey,
            });
          }
        }
      }
    }

    if (application.status === "Interview") {
      const interviewDate = parseDateOnly(application.interviewDate);
      const interviewTime = parseTime(application.interviewTime);
      if (interviewDate === null || !interviewTime) {
        const cycleKey = `interview-details:${application.id}:${application.interviewDate || "missing"}:${application.interviewTime || "missing"}`;
        actions.push({
          key: `${application.id}-interview-details`,
          kind: "interview-details",
          applicationId: String(application.id),
          company,
          position,
          reason:
            "The interview date or time is missing or invalid. Confirm the interview details in this application.",
          priority: "Medium",
          href,
          sortDate: Number.MAX_SAFE_INTEGER,
          cycleKey,
        });
        continue;
      }

      const interviewInstant = getJohannesburgInstant(
        application.interviewDate!,
        application.interviewTime!
      );
      if (interviewInstant === null) {
        continue;
      }
      const interviewCalendarDay = getCalendarDay(interviewInstant);
      const daysUntil = Math.floor(
        (interviewCalendarDay - todayCalendarDay) / DAY_IN_MILLISECONDS
      );
      const cycleKey = `interview:${application.id}:${interviewInstant}`;
      if (interviewInstant <= today.getTime()) {
        if (isActionSuppressed(actionStates[cycleKey], today)) {
          continue;
        }
        actions.push({
          key: `${application.id}-past-interview`,
          kind: "past-interview",
          applicationId: String(application.id),
          company,
          position,
          reason:
            "The saved interview time has passed. Review the application status and update it if needed.",
          priority: "High",
          href,
          sortDate: interviewInstant,
          cycleKey,
        });
      } else if (daysUntil <= 14) {
        if (isActionSuppressed(actionStates[cycleKey], today)) {
          continue;
        }
        const dateAndTime = `${formatCalendarDate(interviewInstant)} at ${formatCalendarTime(interviewInstant)}`;
        actions.push({
          key: `${application.id}-upcoming-interview`,
          kind: "upcoming-interview",
          applicationId: String(application.id),
          company,
          position,
          reason: `${describeDaysUntilInterview(daysUntil)} - ${dateAndTime}.`,
          priority: daysUntil <= 1 ? "High" : "Medium",
          href,
          sortDate: interviewInstant,
          cycleKey,
        });
      }
    }

    if (application.status === "Saved") {
      const cycleKey = `saved:${application.id}`;
      if (!isActionSuppressed(actionStates[cycleKey], today)) {
        actions.push({
          key: `${application.id}-saved-opportunity`,
          kind: "saved-opportunity",
          applicationId: String(application.id),
          company,
          position,
          reason: "Review this saved opportunity and decide whether to apply.",
          priority: "Low",
          href,
          sortDate: Number.MAX_SAFE_INTEGER,
          cycleKey,
        });
      }
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
    .filter((action, index) => actions.findIndex((candidate) => candidate.key === action.key) === index)
    .sort(
      (first, second) =>
        kindOrder[first.kind] - kindOrder[second.kind] ||
        first.sortDate - second.sortDate ||
        first.company.localeCompare(second.company)
    )
    .slice(0, 5);
}

function isActionSuppressed(
  state: { state: "completed" | "snoozed"; snoozedUntil?: string } | undefined,
  now: Date
) {
  if (!state) {
    return false;
  }
  if (state.state === "completed") {
    return true;
  }
  const snoozedUntil = state.snoozedUntil ? Date.parse(state.snoozedUntil) : NaN;
  return Number.isFinite(snoozedUntil) && snoozedUntil > now.getTime();
}
