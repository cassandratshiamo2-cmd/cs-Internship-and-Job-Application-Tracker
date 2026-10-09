import type { InterviewType, NotificationChannel, NotificationItem } from "@/lib/types";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:5000";

type DeliveryResult = {
  channel: "In-app";
  sent: boolean;
  scheduled?: boolean;
  scheduledFor?: string;
  alreadySent?: boolean;
  providerConfigured?: boolean;
  reason?: string;
};

type NotificationFetchResult = {
  notifications: NotificationItem[];
  message?: string;
  unauthorized?: boolean;
};

export type NotificationState = {
  notifications: NotificationItem[];
  isLoading: boolean;
  message?: string;
  unauthorized?: boolean;
};

const initialNotificationState: NotificationState = {
  notifications: [],
  isLoading: true,
};

let notificationState = initialNotificationState;
let activeToken: string | null = null;
let refreshVersion = 0;
let inFlightRefresh: Promise<void> | null = null;
const notificationListeners = new Set<() => void>();

function publishNotificationState(nextState: NotificationState) {
  notificationState = nextState;
  notificationListeners.forEach((listener) => listener());
}

export function subscribeToNotifications(listener: () => void) {
  notificationListeners.add(listener);
  return () => notificationListeners.delete(listener);
}

export function getNotificationState() {
  return notificationState;
}

export function getServerNotificationState() {
  return initialNotificationState;
}

export function clearNotificationState() {
  activeToken = null;
  refreshVersion += 1;
  inFlightRefresh = null;
  publishNotificationState({ notifications: [], isLoading: false });
}

export async function refreshUserNotifications(options: { force?: boolean } = {}) {
  const token = window.localStorage.getItem("applyflow_token");

  if (!token) {
    clearNotificationState();
    return;
  }

  if (token !== activeToken) {
    activeToken = token;
    refreshVersion += 1;
    inFlightRefresh = null;
    publishNotificationState({ notifications: [], isLoading: true });
  }

  if (inFlightRefresh && !options.force) {
    return inFlightRefresh;
  }

  const version = ++refreshVersion;
  const currentRefresh = getUserNotifications()
    .then((result) => {
      if (activeToken !== token || refreshVersion !== version) {
        return;
      }

      publishNotificationState({
        notifications: result.notifications,
        isLoading: false,
        message: result.message,
        unauthorized: result.unauthorized,
      });
    })
    .finally(() => {
      if (inFlightRefresh === currentRefresh) {
        inFlightRefresh = null;
      }
    });

  inFlightRefresh = currentRefresh;
  return currentRefresh;
}

export async function setNotificationReadState(notificationId: string, read: boolean) {
  const token = window.localStorage.getItem("applyflow_token");

  if (!token) {
    return { ok: false, message: "Please log in to update notifications." };
  }

  try {
    const response = await fetch(`${API_URL}/api/notifications/${encodeURIComponent(notificationId)}/read`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ read }),
    });
    const payload = (await response.json().catch(() => ({}))) as { message?: string };

    if (!response.ok) {
      return { ok: false, message: payload.message || "Unable to mark notification as read." };
    }

    if (activeToken === token) {
      publishNotificationState({
        ...notificationState,
        notifications: notificationState.notifications.map((notification) =>
          notification.id === notificationId ? { ...notification, read } : notification
        ),
      });
    }

    await refreshUserNotifications({ force: true });
    return { ok: true, message: payload.message };
  } catch {
    return { ok: false, message: "Unable to connect to the notification server." };
  }
}

export function markNotificationAsRead(notificationId: string) {
  return setNotificationReadState(notificationId, true);
}

function isPastInterviewNotification(notification: {
  type: string;
  date: string;
  interviewAt?: string;
}) {
  if (notification.type !== "Interview Reminder") {
    return false;
  }

  if (!notification.date) {
    return false;
  }

  if (notification.interviewAt) {
    const interviewAt = new Date(notification.interviewAt);
    return !Number.isNaN(interviewAt.getTime()) && interviewAt.getTime() <= Date.now();
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(notification.date)) {
    return false;
  }

  return notification.date < localDateKey(new Date());
}

function localDateKey(date: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Johannesburg",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const dateParts = Object.fromEntries(
    parts.filter((part) => part.type !== "literal").map((part) => [part.type, part.value])
  );
  return `${dateParts.year}-${dateParts.month}-${dateParts.day}`;
}

function addDaysToDateKey(dateKey: string, days: number) {
  const [year, month, day] = dateKey.split("-").map(Number);
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day + days);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

function getCatchUpMessage(interviewDate: string, interviewTime: string) {
  const now = new Date();
  const todayDateKey = localDateKey(now);
  const tomorrowDateKey = addDaysToDateKey(todayDateKey, 1);

  if (interviewDate === todayDateKey) {
    return `Your interview is today at ${interviewTime}. Your reminder is scheduled now.`;
  }

  if (interviewDate === tomorrowDateKey) {
    return `Your interview is tomorrow at ${interviewTime}. Your reminder is scheduled now.`;
  }

  return `Your interview is scheduled for ${interviewDate} at ${interviewTime}. Your reminder is scheduled now.`;
}

function getDueInterviewMessage(notification: {
  message: string;
  interviewAt?: string;
  interviewTime?: string;
  scheduledFor?: string;
  status?: string;
}) {
  const interviewAt = notification.interviewAt
    ? new Date(notification.interviewAt)
    : null;
  const scheduledFor = notification.scheduledFor
    ? new Date(notification.scheduledFor)
    : null;

  if (!interviewAt || Number.isNaN(interviewAt.getTime())) {
    return notification.message;
  }

  const now = new Date();
  const isCatchUpReminder =
    scheduledFor !== null &&
    interviewAt.getTime() > scheduledFor.getTime() &&
    interviewAt.getTime() - scheduledFor.getTime() < 24 * 60 * 60 * 1000;
  const reminderIsDue =
    isCatchUpReminder ||
    notification.status === "sent" ||
    (scheduledFor !== null && scheduledFor.getTime() <= now.getTime());

  if (!reminderIsDue || interviewAt.getTime() <= now.getTime()) {
    return notification.message;
  }

  const todayDateKey = localDateKey(now);
  const tomorrowDateKey = addDaysToDateKey(todayDateKey, 1);
  const interviewTime = notification.interviewTime || "";

  if (localDateKey(interviewAt) === todayDateKey) {
    return `Your interview is today at ${interviewTime}.`;
  }

  if (localDateKey(interviewAt) === tomorrowDateKey) {
    return `Your interview is tomorrow at ${interviewTime}.`;
  }

  return notification.message;
}

export async function getUserNotifications(): Promise<NotificationFetchResult> {
  const token = window.localStorage.getItem("applyflow_token");

  if (!token) {
    return {
      notifications: [],
      message: "Please log in to view your notifications.",
      unauthorized: true,
    };
  }

  try {
    const response = await fetch(`${API_URL}/api/notifications`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const payload = (await response.json()) as {
      notifications?: Array<{
        id: string;
        title: string;
        type: string;
        message: string;
        date: string;
        read: boolean;
        interviewAt?: string;
        interviewTime?: string;
        scheduledFor?: string;
        status?: NotificationItem["status"];
      }>;
      message?: string;
    };

    if (!response.ok) {
      return {
        notifications: [],
        message: payload.message || "Unable to load notifications.",
        unauthorized: response.status === 401,
      };
    }

    const visibleNotifications = (payload.notifications || [])
      .filter((notification) => !isPastInterviewNotification(notification))
      .map((notification) => ({
        ...notification,
        message: getDueInterviewMessage(notification),
        type: notification.type as NotificationItem["type"],
      }));

    return {
      notifications: visibleNotifications,
    };
  } catch {
    return {
      notifications: [],
      message: "Unable to connect to the notification server.",
    };
  }
}

export async function sendExternalInterviewNotifications(details: {
  applicationId: string;
  company: string;
  position: string;
  interviewDate: string;
  interviewTime: string;
  interviewType?: InterviewType;
  applicationLink?: string;
  notificationChannels: NotificationChannel[];
}) {
  const selectedChannels = details.notificationChannels.filter(
    (channel) => channel === "In-app"
  );

  if (selectedChannels.length === 0) {
    return {
      results: [] as DeliveryResult[],
      message: "No notification channel was selected.",
    };
  }

  try {
    const token = window.localStorage.getItem("applyflow_token");

    const response = await fetch(`${API_URL}/api/notifications/interview`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        ...details,
        notificationChannels: selectedChannels,
      }),
    });

    const payload = (await response.json()) as {
      message?: string;
      scheduled?: boolean;
      isCatchUp?: boolean;
      results?: DeliveryResult[];
    };

    if (!response.ok) {
      return {
        results: [] as DeliveryResult[],
        message: payload.message || "Interview notification setup failed.",
      };
    }

    const results = payload.results || [];
    if (payload.scheduled === false) {
      return {
        results,
        message: payload.message || "No reminder was scheduled.",
      };
    }

    const scheduledCount = results.filter((result) => result.scheduled).length;
    const sentCount = results.filter((result) => result.sent).length;

    if (results.length > 0 && results.every((result) => result.alreadySent)) {
      return {
        results,
        message: "The reminder was already sent for this interview.",
      };
    }

    if (scheduledCount > 0) {
      return {
        results,
        message: payload.isCatchUp
          ? getCatchUpMessage(details.interviewDate, details.interviewTime)
          : payload.message || "Your interview reminder is scheduled for 24 hours before the interview.",
      };
    }

    if (results.length > 0 && sentCount === results.length) {
      return {
        results,
        message: "Interview notifications sent successfully.",
      };
    }

    return {
      results,
      message: "Interview saved, but one or more notifications were not sent.",
    };
  } catch {
    return {
      results: [] as DeliveryResult[],
      message: "Interview saved. The notification server is unavailable.",
    };
  }
}

export async function cancelExternalInterviewNotifications(applicationId: string) {
  const token = window.localStorage.getItem("applyflow_token");

  if (!token) {
    return;
  }

  try {
    await fetch(`${API_URL}/api/notifications/interview/${encodeURIComponent(applicationId)}`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
  } catch {
    return;
  }
}
