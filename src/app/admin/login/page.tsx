"use client";

import { useState } from "react";

export default function AdminLogin() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const res = await fetch("/api/admin/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });

    if (res.ok) {
      window.location.href = "/";
    } else {
      const data = await res.json();
      setError(data.error ?? "Invalid credentials");
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex bg-white">
      {/* Left accent panel */}
      <div className="hidden lg:flex lg:w-2/5 flex-col justify-between p-12 bg-[#0f1729]">
        <span className="text-sm font-mono tracking-widest text-white/30 uppercase">
          slushie.machine
        </span>
        <div>
          <h2 className="text-4xl font-black text-white leading-tight mb-4">
            Admin<br />
            <span className="bg-gradient-to-r from-[#ef4444] to-[#3b82f6] bg-clip-text text-transparent">
              Dashboard
            </span>
          </h2>
          <p className="text-white/40 text-sm leading-relaxed">
            Manage projects, features, and deployments.
          </p>
        </div>
        <span className="text-xs text-white/20 font-mono">v1</span>
      </div>

      {/* Right form panel */}
      <div className="flex-1 flex items-center justify-center px-8">
        <div className="w-full max-w-sm">
          {/* Mobile logo */}
          <div className="lg:hidden mb-10 text-center">
            <span className="text-lg font-black bg-gradient-to-r from-[#ef4444] to-[#3b82f6] bg-clip-text text-transparent">
              slushie.machine
            </span>
          </div>

          <h1 className="text-2xl font-bold text-black mb-1">Sign in</h1>
          <p className="text-sm text-black/40 mb-8">Enter your admin credentials to continue</p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="email" className="block text-xs font-semibold text-black/50 uppercase tracking-wider mb-1.5">
                Email
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => { setEmail(e.target.value); setError(null); }}
                placeholder="admin@example.com"
                autoComplete="email"
                autoFocus
                required
                className="w-full px-4 py-3 bg-black text-white placeholder:text-white/30 text-sm rounded-lg border border-black focus:outline-none focus:ring-2 focus:ring-black focus:ring-offset-2 focus:ring-offset-white"
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-xs font-semibold text-black/50 uppercase tracking-wider mb-1.5">
                Password
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => { setPassword(e.target.value); setError(null); }}
                placeholder="••••••••"
                autoComplete="current-password"
                required
                className="w-full px-4 py-3 bg-black text-white placeholder:text-white/30 text-sm rounded-lg border border-black focus:outline-none focus:ring-2 focus:ring-black focus:ring-offset-2 focus:ring-offset-white"
              />
            </div>

            {error && (
              <p className="text-xs text-red-600 font-medium">{error}</p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 mt-2 rounded-lg bg-black text-white text-sm font-semibold tracking-wide hover:bg-neutral-800 active:bg-neutral-900 transition-colors disabled:opacity-50"
            >
              {loading ? "Signing in…" : "Sign in"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
