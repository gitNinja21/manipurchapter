"use client";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import Chat from "./Chat";
import Birthdays from "./Birthdays";
import Schedule from "./Schedule";
import Requests from "./Requests";
export default function TeamWorkspace({ admin }: { admin: boolean }) {
  const params = useSearchParams(),
    router = useRouter(),
    path = usePathname();
  const view = params.get("view") || "chat";
  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-semibold">Team space</h1>
        <p className="text-sm text-foreground/60 mt-2">
          Stay connected, plan shifts, and keep requests in one place.
        </p>
      </div>
      <nav className="flex flex-wrap gap-2" aria-label="Team sections">
        {[
          ["chat", "Chat"],
          ["birthdays", "Birthdays"],
          ["schedule", "Schedule"],
          ["requests", "Requests"],
        ].map(([id, label]) => (
          <button
            key={id}
            className={`admin-button ${view === id ? "!bg-brand !text-white" : ""}`}
            aria-current={view === id ? "page" : undefined}
            onClick={() => router.replace(`${path}?view=${id}`)}
          >
            {label}
          </button>
        ))}
      </nav>
      {view === "birthdays" ? (
        <Birthdays />
      ) : view === "schedule" ? (
        <Schedule admin={admin} />
      ) : view === "requests" ? (
        <Requests admin={admin} />
      ) : (
        <Chat />
      )}
    </div>
  );
}
