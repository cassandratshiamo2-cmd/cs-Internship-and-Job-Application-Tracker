import type { NotificationChannel } from "@/lib/types";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:5000";

type DeliveryResult = {
  channel: "Email" | "Phone";
  sent: boolean;
  reason?: string;
};

export async function sendExternalInterviewNotifications(details: {
  company: string;
  position: string;
  interviewDate: string;
  interviewTime: string;
  notificationChannels: NotificationChannel[];
  email?: string;
  phone?: string;
}) {
  const externalChannels = details.notificationChannels.filter((channel) => channel === "Email" || channel === "Phone");
  if (!externalChannels.length) {
    return { results: [] as DeliveryResult[], message: "In-app reminder saved." };
  }

  try {
    const response = await fetch(`${API_URL}/api/notifications/interview`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
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
      message: sentCount === results.length ? "External interview reminders sent." : "Interview saved, but one or more external reminders were not sent.",
    };
  } catch {
    return { results: [], message: "Interview saved. The notification server is unavailable." };
  }
}