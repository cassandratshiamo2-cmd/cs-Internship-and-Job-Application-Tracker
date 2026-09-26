"use client";

import Link from "next/link";
import { useState } from "react";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";

export default function RegisterPage() {
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const form = new FormData(event.currentTarget);
    const fullName = String(form.get("fullName") || "").trim();
    const email = String(form.get("email") || "").trim();
    const password = String(form.get("password") || "");
    const confirmPassword = String(form.get("confirmPassword") || "");

    if (!fullName || !email || !password || !confirmPassword) {
      setError("Please complete all required fields.");
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError("Please enter a valid email address.");
      return;
    }

    if (password.length < 8) {
      setError("Password must be at least 8 characters long.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setIsSubmitting(true);
    setError("");

    try {
      const response = await fetch(`${API_BASE}/api/register`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          fullName,
          email,
          password,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.message || "Registration failed.");
        setIsSubmitting(false);
        return;
      }

      window.location.href = "/login";
    } catch (error) {
      setError("Unable to connect to the server. Please try again.");
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[linear-gradient(135deg,#fff7fb_0%,#fff4ee_40%,#f5f1ff_100%)] px-4 py-10">
      <div className="w-full max-w-lg overflow-hidden rounded-[32px] border border-white/60 bg-white/75 shadow-[0_20px_60px_rgba(252,212,195,0.25)] backdrop-blur-sm">
        <div className="bg-[linear-gradient(135deg,#ffb7c7,#f7bb9d,#c6b4ff,#40d3d1)] p-6 text-white">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/20 text-lg font-bold backdrop-blur-sm">
              A
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-white/80">ApplyFlow</p>
              <h1 className="text-2xl font-bold">Create your account</h1>
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5 p-6 sm:p-8">
          <div>
            <label htmlFor="fullName" className="mb-2 block text-sm font-medium text-slate-700">Full name</label>
            <input
              id="fullName"
              name="fullName"
              type="text"
              className="w-full rounded-2xl border border-[#e7d6dd] bg-[#fffafc] px-4 py-3 text-slate-800 outline-none transition focus:border-[#38b7b9] focus:bg-white"
              placeholder="Jane Doe"
            />
          </div>

          <div>
            <label htmlFor="register-email" className="mb-2 block text-sm font-medium text-slate-700">Email</label>
            <input
              id="register-email"
              name="email"
              type="email"
              className="w-full rounded-2xl border border-[#e7d6dd] bg-[#fffafc] px-4 py-3 text-slate-800 outline-none transition focus:border-[#38b7b9] focus:bg-white"
              placeholder="name@example.com"
            />
          </div>

          <div>
            <label htmlFor="register-password" className="mb-2 block text-sm font-medium text-slate-700">Password</label>
            <div className="relative">
              <input
                id="register-password"
                name="password"
                type={showPassword ? "text" : "password"}
                className="w-full rounded-2xl border border-[#e7d6dd] bg-[#fffafc] px-4 py-3 pr-12 text-slate-800 outline-none transition focus:border-[#38b7b9] focus:bg-white"
                placeholder="Minimum 8 characters"
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

          <div>
            <label htmlFor="confirmPassword" className="mb-2 block text-sm font-medium text-slate-700">Confirm password</label>
            <div className="relative">
              <input
                id="confirmPassword"
                name="confirmPassword"
                type={showConfirmPassword ? "text" : "password"}
                className="w-full rounded-2xl border border-[#e7d6dd] bg-[#fffafc] px-4 py-3 pr-12 text-slate-800 outline-none transition focus:border-[#38b7b9] focus:bg-white"
                placeholder="Re-enter your password"
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword((current) => !current)}
                className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100"
              >
                {showConfirmPassword ? "Hide" : "Show"}
              </button>
            </div>
          </div>

          {error ? (
            <div className="rounded-2xl border border-[#f8c8d5] bg-[#fff4f7] px-4 py-3 text-sm text-[#b3506e]">
              {error}
            </div>
          ) : null}

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full rounded-2xl bg-[#1db7b5] px-4 py-3 text-base font-semibold text-white shadow-[0_12px_30px_rgba(29,183,181,0.35)] transition hover:bg-[#169a9a] disabled:cursor-not-allowed disabled:bg-[#7ccfcf]"
          >
            {isSubmitting ? "Registering..." : "Register"}
          </button>

          <p className="text-center text-sm text-slate-600">
            Already have an account?{" "}
            <Link href="/login" className="font-semibold text-[#0f766e] underline-offset-4 hover:underline">
              Login here
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}
