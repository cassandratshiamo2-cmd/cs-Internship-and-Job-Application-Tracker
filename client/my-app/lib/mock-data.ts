import type {
  Application,
  Interview,
  NotificationItem,
} from "@/lib/types";

const APPLICATIONS_KEY = "applyflow_applications";
const INTERVIEWS_KEY = "applyflow_interviews";
const NOTIFICATIONS_KEY = "applyflow_notifications";
const USER_KEY = "applyflow_user";
const USER_CHANGE_EVENT = "applyflow-user-change";

function addDaysToDate(days: number) {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

export const defaultApplications: Application[] = [
  {
    id: "app-demo-1",
    company: "Northwind Labs",
    position: "Frontend Developer Intern",
    date: "2026-09-12",
    type: "Internship",
    status: "Interview",
    arrangement: "Remote",
    notes: "Strong fit for product design and accessibility work.",
    applicationLink: "https://example.com/jobs/frontend-intern",
    interviewDate: "2026-09-30",
    interviewTime: "14:00",
    interviewType: "Video",
    notificationChannels: ["In-app"],
  },
  {
    id: "app-demo-2",
    company: "Sunset Systems",
    position: "Graduate Software Engineer",
    date: "2026-09-08",
    type: "Graduate Job",
    status: "Applied",
    arrangement: "Hybrid",
    notes: "Follow up with recruiter in one week.",
    applicationLink: "https://example.com/jobs/graduate-software-engineer",
  },
  {
    id: "app-demo-3",
    company: "Harbor Health",
    position: "Product Analyst",
    date: "2026-09-04",
    type: "Full-Time Job",
    status: "Shortlisted",
    arrangement: "Onsite",
    notes: "Portfolio review passed. Hiring manager call scheduled.",
    applicationLink: "https://example.com/jobs/product-analyst",
  },
];

const seedApplications: Application[] = defaultApplications;

const seedInterviews: Interview[] = [
  {
    id: "int-1",
    company: "Northstar Labs",
    position: "Frontend Engineer Intern",
    date: addDaysToDate(1),
    time: "10:00 AM",
    type: "Video",
    status: "Upcoming",
    details: "Portfolio review with the engineering manager.",
  },
  {
    id: "int-2",
    company: "Apex Systems",
    position: "Product Analyst",
    date: addDaysToDate(3),
    time: "2:30 PM",
    type: "Panel",
    status: "Upcoming",
    details: "Panel discussion with product and business stakeholders.",
  },
  {
    id: "int-3",
    company: "Launchpad AI",
    position: "Graduate Software Engineer",
    date: addDaysToDate(9),
    time: "9:15 AM",
    type: "Technical",
    status: "Upcoming",
    details: "Technical coding exercise and system design discussion.",
  },
];

function buildInterviewNotifications(interviews: Interview[]): NotificationItem[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return interviews
    .filter((interview) => {
      const interviewDate = new Date(`${interview.date}T00:00:00`);
      const diffInDays = Math.round((interviewDate.getTime() - today.getTime()) / 86400000);
      return diffInDays >= 0 && diffInDays <= 7;
    })
    .map((interview) => ({
      id: `notify-${interview.id}`,
      title: `Interview reminder: ${interview.company}`,
      type: "Interview Reminder",
      message: `${interview.position} interview is coming up on ${interview.date} at ${interview.time}.`,
      date: interview.date,
      read: false,
    }));
}

export function getCurrentUser() {
  if (typeof window === "undefined") {
    return null;
  }

  const rawUser = window.localStorage.getItem(USER_KEY);
  if (!rawUser) {
    return null;
  }

  try {
    const parsedUser = JSON.parse(rawUser);
    if (!parsedUser || typeof parsedUser !== "object") {
      window.localStorage.removeItem(USER_KEY);
      return null;
    }

    return parsedUser;
  } catch {
    window.localStorage.removeItem(USER_KEY);
    return null;
  }
}

export function setCurrentUser(user: { fullName?: string; email?: string; id?: number | string } | null) {
  if (typeof window === "undefined") {
    return;
  }

  if (!user) {
    window.localStorage.removeItem(USER_KEY);
    window.dispatchEvent(new Event(USER_CHANGE_EVENT));
    return;
  }

  window.localStorage.setItem(USER_KEY, JSON.stringify(user));
  window.dispatchEvent(new Event(USER_CHANGE_EVENT));
}

export function getCurrentUserName() {
  return getCurrentUser()?.fullName || "Your profile";
}

export function subscribeToUserChanges(listener: () => void) {
  if (typeof window === "undefined") {
    return () => {};
  }

  window.addEventListener(USER_CHANGE_EVENT, listener);
  window.addEventListener("storage", listener);
  return () => {
    window.removeEventListener(USER_CHANGE_EVENT, listener);
    window.removeEventListener("storage", listener);
  };
}

function getOrCreateStorage<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") {
    return fallback;
  }

  const rawValue = window.localStorage.getItem(key);
  if (!rawValue) {
    window.localStorage.setItem(key, JSON.stringify(fallback));
    return fallback;
  }

  try {
    const parsedValue = JSON.parse(rawValue);
    if (!parsedValue || typeof parsedValue !== "object") {
      throw new Error("Invalid storage payload");
    }
    return parsedValue as T;
  } catch {
    window.localStorage.setItem(key, JSON.stringify(fallback));
    return fallback;
  }
}

export function getStoredApplications(): Application[] {
  const applications = getOrCreateStorage(APPLICATIONS_KEY, seedApplications);
  const validApplications = applications.filter(
    (application) => !["app-101", "app-102", "app-103", "app-104", "app-105"].includes(String(application.id))
  );

  if (validApplications.length !== applications.length) {
    saveApplications(validApplications);
  }

  return validApplications;
}

export function getApplicationById(id: string | number | undefined): Application | null {
  if (id === undefined || id === null || String(id).trim() === "") {
    return null;
  }

  const normalizedId = String(id).trim();
  return getStoredApplications().find((application) => String(application.id) === normalizedId) ?? null;
}

export function saveApplications(applications: Application[]) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(APPLICATIONS_KEY, JSON.stringify(applications));
}

export function getStoredInterviews(): Interview[] {
  return getOrCreateStorage(INTERVIEWS_KEY, seedInterviews);
}

export function saveInterviews(interviews: Interview[]) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(INTERVIEWS_KEY, JSON.stringify(interviews));
}

export function getStoredNotifications(): NotificationItem[] {
  const notifications = getOrCreateStorage(NOTIFICATIONS_KEY, buildInterviewNotifications(seedInterviews));
  const activeInterviewNotifications = buildInterviewNotifications(getStoredInterviews());

  if (notifications.length === 0 && activeInterviewNotifications.length > 0) {
    window.localStorage.setItem(NOTIFICATIONS_KEY, JSON.stringify(activeInterviewNotifications));
    return activeInterviewNotifications;
  }

  return notifications;
}

export function saveNotifications(notifications: NotificationItem[]) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(NOTIFICATIONS_KEY, JSON.stringify(notifications));
}

export function syncInterviewNotifications(interviews: Interview[] = getStoredInterviews()) {
  const nextNotifications = buildInterviewNotifications(interviews);
  saveNotifications(nextNotifications);
  return nextNotifications;
}

export const mockApplications: Application[] = seedApplications;
export const mockInterviews: Interview[] = seedInterviews;
export const mockNotifications: NotificationItem[] = buildInterviewNotifications(seedInterviews);
