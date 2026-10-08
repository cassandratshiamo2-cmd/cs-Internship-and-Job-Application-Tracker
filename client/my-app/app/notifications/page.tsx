"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { AppShell, SectionTitle } from "@/components/app-shell";
import { getStoredNotifications, syncInterviewNotifications } from "@/lib/mock-data";
import {
  getNotificationState,
  getServerNotificationState,
  markNotificationAsRead,
  subscribeToNotifications,
} from "@/lib/notification-api";
import type { NotificationItem } from "@/lib/types";

const reminderDateFormatter = new Intl.DateTimeFormat("en-ZA", {
  timeZone: "Africa/Johannesburg",
  year: "numeric",
  month: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});
const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const abbreviatedMonthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function formatReminderDate(scheduledFor?: string) {
  if (!scheduledFor) {
    return "Reminder time unavailable";
  }

  const scheduledAt = new Date(scheduledFor);
  if (Number.isNaN(scheduledAt.getTime())) {
    return "Reminder time unavailable";
  }

  return `${reminderDateFormatter.format(scheduledAt)} SAST`;
}

function formatDateOnly(value: string) {
  const isoDate = /^(\d{4})-(\d{2})-(\d{2})/.exec(value.trim());
  if (isoDate) {
    const [, year, month, day] = isoDate;
    const monthName = monthNames[Number(month) - 1];
    return monthName ? `${day} ${monthName} ${year}` : value;
  }

  const javascriptDate = /^(?:\w{3} )?(\w{3}) (\d{1,2}) (\d{4})\b/.exec(value.trim());
  if (javascriptDate) {
    const [, abbreviatedMonth, day, year] = javascriptDate;
    const monthIndex = abbreviatedMonthNames.indexOf(abbreviatedMonth);
    const monthName = monthNames[monthIndex];
    if (monthName) {
      return `${day.padStart(2, "0")} ${monthName} ${year}`;
    }
  }

  return value;
}

function formatNotificationMessage(message: string) {
  const scheduledInterview = /^(.* is scheduled for )(.+?)( at \d{1,2}:\d{2}\.)$/.exec(message);
  if (!scheduledInterview) {
    return message;
  }

  return `${scheduledInterview[1]}${formatDateOnly(scheduledInterview[2])}${scheduledInterview[3]}`;
}

export default function NotificationsPage() {
  const notificationState = useSyncExternalStore(
    subscribeToNotifications,
    getNotificationState,
    getServerNotificationState
  );
  const [localNotifications, setLocalNotifications] = useState<NotificationItem[] | null>(null);
  const [deliveryNotice, setDeliveryNotice] = useState("");
  const [actionError, setActionError] = useState("");
  const [markingNotificationId, setMarkingNotificationId] = useState<string | null>(null);

  useEffect(() => {
    void Promise.resolve().then(() => {
      const notice = window.sessionStorage.getItem("applyflow_delivery_notice");
      if (notice) {
        setDeliveryNotice(notice);
        window.sessionStorage.removeItem("applyflow_delivery_notice");
      }

      if (!window.localStorage.getItem("applyflow_token")) {
        const storedNotifications = getStoredNotifications();
        setLocalNotifications(storedNotifications);
        syncInterviewNotifications();
      }
    });
  }, []);

  const handleMarkRead = async (notificationId: string) => {
    setMarkingNotificationId(notificationId);
    setActionError("");
    const result = await markNotificationAsRead(notificationId);
    if (!result.ok) {
      setActionError(result.message || "Unable to mark notification as read.");
    }
    setMarkingNotificationId(null);
  };

  const notifications = localNotifications ?? notificationState.notifications;
  const isLoading = localNotifications === null && notificationState.isLoading;
  const error = actionError || (localNotifications === null ? notificationState.message : "") || "";

  return (
    <AppShell title="Notifications">
      <div className="space-y-6">
        <SectionTitle title="Your notifications" />

        {deliveryNotice ? (
          <div className="rounded-2xl border border-[#bfe8df] bg-[#effcf9] px-4 py-3 text-sm text-[#166b67]">
            {deliveryNotice}
          </div>
        ) : null}

        {error ? (
          <div className="rounded-2xl border border-[#f8c8d5] bg-[#fff4f7] px-4 py-3 text-sm text-[#b3506e]">
            {error}
          </div>
        ) : null}

        <div className="space-y-3">
          {isLoading ? (
            <div className="rounded-[24px] border border-white/60 bg-white/70 p-8 text-center text-slate-500">
              Loading notifications...
            </div>
          ) : notifications.length ? notifications.map((notification) => (
            <div
              key={notification.id}
              className={`rounded-[24px] border p-4 shadow-[0_8px_24px_rgba(203,213,225,0.18)] ${
                notification.read ? "border-white/60 bg-white/80" : "border-[#f9dfe9] bg-[#fff8fb]"
              }`}
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <div className="mb-2 flex items-center gap-2">
                    <span className="rounded-full bg-[#f2e9ff] px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-[#6d47a9]">
                      {notification.type}
                    </span>
                    {(notification.status === "sent" || !notification.status) && !notification.read ? (
                      <span className="h-2.5 w-2.5 rounded-full bg-[#ff7aa2]" aria-label="Unread notification" />
                    ) : null}
                  </div>
                  <p className="text-lg font-semibold text-slate-800">{notification.title}</p>
                  <p className="mt-1 whitespace-pre-line text-sm text-slate-600">{formatNotificationMessage(notification.message)}</p>
                </div>
                <div className="flex shrink-0 flex-col items-start gap-2 sm:items-end">
                  <p className="text-xs font-medium text-slate-500">
                    {notification.scheduledFor
                      ? `Reminder: ${formatReminderDate(notification.scheduledFor)}`
                      : formatDateOnly(notification.date)}
                  </p>
                  {notification.status === "sent" && !notification.read ? (
                    <button
                      type="button"
                      onClick={() => void handleMarkRead(notification.id)}
                      disabled={markingNotificationId === notification.id}
                      className="text-sm font-semibold text-[#147d82] underline-offset-2 hover:underline disabled:opacity-60"
                    >
                      {markingNotificationId === notification.id ? "Marking..." : "Mark as read"}
                    </button>
                  ) : null}
                </div>
              </div>
            </div>
          )) : (
            <div className="rounded-[28px] border border-dashed border-[#e7d6dd] bg-white/80 p-8 text-center text-slate-500">
              No notifications yet. Interview reminders will appear here as dates get closer.
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}