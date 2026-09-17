import { AppShell, SectionTitle } from "@/components/app-shell";
import { mockNotifications } from "@/lib/mock-data";

export default function NotificationsPage() {
  return (
    <AppShell title="Notifications">
      <div className="space-y-6">
        <SectionTitle title="Your notifications" />

        <div className="space-y-3">
          {mockNotifications.map((notification) => (
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
          ))}
        </div>
      </div>
    </AppShell>
  );
}
