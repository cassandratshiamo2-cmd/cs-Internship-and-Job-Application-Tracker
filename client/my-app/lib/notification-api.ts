import type { NotificationChannel, NotificationItem } from "@/lib/types";

const API_URL =
  process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:5000";

type DeliveryResult = {
  channel: "In-app" | "Email";
  sent: boolean;
  scheduled?: boolean;
  scheduledFor?: string;
  providerConfigured?: boolean;
  reason?: string;
};

type NotificationFetchResult = {
  notifications: NotificationItem[];
  message?: string;
  unauthorized?: boolean;
};

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

    return {
      notifications: (payload.notifications || []).map((notification) => ({
        ...notification,
        type: notification.type as NotificationItem["type"],
      })),
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
  scheduledAt: string;
  applicationLink?: string;
  notificationChannels: NotificationChannel[];
  email?: string;
}) {
  const selectedChannels = details.notificationChannels.filter(
    (channel) => channel === "In-app" || channel === "Email"
  );

  if (selectedChannels.length === 0) {
    return {
      results: [] as DeliveryResult[],
      message: "No notification channel was selected.",
    };
  }

  try {
    const token =
      window.localStorage.getItem("applyflow_token");

    const response = await fetch(
      `${API_URL}/api/notifications/interview`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token
            ? {
                Authorization: `Bearer ${token}`,
              }
            : {}),
        },
        body: JSON.stringify({
          ...details,
          notificationChannels: selectedChannels,
        }),
      }
    );

    const payload = (await response.json()) as {
      message?: string;
      results?: DeliveryResult[];
    };

    if (!response.ok) {
      return {
        results: [] as DeliveryResult[],
        message:
          payload.message ||
          "Interview notification setup failed.",
      };
    }

    const results = payload.results || [];

    const scheduledCount = results.filter(
      (result) => result.scheduled
    ).length;

    const sentCount = results.filter(
      (result) => result.sent
    ).length;

    if (scheduledCount > 0) {
      return {
        results,
        message:
          "Interview saved. Your selected notifications are scheduled for the interview time.",
      };
    }

    if (
      results.length > 0 &&
      sentCount === results.length
    ) {
      return {
        results,
        message:
          "Interview notifications sent successfully.",
      };
    }

    return {
      results,
      message:
        "Interview saved, but one or more notifications were not sent.",
    };
  } catch {
    return {
      results: [] as DeliveryResult[],
      message:
        "Interview saved. The notification server is unavailable.",
    };
  }
}

export async function cancelExternalInterviewNotifications(
  applicationId: string
) {
  const token =
    window.localStorage.getItem("applyflow_token");

  if (!token) {
    return;
  }

  try {
    await fetch(
      `${API_URL}/api/notifications/interview/${encodeURIComponent(
        applicationId
      )}`,
      {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );
  } catch {
    return;
  }
}
