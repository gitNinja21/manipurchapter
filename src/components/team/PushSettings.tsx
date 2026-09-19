"use client";
import { useEffect, useState } from "react";
import { api, useAction, useTeamData } from "./useTeamData";
import { ErrorNotice } from "./TeamCommon";
export default function PushSettings() {
  const { data, error } = useTeamData<{
    configured: boolean;
    publicKey: string | null;
  }>("/api/team/push");
  const [supported, setSupported] = useState(false),
    [enabled, setEnabled] = useState(false),
    [message, setMessage] = useState("");
  const action = useAction();
  useEffect(() => {
    const ok =
      window.isSecureContext &&
      "serviceWorker" in navigator &&
      "PushManager" in window &&
      "Notification" in window;
    setSupported(ok);
    if (ok)
      void navigator.serviceWorker
        .getRegistration("/")
        .then((r) => r?.pushManager.getSubscription())
        .then((s) => setEnabled(!!s))
        .catch(() => {});
  }, []);
  async function toggle() {
    setMessage("");
    await action.run(async () => {
      if (enabled) {
        const reg = await navigator.serviceWorker.getRegistration("/");
        const sub = await reg?.pushManager.getSubscription();
        if (sub) {
          await api("/api/team/push", "DELETE", { endpoint: sub.endpoint });
          await sub.unsubscribe();
        }
        setEnabled(false);
        setMessage("Push notifications disabled on this device.");
        return;
      }
      if (!data?.publicKey) throw new Error("Push is not configured yet.");
      const permission = await Notification.requestPermission();
      if (permission !== "granted")
        throw new Error(
          "Notifications were not allowed. You can change this in your browser settings.",
        );
      await navigator.serviceWorker.register("/sw.js");
      const reg = await navigator.serviceWorker.ready;
      const sub =
        (await reg.pushManager.getSubscription()) ||
        (await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: data.publicKey,
        }));
      try {
        await api("/api/team/push", "POST", sub.toJSON());
      } catch (error) {
        await sub.unsubscribe().catch(() => false);
        setEnabled(false);
        throw error;
      }
      setEnabled(true);
      setMessage("Announcement and team chat alerts enabled on this device.");
    });
  }
  return (
    <section className="admin-panel p-5 space-y-3">
      <h2 className="font-semibold">Device notifications</h2>
      <p className="text-sm text-foreground/60">
        Optional alerts for announcements and team messages when this site is closed. Your phone controls notification sounds and silent mode. In-app
        notifications work without this setting.
      </p>
      <ErrorNotice error={error || action.error} />
      {!supported ? (
        <p className="text-sm text-foreground/60">
          This browser does not currently support push here. On iPhone, try
          adding the site to your Home Screen and opening it there.
        </p>
      ) : data && !data.configured ? (
        <p className="text-sm text-foreground/60">
          Push delivery is awaiting administrator setup. Your in-app
          notification bell is ready.
        </p>
      ) : (
        <button
          className="admin-button"
          disabled={!data?.configured || action.busy}
          onClick={() => void toggle()}
        >
          {action.busy
            ? "Updating…"
            : enabled
              ? "Disable on this device"
              : "Enable on this device"}
        </button>
      )}
      {message && (
        <p role="status" className="text-sm text-success">
          {message}
        </p>
      )}
    </section>
  );
}
