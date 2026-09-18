"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import HomeSummary from "@/components/team/HomeSummary";
import FaceCapture from "@/components/FaceCapture";
import { formatIstTime } from "@/lib/time";

type TodayRecord = {
  clockInAt: string | null;
  clockOutAt: string | null;
} | null;

type Announcement = {
  id: string;
  title: string;
  body: string;
  createdAt: string;
  author: { name: string };
};

const ANNOUNCEMENTS_PREVIEW_COUNT = 3;

export default function EmployeeClockPage() {
  const [record, setRecord] = useState<TodayRecord>(null);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<
    "idle" | "locating" | "capturing" | "submitting"
  >("idle");
  const [action, setAction] = useState<"in" | "out" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [announcementsLoading, setAnnouncementsLoading] = useState(true);
  const coordsRef = useRef<{ lat: number; lng: number } | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/attendance/today");
    const data = await res.json();
    setRecord(data.record ?? null);
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    fetch("/api/announcements")
      .then((r) => r.json())
      .then((data) =>
        setAnnouncements(
          (data.announcements ?? []).slice(0, ANNOUNCEMENTS_PREVIEW_COUNT),
        ),
      )
      .finally(() => setAnnouncementsLoading(false));
  }, []);

  const hasClockedIn = !!record?.clockInAt;
  const hasClockedOut = !!record?.clockOutAt;

  async function startCapture(which: "in" | "out") {
    setError(null);
    setMessage(null);
    coordsRef.current = null;

    // Grab the device's location before opening the camera. This is only
    // ever enforced server-side if the restaurant's location has been
    // configured — but we ask for it up front either way, so a genuinely
    // out-of-range employee finds out immediately instead of after going
    // through the whole photo flow.
    if (typeof navigator !== "undefined" && navigator.geolocation) {
      setMode("locating");
      try {
        const position = await new Promise<GeolocationPosition>(
          (resolve, reject) => {
            navigator.geolocation.getCurrentPosition(resolve, reject, {
              enableHighAccuracy: true,
              timeout: 12000,
              maximumAge: 0,
            });
          },
        );
        coordsRef.current = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        };
      } catch (locationError) {
        const code =
          typeof locationError === "object" &&
          locationError !== null &&
          "code" in locationError
            ? locationError.code
            : undefined;
        const retryAction = which === "in" ? "Clock In" : "Clock Out";
        const guidance =
          code === 1
            ? "Location access is blocked. Turn on Location Services on your phone and allow location for this website in your browser's site settings."
            : code === 2
              ? "Your phone couldn't find your location. Check that Location Services and Precise Location are on, then try again near a window or the entrance."
              : code === 3
                ? "Finding your location took too long. Check that Location Services are on, then try again near a window or the entrance."
                : "We couldn't check your location. Check your phone's Location Services and this website's location permission. If you opened the link inside another app, open it directly in Chrome or Safari.";
        setError(`${guidance} Then tap ${retryAction} to retry. Your attendance has not been saved.`);
        setMode("idle");
        return;
      }
    }

    setAction(which);
    setMode("capturing");
  }

  async function handleCaptured(photoDataUrl: string, descriptor: number[]) {
    setMode("submitting");
    try {
      const res = await fetch(`/api/attendance/clock-${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          photoDataUrl,
          descriptor,
          lat: coordsRef.current?.lat,
          lng: coordsRef.current?.lng,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Something went wrong.");
        setMode("idle");
        return;
      }
      setMessage(
        action === "in"
          ? "Clocked in! Have a great shift."
          : "Clocked out. See you next time!",
      );
      setMode("idle");
      setAction(null);
      refresh();
    } catch {
      setError("Could not reach the server. Please try again.");
      setMode("idle");
    }
  }

  return (
    <div className="max-w-md mx-auto space-y-6">
      <div className="text-center">
        <h1 className="font-[family-name:var(--font-display)] text-2xl font-bold text-foreground">
          Today
        </h1>
        <p className="text-sm text-foreground/55 mt-1">
          {new Date().toLocaleDateString("en-IN", {
            weekday: "long",
            day: "numeric",
            month: "long",
          })}
        </p>
      </div>

      {loading ? (
        <div className="bg-surface border border-border rounded-2xl p-8 text-center text-sm text-foreground/50">
          Loading…
        </div>
      ) : mode === "locating" ? (
        <div className="bg-surface border border-border rounded-2xl p-8 text-center text-sm text-foreground/50">
          <p role="status">Checking your location…</p>
          <p className="mt-2 text-xs leading-relaxed">
            If your browser asks for location access, choose Allow so we can
            check that you are at the restaurant.
          </p>
        </div>
      ) : mode === "capturing" ? (
        <div className="bg-surface border border-border rounded-2xl p-6">
          <p className="text-center text-sm font-medium text-foreground/70 mb-4">
            {action === "in" ? "Clocking in" : "Clocking out"}
          </p>
          <FaceCapture
            mode="verify"
            onCaptured={handleCaptured}
            onCancel={() => {
              setMode("idle");
              setAction(null);
            }}
          />
        </div>
      ) : (
        <div className="bg-surface border border-border rounded-2xl p-6 space-y-5">
          <StatusRow
            label="Clocked in"
            time={
              record?.clockInAt
                ? formatIstTime(new Date(record.clockInAt))
                : null
            }
          />
          <StatusRow
            label="Clocked out"
            time={
              record?.clockOutAt
                ? formatIstTime(new Date(record.clockOutAt))
                : null
            }
          />

          {mode === "submitting" ? (
            <div className="text-center text-sm text-foreground/55 py-2">
              Saving…
            </div>
          ) : !hasClockedIn ? (
            <button
              onClick={() => startCapture("in")}
              className="w-full rounded-lg bg-brand text-white font-medium py-3 hover:bg-brand-dark transition-colors"
            >
              Clock In
            </button>
          ) : !hasClockedOut ? (
            <button
              onClick={() => startCapture("out")}
              className="w-full rounded-lg bg-accent text-white font-medium py-3 hover:brightness-95 transition-[filter]"
            >
              Clock Out
            </button>
          ) : (
            <p className="text-center text-sm text-success bg-success/10 border border-success/20 rounded-lg py-2.5">
              You&apos;re all done for today. 🎉
            </p>
          )}
        </div>
      )}

      {error && (
        <p role="alert" className="text-sm text-danger bg-danger/10 border border-danger/20 rounded-lg px-3 py-2 text-center">
          {error}
        </p>
      )}
      {message && (
        <p className="text-sm text-success bg-success/10 border border-success/20 rounded-lg px-3 py-2 text-center">
          {message}
        </p>
      )}

      {mode !== "capturing" && mode !== "locating" && (
        <>
          <HomeSummary />
          <AnnouncementsPreview
            items={announcements}
            loading={announcementsLoading}
          />
        </>
      )}
    </div>
  );
}

function AnnouncementsPreview({
  items,
  loading,
}: {
  items: Announcement[];
  loading: boolean;
}) {
  if (loading) return null;
  if (items.length === 0) return null;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-foreground/70">
          Announcements
        </h2>
        <Link
          href="/employee/announcements"
          className="text-xs text-brand underline underline-offset-2 hover:text-brand-dark"
        >
          See all
        </Link>
      </div>
      <div className="space-y-2.5">
        {items.map((a) => (
          <div
            key={a.id}
            className="bg-surface border border-border rounded-2xl p-4"
          >
            <div className="flex items-center justify-between gap-3">
              <h3 className="font-medium text-foreground text-sm">{a.title}</h3>
              <span className="text-xs text-foreground/40 whitespace-nowrap">
                {new Date(a.createdAt).toLocaleDateString("en-IN", {
                  day: "2-digit",
                  month: "short",
                })}
              </span>
            </div>
            <p className="text-sm text-foreground/65 leading-relaxed mt-1 line-clamp-2">
              {a.body}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

function StatusRow({ label, time }: { label: string; time: string | null }) {
  return (
    <div className="flex items-center justify-between">
      <p className="text-sm text-foreground/55">{label}</p>
      <p className="text-lg font-semibold">{time ?? "—"}</p>
    </div>
  );
}
