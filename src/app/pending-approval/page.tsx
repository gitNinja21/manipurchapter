"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type Me = {
  name: string;
  employeeCode: string;
  role: "ADMIN" | "EMPLOYEE";
  mustChangePassword: boolean;
  approved: boolean;
  profilePhotoUrl: string | null;
} | null;

const POLL_INTERVAL_MS = 6000;

export default function PendingApprovalPage() {
  const router = useRouter();
  const [me, setMe] = useState<Me>(null);
  const [loading, setLoading] = useState(true);
  const redirectingRef = useRef(false);

  const checkStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/auth/me");
      const data = await res.json();
      if (!data.user) {
        router.push("/");
        return;
      }
      setMe(data.user);
      setLoading(false);

      if (data.user.approved && !redirectingRef.current) {
        redirectingRef.current = true;
        // The session cookie was issued before approval, so it still says
        // approved: false — refresh it before navigating, or middleware
        // would just bounce us right back here.
        await fetch("/api/auth/refresh-session", { method: "POST" });
        router.push(data.user.role === "ADMIN" ? "/admin" : "/employee");
        router.refresh();
      }
    } catch {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    checkStatus();
    const interval = setInterval(checkStatus, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [checkStatus]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="bg-surface border border-border rounded-2xl p-8 text-center space-y-4">
          {loading ? (
            <p className="text-sm text-foreground/50">Loading…</p>
          ) : (
            <>
              {me?.profilePhotoUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={me.profilePhotoUrl}
                  alt=""
                  className="w-20 h-20 rounded-full object-cover border border-border mx-auto"
                />
              )}
              <div>
                <h1 className="font-[family-name:var(--font-display)] text-xl font-bold text-foreground">
                  Almost there, {me?.name?.split(" ")[0] || "there"}
                </h1>
                <p className="text-sm text-foreground/60 mt-2 leading-relaxed">
                  Your account (<span className="font-mono">{me?.employeeCode}</span>) is waiting
                  on your admin to review and approve it. This page will move on by itself the
                  moment that happens — no need to refresh or log in again.
                </p>
              </div>
              <div className="pt-2">
                <LogoutLink />
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function LogoutLink() {
  const router = useRouter();
  return (
    <button
      type="button"
      onClick={async () => {
        await fetch("/api/auth/logout", { method: "POST" });
        router.push("/");
        router.refresh();
      }}
      className="text-sm text-foreground/50 hover:text-foreground/80 underline underline-offset-2"
    >
      Sign out
    </button>
  );
}
