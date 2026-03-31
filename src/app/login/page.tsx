"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function Login() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState(false);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch("/api/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    if (res.ok) {
      router.push("/");
    } else {
      setError(true);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0f1729]">
      <form onSubmit={handleSubmit} className="text-center space-y-4">
        <h1 className="text-3xl font-extrabold bg-gradient-to-r from-[#ef4444] to-[#3b82f6] bg-clip-text text-transparent">
          slushie.machine
        </h1>
        <input
          type="password"
          value={password}
          onChange={(e) => { setPassword(e.target.value); setError(false); }}
          placeholder="Password"
          className={`block w-64 px-3 py-2 text-sm bg-white/[0.05] border rounded-lg text-white placeholder:text-white/30 focus:outline-none focus:border-blue-500 ${
            error ? "border-red-500" : "border-white/10"
          }`}
          autoFocus
        />
        <button
          type="submit"
          className="w-64 py-2 rounded-lg bg-gradient-to-r from-red-500 to-blue-500 text-white text-sm font-medium"
        >
          Enter
        </button>
      </form>
    </div>
  );
}
