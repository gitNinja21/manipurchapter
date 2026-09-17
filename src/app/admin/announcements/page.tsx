"use client";

import { useEffect, useState, useCallback } from "react";

type Announcement = {
  id: string;
  title: string;
  body: string;
  createdAt: string;
  author: { name: string };
};

export default function AdminAnnouncementsPage() {
  const [items, setItems] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [posting, setPosting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/announcements");
    const data = await res.json();
    setItems(data.announcements ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handlePost(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setPosting(true);
    const res = await fetch("/api/announcements", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, body }),
    });
    const data = await res.json();
    setPosting(false);
    if (!res.ok) {
      setError(data.error || "Could not post announcement.");
      return;
    }
    setTitle("");
    setBody("");
    load();
  }

  async function handleDelete(id: string) {
    const res = await fetch(`/api/announcements/${id}`, { method: "DELETE" });
    if (res.ok) setItems((prev) => prev.filter((a) => a.id !== id));
    return res.ok;
  }

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="font-[family-name:var(--font-display)] text-2xl font-bold">
        Announcements
      </h1>

      <form onSubmit={handlePost} className="bg-surface border border-border rounded-2xl p-5 space-y-4">
        <div>
          <label className="block text-sm text-foreground/55 mb-1">Title</label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Early close on Sunday"
            className="input"
            required
          />
        </div>
        <div>
          <label className="block text-sm text-foreground/55 mb-1">Message</label>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Write what the team needs to know…"
            rows={4}
            className="input resize-none"
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
          disabled={posting}
          className="rounded-lg bg-brand text-white text-sm font-medium px-4 py-2 hover:bg-brand-dark transition-colors disabled:opacity-60"
        >
          {posting ? "Posting…" : "Post announcement"}
        </button>
      </form>

      {loading ? (
        <p className="text-sm text-foreground/50">Loading…</p>
      ) : (
        <div className="space-y-3">
          {items.map((a) => (
            <div key={a.id} className="bg-surface border border-border rounded-2xl p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="font-semibold text-foreground">{a.title}</h2>
                  <p className="text-xs text-foreground/40 mt-0.5">
                    {new Date(a.createdAt).toLocaleString("en-IN")} · {a.author.name}
                  </p>
                </div>
                <DeleteAnnouncementButton onDelete={() => handleDelete(a.id)} />
              </div>
              <p className="text-sm text-foreground/75 whitespace-pre-wrap leading-relaxed mt-2">
                {a.body}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function DeleteAnnouncementButton({ onDelete }: { onDelete: () => Promise<boolean> }) {
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState(false);

  if (deleting) {
    return <span className="text-xs text-foreground/40 whitespace-nowrap">Deleting…</span>;
  }

  if (confirming) {
    return (
      <div className="flex items-center gap-2 whitespace-nowrap">
        {error && <span className="text-xs text-danger">Failed</span>}
        <button
          type="button"
          onClick={async () => {
            setDeleting(true);
            setError(false);
            const ok = await onDelete();
            if (!ok) {
              setError(true);
              setDeleting(false);
            }
          }}
          className="text-xs bg-danger text-white rounded px-2 py-1 hover:brightness-110"
        >
          Confirm
        </button>
        <button
          type="button"
          onClick={() => setConfirming(false)}
          className="text-xs text-foreground/50 hover:text-foreground/80"
        >
          Cancel
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setConfirming(true)}
      className="text-xs text-danger underline underline-offset-2 hover:text-danger/80 whitespace-nowrap"
    >
      Delete
    </button>
  );
}
