"use client";
import { useCallback, useEffect, useState } from "react";
export async function api<T>(
  url: string,
  method = "GET",
  body?: unknown,
  signal?: AbortSignal,
): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal,
    cache: "no-store",
  });
  const data = await res.json();
  if (!res.ok)
    throw new Error(data.error || "Request failed. Please try again.");
  return data;
}
export function useTeamData<T>(url: string, interval = 0) {
  const [data, setData] = useState<T | null>(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [version, setVersion] = useState(0);
  const reload = useCallback(() => setVersion((v) => v + 1), []);
  useEffect(() => {
    const c = new AbortController();
    let busy = false;
    setLoading(true);
    setData(null);
    setError("");
    const load = async () => {
      if (busy) return;
      busy = true;
      try {
        const d = await api<T>(url, "GET", undefined, c.signal);
        if (!c.signal.aborted) {
          setData(d);
          setError("");
        }
      } catch (e) {
        if (!c.signal.aborted)
          setError(e instanceof Error ? e.message : "Could not load.");
      } finally {
        busy = false;
        if (!c.signal.aborted) setLoading(false);
      }
    };
    void load();
    const timer = interval
      ? setInterval(() => {
          if (document.visibilityState === "visible") void load();
        }, interval)
      : null;
    return () => {
      c.abort();
      if (timer) clearInterval(timer);
    };
  }, [url, interval, version]);
  return { data, error, loading, reload };
}
export function useAction(reload?: () => void) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    setError("");
    try {
      await fn();
      reload?.();
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save.");
      return false;
    } finally {
      setBusy(false);
    }
  }
  return { busy, error, run };
}
