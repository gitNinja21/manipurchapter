"use client";
import { todayWorkDate } from "@/lib/time";
import { weekStart } from "@/lib/reporting";
export default function ReportControls({
  from,
  to,
  onChange,
}: {
  from: string;
  to: string;
  onChange: (from: string, to: string) => void;
}) {
  const today = todayWorkDate();
  return (
    <div className="flex flex-wrap items-end gap-3">
      <div
        className="flex w-full sm:w-auto flex-wrap gap-1"
        aria-label="Date shortcuts"
      >
        {[
          ["Today", today],
          ["This week", weekStart(today)],
          ["This month", `${today.slice(0, 7)}-01`],
        ].map(([label, start]) => (
          <button
            type="button"
            key={label}
            aria-pressed={from === start && to === today}
            className={`admin-button ${from === start && to === today ? "!bg-brand !text-white !border-brand" : ""}`}
            onClick={() => onChange(start, today)}
          >
            {label}
          </button>
        ))}
      </div>
      <label className="min-w-0 flex-1 sm:flex-none sm:w-44 text-xs text-foreground/65">
        From (IST)
        <input
          aria-label="From date"
          type="date"
          className="input mt-1 min-w-0"
          value={from}
          max={to}
          onChange={(e) => onChange(e.target.value, to)}
        />
      </label>
      <label className="min-w-0 flex-1 sm:flex-none sm:w-44 text-xs text-foreground/65">
        To (IST)
        <input
          aria-label="To date"
          type="date"
          className="input mt-1 min-w-0"
          value={to}
          min={from}
          max={today}
          onChange={(e) => onChange(from, e.target.value)}
        />
      </label>
    </div>
  );
}
