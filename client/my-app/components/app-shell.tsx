"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useSyncExternalStore, type ReactNode } from "react";
import { getCurrentUserName, setCurrentUser, subscribeToUserChanges } from "@/lib/mock-data";
import {
  clearNotificationState,
  getNotificationState,
  getServerNotificationState,
  refreshUserNotifications,
  subscribeToNotifications,
} from "@/lib/notification-api";

const navItems = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/applications", label: "Applications" },
  { href: "/gmail", label: "Gmail" },
  { href: "/interviews", label: "Interviews" },
  { href: "/notifications", label: "Notifications" },
];

export function AppShell({ children, title }: { children: ReactNode; title: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const userName = useSyncExternalStore(
    subscribeToUserChanges,
    getCurrentUserName,
    () => "Your profile"
  );
  const notificationState = useSyncExternalStore(
    subscribeToNotifications,
    getNotificationState,
    getServerNotificationState
  );
  const unreadCount = notificationState.notifications.filter(
    (notification) => notification.status === "sent" && notification.read === false
  ).length;

  useEffect(() => {
    void refreshUserNotifications();

    const refreshWhenFocused = () => {
      if (document.visibilityState === "visible") {
        void refreshUserNotifications();
      }
    };
    const refreshInterval = window.setInterval(() => {
      void refreshUserNotifications();
    }, 30000);

    window.addEventListener("focus", refreshWhenFocused);
    document.addEventListener("visibilitychange", refreshWhenFocused);

    return () => {
      window.clearInterval(refreshInterval);
      window.removeEventListener("focus", refreshWhenFocused);
      document.removeEventListener("visibilitychange", refreshWhenFocused);
    };
  }, [pathname, userName]);

  const handleLogout = () => {
    clearNotificationState();
    setCurrentUser(null);
    window.localStorage.removeItem("applyflow_token");
    router.push("/");
  };

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_#fff8fb,_#fff6ef_30%,_#f7f7ff_100%)] text-slate-800">
      <header className="border-b border-white/60 bg-white/75 backdrop-blur-sm">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-[#ffb5c8] via-[#ffb36c] to-[#3ec5c1] text-lg font-bold text-white shadow-sm">
              A
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[#0f766e]">ApplyFlow</p>
              <h1 className="text-base font-semibold text-slate-800">{title}</h1>
            </div>
          </div>

          <div className="hidden items-center gap-2 rounded-full bg-[#f7f0ff] p-1 md:flex">
            {navItems.map((item) => {
              const active = pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-label={item.href === "/notifications" && unreadCount > 0
                    ? `Notifications, ${unreadCount} unread`
                    : item.label}
                  className={`rounded-full px-4 py-2 text-sm font-medium transition ${
                    active ? "bg-[#2ec4c0] text-white shadow-sm" : "text-slate-600 hover:bg-white"
                  }`}
                >
                  <NotificationNavLabel item={item} unreadCount={unreadCount} />
                </Link>
              );
            })}
          </div>

          <div className="flex items-center gap-3">
            <button className="rounded-full border border-[#f3d5df] bg-[#fff8fb] px-3 py-2 text-sm font-medium text-slate-700">
              {userName}
            </button>
            <button
              type="button"
              onClick={handleLogout}
              className="rounded-full bg-[#1b9aa1] px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-[#147d82]"
            >
              Logout
            </button>
          </div>
        </div>
        <nav className="mx-auto flex max-w-7xl gap-2 overflow-x-auto px-4 pb-3 md:hidden sm:px-6 lg:px-8" aria-label="Primary navigation">
          {navItems.map((item) => {
            const active = pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-label={item.href === "/notifications" && unreadCount > 0
                  ? `Notifications, ${unreadCount} unread`
                  : item.label}
                className={`shrink-0 rounded-full px-3 py-2 text-sm font-medium ${active ? "bg-[#2ec4c0] text-white" : "bg-white/80 text-slate-600"}`}
              >
                <NotificationNavLabel item={item} unreadCount={unreadCount} />
              </Link>
            );
          })}
        </nav>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">{children}</main>
    </div>
  );
}

function NotificationNavLabel({
  item,
  unreadCount,
}: {
  item: (typeof navItems)[number];
  unreadCount: number;
}) {
  const isNotifications = item.href === "/notifications";
  const badgeText = unreadCount > 99 ? "99+" : String(unreadCount);

  return (
    <span className="inline-flex items-center gap-1.5">
      {isNotifications ? (
        <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24" className="h-4 w-4 fill-none stroke-current" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" />
          <path d="M10 21h4" />
        </svg>
      ) : null}
      <span>{item.label}</span>
      {isNotifications && unreadCount > 0 ? (
        <span aria-hidden="true" className="inline-flex min-h-5 min-w-5 items-center justify-center rounded-full bg-[#d94255] px-1.5 text-[11px] font-bold leading-none text-white">
          {badgeText}
        </span>
      ) : null}
    </span>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const palette: Record<string, string> = {
    Applied: "bg-[#dffaf7] text-[#166b67] border-[#9adfd3]",
    Assessment: "bg-[#fff0dc] text-[#9a5d17] border-[#f2c889]",
    Shortlisted: "bg-[#eef2ff] text-[#3d4ca9] border-[#b9c3ff]",
    Interview: "bg-[#f3e8ff] text-[#7346a7] border-[#d1b8ff]",
    Offer: "bg-[#dcfce7] text-[#1c7a4a] border-[#98e4b0]",
    Rejected: "bg-[#fee2e2] text-[#b42318] border-[#f3b4b4]",
    Saved: "bg-[#fdf2f8] text-[#af3a6d] border-[#f2bfd8]",
    Withdrawn: "bg-[#e2e8f0] text-[#475569] border-[#cbd5e1]",
    Upcoming: "bg-[#dffaf7] text-[#166b67] border-[#9adfd3]",
    Completed: "bg-[#dcfce7] text-[#1c7a4a] border-[#98e4b0]",
    Cancelled: "bg-[#fee2e2] text-[#b42318] border-[#f3b4b4]",
  };

  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${palette[status] ?? "bg-slate-100 text-slate-700 border-slate-200"}`}
    >
      {status}
    </span>
  );
}

export function StatCard({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <div className="rounded-3xl border border-white/60 bg-white/80 p-5 shadow-[0_10px_30px_rgba(203,213,225,0.26)]">
      <div className={`mb-3 h-2.5 w-16 rounded-full ${accent}`} />
      <p className="text-sm text-slate-500">{label}</p>
      <p className="mt-3 text-3xl font-bold text-slate-800">{value}</p>
    </div>
  );
}

export function SectionTitle({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <div className="mb-5 flex items-center justify-between gap-3">
      <h2 className="text-xl font-bold text-slate-800">{title}</h2>
      {action}
    </div>
  );
}
