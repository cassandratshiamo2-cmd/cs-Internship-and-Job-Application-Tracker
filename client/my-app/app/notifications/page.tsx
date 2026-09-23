"use client";

import { useEffect, useState } from "react";
import { AppShell, SectionTitle } from "@/components/app-shell";
import { getInterviewNotifications, getStoredApplications } from "@/lib/mock-data";
import type { NotificationItem } from "@/lib/types";

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [deliveryNotice, setDeliveryNotice] = useState("");

  useEffect(() => {
    setNotifications(getInterviewNotifications(getStoredApplications()));
    const notice = window.sessionStorage.getItem("applyflow_delivery_notice");
    if (notice) {
      setDeliveryNotice(notice);
      window.sessionStorage.removeItem("applyflow_delivery_notice");
    }
  }, []);

  return (
    <AppShell title="Notifications">
      <div className="space-y-6">
        <SectionTitle title="Your notifications" />

        {deliveryNotice ? (
          <div className="rounded-2xl border border-[#bfe8df] bg-[#effcf9] px-4 py-3 text-sm text-[#166b67]">
            {deliveryNotice}
          </div>
        ) : null}

        <div className="space-y-3">
          {notifications.length ? notifications.map((notification) => (
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
                    {!notification.read && (
                      <span className="h-2.5 w-2.5 rounded-full bg-[#ff7aa2]" aria-label="Unread notification" />
                    )}
                  </div>
                  <p className="text-lg font-semibold text-slate-800">{notification.title}</p>
                  <p className="mt-1 text-sm text-slate-600">{notification.message}</p>
                </div>
                <p className="text-xs font-medium uppercase tracking-[0.14em] text-slate-400">{notification.date}</p>
              </div>
            </div>
          )) : (
            <div className="rounded-[24px] border border-dashed border-[#e7d6dd] bg-white/70 p-8 text-center text-slate-500">
              No upcoming interview reminders.
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}
