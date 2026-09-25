import type { NotificationChannel } from "@/lib/types";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:5000";

type DeliveryResult = {
  channel: "Email" | "SMS" | "Phone";
  sent: boolean;
  scheduled?: boolean;
  scheduledFor?: string;
  providerConfigured?: boolean;
  reason?: string;
};

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
  phoneNumber?: string;
}) {
  const externalChannels = details.notificationChannels.filter((channel) => channel === "Email" || channel === "SMS" || channel === "Phone");
  if (!externalChannels.length) {
    return { results: [] as DeliveryResult[], message: "In-app reminder saved." };
  }

  try {
    const response = await fetch(`${API_URL}/api/notifications/interview`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(window.localStorage.getItem("applyflow_token") ? { Authorization: `Bearer ${window.localStorage.getItem("applyflow_token")}` } : {}),
      },
      body: JSON.stringify({ ...details, notificationChannels: externalChannels }),
    });
    const payload = await response.json() as { message?: string; results?: DeliveryResult[] };

    if (!response.ok) {
      return { results: [], message: payload.message || "External notification delivery failed." };
    }

    const results = payload.results || [];
    const sentCount = results.filter((result) => result.sent).length;
    return {
      results,
      message: results.some((result) => result.scheduled)
        ? "Interview saved. External reminders are scheduled for the interview time."
        : sentCount === results.length
          ? "External interview reminders sent."
          : "Interview saved, but one or more external reminders were not sent.",
    };
  } catch {
    return { results: [], message: "Interview saved. The notification server is unavailable." };
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
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch {
    return;
  }
}