import Link from "next/link";
import type { ReactNode } from "react";

export function LegalPage({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_#fff8fb,_#fff6ef_30%,_#f7f7ff_100%)] text-slate-800">
      <header className="border-b border-white/70 bg-white/70 backdrop-blur-sm">
        <nav
          aria-label="Main navigation"
          className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-4 sm:px-6"
        >
          <Link href="/" className="flex items-center gap-3 rounded-xl focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#0f766e]">
            <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-[#ffb5c8] via-[#ffb36c] to-[#3ec5c1] text-lg font-bold text-white shadow-sm">
              A
            </span>
            <span className="text-sm font-semibold uppercase tracking-[0.2em] text-[#0f766e]">
              ApplyFlow
            </span>
          </Link>
          <div className="flex items-center gap-2 text-sm font-medium sm:gap-4">
            <Link href="/privacy" className="rounded-full px-3 py-2 text-slate-600 hover:bg-white">
              Privacy
            </Link>
            <Link href="/terms" className="rounded-full px-3 py-2 text-slate-600 hover:bg-white">
              Terms
            </Link>
            <Link href="/login" className="rounded-full bg-[#1db7b5] px-4 py-2 text-white shadow-sm transition hover:bg-[#169a9a]">
              Login
            </Link>
          </div>
        </nav>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-10 sm:px-6 sm:py-14">
        <div className="overflow-hidden rounded-[32px] border border-white/70 bg-white/85 shadow-[0_20px_60px_rgba(252,212,195,0.25)] backdrop-blur-sm">
          <div className="bg-[linear-gradient(135deg,#ffb7c7,#f7bb9d,#c6b4ff,#40d3d1)] px-6 py-8 text-white sm:px-10 sm:py-10">
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-white/85">
              ApplyFlow · Legal
            </p>
            <h1 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">{title}</h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-white/95 sm:text-base">
              {description}
            </p>
          </div>
          <article className="space-y-8 px-6 py-8 sm:px-10 sm:py-10">
            {children}
            <p className="border-t border-[#f1e5ea] pt-5 text-xs leading-5 text-slate-500">
              This page describes the ApplyFlow implementation as it currently operates.
              Features, providers, and practices may change as the service develops.
            </p>
          </article>
        </div>
        <footer className="mt-6 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 pb-4 text-sm text-slate-500">
          <Link href="/" className="hover:text-[#0f766e] hover:underline">Home</Link>
          <Link href="/privacy" className="hover:text-[#0f766e] hover:underline">Privacy Policy</Link>
          <Link href="/terms" className="hover:text-[#0f766e] hover:underline">Terms of Service</Link>
        </footer>
      </main>
    </div>
  );
}

export function LegalSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section aria-labelledby={title.toLowerCase().replaceAll(" ", "-")}>
      <h2
        id={title.toLowerCase().replaceAll(" ", "-")}
        className="text-lg font-semibold text-slate-800 sm:text-xl"
      >
        {title}
      </h2>
      <div className="mt-3 space-y-3 text-sm leading-7 text-slate-600 sm:text-base">
        {children}
      </div>
    </section>
  );
}
