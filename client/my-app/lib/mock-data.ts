import type {
  Application,
  Interview,
  NotificationItem,
} from "@/lib/types";

const APPLICATIONS_KEY = "applyflow_applications";
const USER_KEY = "applyflow_user";
const USERS_KEY = "applyflow_users";
const DEMO_EMAIL = "demo@applyflow.com";
const DEMO_PASSWORD = "Password123";

const legacyApplicationIds = new Set([
  "app-101",
  "app-102",
  "app-103",
  "app-104",
  "app-105",
]);

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
    notificationChannels: ["In-app", "Email"],
    interviewEmail: "applicant@example.com",
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

async function hashPassword(password: string) {
  if (typeof window === "undefined" || !window.crypto?.subtle) {
    return password;
  }

  const encoded = new TextEncoder().encode(password);
  const digest = await window.crypto.subtle.digest("SHA-256", encoded);

  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export function getStoredUsers(): Array<{
  id: string;
  fullName: string;
  email: string;
  passwordHash: string;
}> {
  if (typeof window === "undefined") {
    return [];
  }

  const rawUsers = window.localStorage.getItem(USERS_KEY);

  if (!rawUsers) {
    return [];
  }

  try {
    const parsedUsers = JSON.parse(rawUsers);
    return Array.isArray(parsedUsers) ? parsedUsers : [];
  } catch {
    window.localStorage.removeItem(USERS_KEY);
    return [];
  }
}

export function saveStoredUsers(users: Array<{ id: string; fullName: string; email: string; passwordHash: string }>) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(USERS_KEY, JSON.stringify(users));
}

export async function registerLocalUser(user: { fullName: string; email: string; password: string }) {
  const normalizedEmail = normalizeEmail(user.email);
  const existingUsers = getStoredUsers();
  const emailExists = existingUsers.some((storedUser) => storedUser.email === normalizedEmail);

  if (emailExists) {
    return null;
  }

  const newUser = {
    id: `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    fullName: user.fullName.trim(),
    email: normalizedEmail,
    passwordHash: await hashPassword(user.password),
  };

  saveStoredUsers([...existingUsers, newUser]);

  return {
    id: newUser.id,
    fullName: newUser.fullName,
    email: newUser.email,
  };
}

export async function ensureDemoUser() {
  const users = getStoredUsers();

  if (users.some((user) => user.email === DEMO_EMAIL)) {
    return users.find((user) => user.email === DEMO_EMAIL) ?? null;
  }

  const demoUser = {
    id: "demo-user",
    fullName: "Demo User",
    email: DEMO_EMAIL,
    passwordHash: await hashPassword(DEMO_PASSWORD),
  };

  saveStoredUsers([...users, demoUser]);

  return demoUser;
}

export async function loginLocalUser(email: string, password: string) {
  const normalizedEmail = normalizeEmail(email);
  const users = getStoredUsers();
  const passwordHash = await hashPassword(password);

  const seededUsers = users.some((user) => user.email === DEMO_EMAIL)
    ? users
    : [...users, await ensureDemoUser()].filter(Boolean) as Array<{
        id: string;
        fullName: string;
        email: string;
        passwordHash: string;
      }>;

  const match = seededUsers.find(
    (user) => user.email === normalizedEmail && user.passwordHash === passwordHash
  );

  if (!match) {
    return null;
  }

  return {
    id: match.id,
    fullName: match.fullName,
    email: match.email,
  };
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

export function getCurrentUserName() {
  return getCurrentUser()?.fullName || "Your profile";
}

export function subscribeToUserChanges(listener: () => void) {
  if (typeof window === "undefined") {
    return () => undefined;
  }

  const handleStorage = (event: StorageEvent) => {
    if (event.key === USER_KEY) {
      listener();
    }
  };

  const handleUserChange = () => listener();

  window.addEventListener("storage", handleStorage);
  window.addEventListener("applyflow-user-change", handleUserChange);

  return () => {
    window.removeEventListener("storage", handleStorage);
    window.removeEventListener("applyflow-user-change", handleUserChange);
  };
}

export function setCurrentUser(
  user: {
    fullName?: string;
    email?: string;
    id?: number | string;
  } | null
) {
  if (typeof window === "undefined") {
    return;
  }

  if (!user) {
    window.localStorage.removeItem(USER_KEY);
    window.dispatchEvent(new Event("applyflow-user-change"));
    return;
  }

  window.localStorage.setItem(USER_KEY, JSON.stringify(user));
  window.dispatchEvent(new Event("applyflow-user-change"));
}

export function getStoredApplications(): Application[] {
  if (typeof window === "undefined") {
    return [];
  }

  const rawApplications = window.localStorage.getItem(APPLICATIONS_KEY);

  if (!rawApplications) {
    window.localStorage.setItem(APPLICATIONS_KEY, JSON.stringify(defaultApplications));
    return [...defaultApplications];
  }

  try {
    const parsedApplications = JSON.parse(rawApplications);

    if (!Array.isArray(parsedApplications)) {
      window.localStorage.removeItem(APPLICATIONS_KEY);
      window.localStorage.setItem(APPLICATIONS_KEY, JSON.stringify(defaultApplications));
      return [...defaultApplications];
    }

    const sanitizedApplications = parsedApplications.filter(
      (item): item is Application =>
        Boolean(item) &&
        typeof item === "object" &&
        typeof (item as Application).id !== "undefined" &&
        !legacyApplicationIds.has(String((item as Application).id))
    );

    if (sanitizedApplications.length === 0) {
      window.localStorage.setItem(APPLICATIONS_KEY, JSON.stringify(defaultApplications));
      return [...defaultApplications];
    }

    if (sanitizedApplications.length !== parsedApplications.length) {
      window.localStorage.setItem(APPLICATIONS_KEY, JSON.stringify(sanitizedApplications));
    }

    return sanitizedApplications;
  } catch {
    window.localStorage.removeItem(APPLICATIONS_KEY);
    window.localStorage.setItem(APPLICATIONS_KEY, JSON.stringify(defaultApplications));
    return [...defaultApplications];
  }
}

export function getApplicationById(id: string | number | undefined): Application | null {
  if (id === undefined || id === null || String(id).trim() === "") {
    return null;
  }

  const normalizedId = String(id).trim();
  return getStoredApplications().find((item) => String(item.id) === normalizedId) ?? null;
}

export function saveApplications(applications: Application[]) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(
    APPLICATIONS_KEY,
    JSON.stringify(applications)
  );
}

export function getInterviewNotifications(
  applications: Application[]
): NotificationItem[] {
  const now = Date.now();

  return applications
    .filter(
      (application) =>
        application.status === "Interview" &&
        application.interviewDate &&
        application.interviewTime
    )
    .map((application): NotificationItem => {
      const interviewDate: string = application.interviewDate!;
      const interviewTime: string = application.interviewTime!;

      const interviewAt = new Date(
        `${interviewDate}T${interviewTime}`
      ).getTime();

      const channels =
        application.notificationChannels?.length
          ? application.notificationChannels
          : ["In-app"];

      return {
        id: `interview-${application.id}`,
        title: `Interview coming up at ${application.company}`,
        type: "Interview Reminder",
        message: `${application.position} is scheduled for ${interviewDate} at ${interviewTime}. Notifications: ${channels.join(", ")}.`,
        date: interviewDate,
        read: interviewAt <= now,
      };
    })
    .filter((notification) => !notification.read)
    .sort((first, second) =>
      first.date.localeCompare(second.date)
    );
}

export const mockApplications: Application[] = [];

export const mockInterviews: Interview[] = [];

export const mockNotifications: NotificationItem[] = [];