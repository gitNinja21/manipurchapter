"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function LoginForm() {
  const router = useRouter();
  const [employeeCode, setEmployeeCode] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ employeeCode, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Something went wrong. Please try again.");
        setLoading(false);
        return;
      }
      if (data.user.role === "ADMIN") {
        router.push("/admin");
      } else if (data.user.mustChangePassword) {
        router.push("/onboarding");
      } else if (!data.user.approved) {
        router.push("/pending-approval");
      } else {
        router.push("/employee");
      }
      router.refresh();
    } catch {
      setError("Could not reach the server. Check your connection and try again.");
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label htmlFor="employeeCode" className="block text-sm font-medium text-foreground/80 mb-1">
          Login ID
        </label>
        <input
          id="employeeCode"
          value={employeeCode}
          onChange={(e) => setEmployeeCode(e.target.value)}
          autoCapitalize="characters"
          autoComplete="username"
          placeholder="e.g. MC-014"
          className="w-full rounded-lg border border-border bg-white px-4 py-2.5 text-foreground placeholder:text-foreground/40 focus:outline-none focus:ring-2 focus:ring-brand/40 focus:border-brand"
          required
        />
      </div>
      <div>
        <label htmlFor="password" className="block text-sm font-medium text-foreground/80 mb-1">
          Password
        </label>
        <input
          id="password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
          placeholder="••••••••"
          className="w-full rounded-lg border border-border bg-white px-4 py-2.5 text-foreground placeholder:text-foreground/40 focus:outline-none focus:ring-2 focus:ring-brand/40 focus:border-brand"
          required
        />
      </div>

      {error && (
        <p className="text-sm text-danger bg-danger/10 border border-danger/20 rounded-lg px-3 py-2">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={loading}
        className="w-full rounded-lg bg-brand text-white font-medium py-2.5 hover:bg-brand-dark transition-colors disabled:opacity-60"
      >
        {loading ? "Signing in…" : "Sign in"}
      </button>

      <p className="text-xs text-foreground/50 text-center pt-1">
        New here?{" "}
        <Link href="/signup" className="text-brand underline underline-offset-2 hover:text-brand-dark">
          Create your account
        </Link>
        .
      </p>
    </form>
  );
}
