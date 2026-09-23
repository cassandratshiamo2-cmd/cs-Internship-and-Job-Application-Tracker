import { AppShell, SectionTitle, StatusBadge } from "@/components/app-shell";
import { mockInterviews } from "@/lib/mock-data";

export default function InterviewsPage() {
  return (
    <AppShell title="Interviews">
      <div className="space-y-6">
        <SectionTitle title="Upcoming and past interviews" />

        <div className="grid gap-4 lg:grid-cols-2">
          {mockInterviews.map((interview) => (
            <div key={interview.id} className="rounded-[28px] border border-white/60 bg-white/80 p-5 shadow-[0_10px_30px_rgba(203,213,225,0.26)]">
              <div className="mb-4 flex items-start justify-between gap-2">
                <div>
                  <p className="text-xl font-semibold text-slate-800">{interview.company}</p>
                  <p className="text-sm text-slate-500">{interview.position}</p>
                </div>
                <StatusBadge status={interview.status} />
              </div>

              <div className="space-y-2 text-sm text-slate-600">
                <p><span className="font-semibold text-slate-700">Date:</span> {interview.date}</p>
                <p><span className="font-semibold text-slate-700">Time:</span> {interview.time}</p>
                <p><span className="font-semibold text-slate-700">Type:</span> {interview.type}</p>
                <p><span className="font-semibold text-slate-700">Status:</span> {interview.status}</p>
                <p><span className="font-semibold text-slate-700">Details:</span> {interview.details}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </AppShell>
  );
}
