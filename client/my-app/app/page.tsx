import Link from "next/link";

export default function HomePage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top,_#fff8fb,_#fff6ef_30%,_#f7f7ff_100%)] px-4 py-10">
      <div className="w-full max-w-5xl overflow-hidden rounded-[32px] border border-white/60 bg-white/80 shadow-[0_20px_60px_rgba(252,212,195,0.25)] backdrop-blur-sm">
        <div className="grid gap-0 md:grid-cols-2">
          <div className="bg-[linear-gradient(135deg,#ffb7c7,#f7bb9d,#c6b4ff,#40d3d1)] p-8 text-white md:p-12">
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-white/80">ApplyFlow</p>
            <h1 className="mt-5 text-4xl font-bold leading-tight">Track every application with clarity.</h1>
            <p className="mt-4 max-w-md text-base text-white/90">
              Manage internships, WIL roles, and graduate opportunities in one streamlined dashboard.
            </p>
          </div>

          <div className="space-y-6 p-8 md:p-12">
            <div>
              <p className="text-sm font-medium uppercase tracking-[0.22em] text-[#0f766e]">Welcome</p>
              <h2 className="mt-2 text-3xl font-bold text-slate-800">Your job search, organized.</h2>
            </div>

            <div className="space-y-3 text-sm text-slate-600">
              <p>• Save all your applications in one place</p>
              <p>• Monitor status changes and interviews</p>
              <p>• Stay on top of deadlines and follow-ups</p>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row">
              <Link href="/login" className="inline-flex items-center justify-center rounded-full bg-[#1db7b5] px-5 py-3 text-sm font-semibold text-white shadow-[0_12px_30px_rgba(29,183,181,0.35)] transition hover:bg-[#169a9a]">
                Login
              </Link>
              <Link href="/register" className="inline-flex items-center justify-center rounded-full border border-[#e7d6dd] bg-white px-5 py-3 text-sm font-semibold text-slate-700">
                Register
              </Link>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
