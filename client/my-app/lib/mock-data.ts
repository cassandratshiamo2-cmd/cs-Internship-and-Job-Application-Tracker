import type {
  Application,
  Interview,
  NotificationItem,
} from "@/lib/types";

const APPLICATIONS_KEY = "applyflow_applications";
const USER_KEY = "applyflow_user";

const legacyApplicationIds = new Set(["app-101", "app-102", "app-103", "app-104", "app-105"]);

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
    return;
  }

  window.localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function getStoredApplications(): Application[] {
  if (typeof window === "undefined") {
    return [];
  }

  const rawApplications = window.localStorage.getItem(APPLICATIONS_KEY);
  if (!rawApplications) {
    return [];
  }

  try {
    const parsedApplications = JSON.parse(rawApplications);
    if (!Array.isArray(parsedApplications)) {
      window.localStorage.removeItem(APPLICATIONS_KEY);
      return [];
    }

    if (parsedApplications.some((item) => item && legacyApplicationIds.has(item.id))) {
      window.localStorage.removeItem(APPLICATIONS_KEY);
      return [];
    }

    return parsedApplications as Application[];
  } catch {
    window.localStorage.removeItem(APPLICATIONS_KEY);
    return [];
  }
}

export function saveApplications(applications: Application[]) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(APPLICATIONS_KEY, JSON.stringify(applications));
}

export const mockApplications: Application[] = [];
export const mockInterviews: Interview[] = [];
export const mockNotifications: NotificationItem[] = [];
