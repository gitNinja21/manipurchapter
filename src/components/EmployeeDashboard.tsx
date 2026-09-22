"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import HomeSummary from "@/components/team/HomeSummary";
import FaceCapture from "@/components/FaceCapture";
import { formatIstTime } from "@/lib/time";

type TodayRecord = {
  clockInAt: string | null;
  clockOutAt: string | null;
  workDate: string;
  unpaidBreakMinutes: number;
  policyVersion: number;
  extraTimeCutoff: string | null;
  extraTimeStatus: string;
  lateClockOutStatus?: string;
} | null;

type Announcement = {
  id: string;
  title: string;
  body: string;
  createdAt: string;
  author: { name: string };
};

const ANNOUNCEMENTS_PREVIEW_COUNT = 3;

export default function EmployeeDashboard({ previewEmployeeId }: { previewEmployeeId?: string }) {
  const preview = !!previewEmployeeId;
  const employeeQuery = encodeURIComponent(previewEmployeeId ?? "");
  const todayUrl = preview ? `/api/admin/employee-dashboard?employeeId=${employeeQuery}&section=today` : "/api/attendance/today";
  const [serverTime, setServerTime] = useState<string | null>(null);
  const [meetings, setMeetings] = useState<{ id: string; kind: string }[]>([]);
  const [schedule, setSchedule] = useState<{arrival: string; latest: string; opening: string; finish: string; fixed: boolean; allowEarly: boolean; durationHours: number; unpaidBreakMinutes: number} | null>(null);
  const [policy, setPolicy] = useState(false);
  const [arrival, setArrival] = useState<string | null>(null);
  const [lateStatus, setLateStatus] = useState<string | null>(null);
  const [extraTimeReason, setExtraTimeReason] = useState("");
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

  const refresh = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      const res = await fetch(todayUrl, { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not load attendance.");
      setError(null);
      setRecord(data.record ?? null);
      setServerTime(data.serverTime ?? null);
      setMeetings(data.meetings ?? []);
      setPolicy(!!data.policy);
      setSchedule(data.schedule ?? null);
      setArrival(data.arrivalState);
      setLateStatus(data.lateRequest?.status ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load attendance. Please refresh.");
    } finally { setLoading(false); }
  }, [todayUrl]);

  useEffect(() => {
    void refresh();
    const timer = setInterval(() => { if (!document.hidden) void refresh(true); }, 30000);
    return () => clearInterval(timer);
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
    if (preview) return;
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
    if (preview) return;
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
          ...(action === "out" ? {extraTimeReason} : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Something went wrong.");
        setMode("idle");
        return;
      }
      window.dispatchEvent(new Event("attendance-updated"));
      setMessage(
        action === "in"
          ? "Clocked in! Have a great shift."
          : data.record?.lateClockOutStatus === "PENDING" ? "Clock-out recorded. Time after 10:45 pm is awaiting admin approval." : "Clocked out. See you next time!",
      );
      setMode("idle");
      setAction(null);
      setExtraTimeReason("");
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
          {serverTime ? new Date(serverTime).toLocaleDateString("en-IN", {
            timeZone: "Asia/Kolkata",
            weekday: "long",
            day: "numeric",
            month: "long",
          }) : "Loading date…"}
        </p>
      </div>

      <Link className="text-brand underline block" href={preview ? `/admin/team?view=performance&employeeId=${employeeQuery}` : "/employee/team?view=performance"}>My points, attendance incidents and manager clearance</Link>
      {!policy && <p className="text-sm text-foreground/60">{arrival === "OFF" ? "No shift is scheduled today. Ask your admin to assign a shift if you are working." : "Complete your scheduled hours from clock-in, including the one-hour break."}</p>}
      {record && record.policyVersion !== 2 && <p className="text-sm text-accent">This record uses an earlier attendance policy. Ask your manager if its schedule needs correction.</p>}
      {policy && (!record || record.policyVersion === 2) && (
        <section className="admin-panel p-4 space-y-2 text-sm">
          <h2 className="font-semibold">Your daily attendance rules · IST</h2>
          <p>{schedule?.fixed ? "Scheduled start:" : "Clock-in window:"} {schedule?.arrival} IST. Complete {schedule?.durationHours} hours from actual clock-in, including a 1-hour break.</p>
          <p>Clock out when you actually leave. Required finish: {schedule?.finish}. Leaving before completing the shift is an early departure. Plan to clock out by 10:30–10:45 pm IST. Clocking out after 10:45 pm requires admin approval. Always record your actual leaving time.</p>
          <p>Clock-in opens at {schedule?.opening} IST, up to 15 minutes before your scheduled start (or the beginning of your arrival window). For an earlier start, submit a shift-change request and get admin approval. Same-day requests are allowed. Your required finish moves with your actual clock-in.</p>
          {!preview && <Link className="text-brand underline block" href="/employee/team?view=requests&kind=SHIFT_CHANGE">Request an earlier start / shift change</Link>}
          {!hasClockedIn && arrival === "EARLY" && <p>Clock-in opens at {schedule?.opening}.</p>}
          {!hasClockedIn && lateStatus && <p>Today’s late-arrival request: <strong>{lateStatus}</strong>.</p>}
          {!hasClockedIn && !preview && <Link className="text-brand underline block" href="/employee/team?view=requests&kind=LATE_ARRIVAL">Request an excused late arrival</Link>}
          {!hasClockedIn && arrival === "LATE" && lateStatus !== "APPROVED" && <p className="text-accent">Clock in when you arrive. More than 15 minutes late is an incident; after three consecutive incidents, manager clearance is required. After that meeting, further late arrivals receive negative points.</p>}
        </section>
      )}
      {!preview && record?.clockInAt && !record.clockOutAt && mode !== "submitting" && (
        <label className="admin-panel p-4 block text-sm">
          Reason (optional)
          <textarea className="input mt-2" rows={3} maxLength={1000} value={extraTimeReason} onChange={e => setExtraTimeReason(e.target.value)} placeholder="Add a note about your clock-out, if needed" />
          <span className="block text-xs text-foreground/60 mt-2">You can leave this blank. If you leave after 10:45 pm, your clock-out will be sent for admin approval.</span>
        </label>
      )}
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
              disabled={preview || arrival === "OFF" || (policy && arrival === "EARLY")}
              className="w-full rounded-lg bg-brand text-white font-medium py-3 hover:bg-brand-dark transition-colors disabled:opacity-50"
            >
              Clock In
            </button>
          ) : !hasClockedOut ? (
            <button
              onClick={() => startCapture("out")}
              disabled={preview}
              className="w-full rounded-lg bg-accent text-white font-medium py-3 hover:brightness-95 transition-[filter] disabled:opacity-50"
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

      {record?.lateClockOutStatus === "PENDING" && <p className="admin-panel p-4 text-sm text-accent">Your clock-out after 10:45 pm is awaiting admin approval. See Team → Requests.</p>}
      {record?.lateClockOutStatus === "REJECTED" && <p className="admin-panel p-4 text-sm text-accent">The time after 10:45 pm was not approved. See Team → Requests.</p>}
      {preview && meetings.length > 0 && (
        <div className="admin-panel p-4 text-sm text-accent">
          Manager clearance pending: {meetings.map(m => m.kind === "LATE" ? "Late arrivals" : "Early departures").join(", ")}. Open points and attendance above to review.
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
          <HomeSummary previewEmployeeId={previewEmployeeId} />
          <AnnouncementsPreview
            items={announcements}
            preview={preview}
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
  preview = false,
}: {
  preview?: boolean;
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
          href={preview ? "/admin/announcements" : "/employee/announcements"}
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
