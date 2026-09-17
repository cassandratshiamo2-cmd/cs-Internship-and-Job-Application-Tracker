"use client";

import Link from "next/link";
import { useState } from "react";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";

export default function LoginPage() {
  const [showPassword, setShowPassword] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [failedAttempts, setFailedAttempts] = useState(0);
  const [cooldownRemaining, setCooldownRemaining] = useState(0);
  const [isBlocked, setIsBlocked] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (isBlocked) {
      setError("Too many failed attempts. Please wait 5 seconds before trying again.");
      return;
    }

    if (!email.trim()) {
      setError("Please enter your email address.");
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError("Please enter a valid email address.");
      return;
    }

    if (!password.trim()) {
      setError("Password is required.");
      return;
    }

    setIsSubmitting(true);
    setError("");

    try {
      const response = await fetch(`${API_BASE}/api/login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email, password }),
      });

      const data = await response.json();

      if (!response.ok) {
        const nextAttempts = failedAttempts + 1;
        setFailedAttempts(nextAttempts);

        if (nextAttempts >= 5) {
          setIsBlocked(true);
          setCooldownRemaining(5);
          setError("Too many failed attempts. Please wait 5 seconds before trying again.");

          const start = Date.now();
          const interval = window.setInterval(() => {
            const elapsed = Math.ceil((Date.now() - start) / 1000);
            const remaining = Math.max(5 - elapsed, 0);
            setCooldownRemaining(remaining);

            if (remaining === 0) {
              window.clearInterval(interval);
              setIsBlocked(false);
              setFailedAttempts(0);
              setError("");
              setIsSubmitting(false);
            }
          }, 1000);

          return;
        }

        setError(data.message || `Incorrect password. Attempt ${nextAttempts} of 5.`);
        setIsSubmitting(false);
        return;
      }

      localStorage.setItem("applyflow_token", data.token);
      localStorage.setItem("applyflow_user", JSON.stringify(data.user));
      setFailedAttempts(0);
      setError("");
      window.location.href = "/dashboard";
    } catch (error) {
      setError("Unable to connect to the server. Please try again.");
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[linear-gradient(135deg,#fff7fb_0%,#fff4ee_40%,#f5f1ff_100%)] px-4 py-10">
      <div className="w-full max-w-md overflow-hidden rounded-[32px] border border-white/60 bg-white/80 shadow-[0_20px_60px_rgba(252,212,195,0.25)] backdrop-blur-sm">
        <div className="bg-[linear-gradient(135deg,#ffb7c7,#f7bb9d,#c6b4ff,#40d3d1)] p-6 text-white">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/20 text-lg font-bold backdrop-blur-sm">
              A
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-white/80">ApplyFlow</p>
              <h1 className="text-2xl font-bold">Welcome back</h1>
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5 p-6 sm:p-8">
          <div>
            <label htmlFor="email" className="mb-2 block text-sm font-medium text-slate-700">Email</label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="w-full rounded-2xl border border-[#e7d6dd] bg-[#fffafc] px-4 py-3 text-slate-800 outline-none ring-0 transition focus:border-[#38b7b9] focus:bg-white"
              placeholder="name@example.com"
              aria-invalid={Boolean(error)}
            />
          </div>

          <div>
            <label htmlFor="password" className="mb-2 block text-sm font-medium text-slate-700">Password</label>
            <div className="relative">
              <input
                id="password"
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="w-full rounded-2xl border border-[#e7d6dd] bg-[#fffafc] px-4 py-3 pr-12 text-slate-800 outline-none transition focus:border-[#38b7b9] focus:bg-white"
                placeholder="Enter your password"
                aria-invalid={Boolean(error)}
              />
              <button
                type="button"
                onClick={() => setShowPassword((current) => !current)}
                className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100"
              >
                {showPassword ? "Hide" : "Show"}
              </button>
            </div>
          </div>

          {error ? (
            <div className="rounded-2xl border border-[#f8c8d5] bg-[#fff4f7] px-4 py-3 text-sm text-[#b3506e]">
              {error}
              {isBlocked && cooldownRemaining > 0 ? (
                <div className="mt-2 font-medium text-[#7b4a63]">Try again in {cooldownRemaining} seconds</div>
              ) : null}
            </div>
          ) : null}

          <button
            type="submit"
            disabled={isBlocked || isSubmitting}
            className="w-full rounded-2xl bg-[#1db7b5] px-4 py-3 text-base font-semibold text-white shadow-[0_12px_30px_rgba(29,183,181,0.35)] transition hover:bg-[#169a9a] disabled:cursor-not-allowed disabled:bg-[#7ccfcf]"
          >
            {isSubmitting ? "Logging in..." : isBlocked ? "Locked for 5 seconds" : "Login"}
          </button>

          <p className="text-center text-sm text-slate-600">
            Don&apos;t have an account? {" "}
            <Link href="/register" className="font-semibold text-[#0f766e] underline-offset-4 hover:underline">
              Register here
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}
