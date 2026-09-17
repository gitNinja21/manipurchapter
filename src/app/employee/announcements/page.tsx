"use client";

import { useEffect, useState } from "react";

type Announcement = {
  id: string;
  title: string;
  body: string;
  createdAt: string;
  author: { name: string };
};

export default function EmployeeAnnouncementsPage() {
  const [items, setItems] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/announcements")
      .then((r) => r.json())
      .then((data) => setItems(data.announcements ?? []))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      <h1 className="font-[family-name:var(--font-display)] text-2xl font-bold">Announcements</h1>

      {loading ? (
        <p className="text-sm text-foreground/50">Loading…</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-foreground/50">No announcements yet.</p>
      ) : (
        <div className="space-y-3">
          {items.map((a) => (
            <div key={a.id} className="bg-surface border border-border rounded-2xl p-5">
              <div className="flex items-center justify-between gap-3 mb-1.5">
                <h2 className="font-semibold text-foreground">{a.title}</h2>
                <span className="text-xs text-foreground/40 whitespace-nowrap">
                  {new Date(a.createdAt).toLocaleDateString("en-IN", {
                    day: "2-digit",
                    month: "short",
                  })}
                </span>
              </div>
              <p className="text-sm text-foreground/75 whitespace-pre-wrap leading-relaxed">
                {a.body}
              </p>
              <p className="text-xs text-foreground/40 mt-3">— {a.author.name}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
