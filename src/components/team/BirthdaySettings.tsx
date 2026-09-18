"use client";
import { useEffect, useState } from "react";
import { api, useTeamData, useAction } from "./useTeamData";
import { ErrorNotice } from "./TeamCommon";
type Profile = {
  birthdayMonth: number | null;
  birthdayDay: number | null;
  shareBirthday: boolean;
  muteChat: boolean;
};
export default function BirthdaySettings() {
  const { data, error } = useTeamData<{ profile: Profile }>(
    "/api/team/profile",
  );
  const [month, setMonth] = useState(""),
    [day, setDay] = useState(""),
    [share, setShare] = useState(false),
    [saved, setSaved] = useState(false);
  const action = useAction();
  useEffect(() => {
    if (data) {
      setMonth(
        data.profile.birthdayMonth ? String(data.profile.birthdayMonth) : "",
      );
      setDay(data.profile.birthdayDay ? String(data.profile.birthdayDay) : "");
      setShare(data.profile.shareBirthday);
    }
  }, [data]);
  return (
    <form
      className="admin-panel p-5 space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        setSaved(false);
        void action
          .run(() =>
            api("/api/team/profile", "PATCH", {
              birthdayMonth: month ? Number(month) : null,
              birthdayDay: day ? Number(day) : null,
              shareBirthday: share,
            }),
          )
          .then((ok) => setSaved(ok));
      }}
    >
      <h2 className="font-semibold">Your birthday</h2>
      <p className="text-sm text-foreground/60">
        Only day and month are stored. Admins can see your birthday; sharing
        with the team is optional.
      </p>
      <div className="grid grid-cols-2 gap-3">
        <label className="text-sm">
          Month
          <select
            className="input mt-1"
            value={month}
            onChange={(e) => {
              setMonth(e.target.value);
              setSaved(false);
            }}
          >
            <option value="">Not set</option>
            {Array.from({ length: 12 }, (_, i) => (
              <option value={i + 1} key={i}>
                {new Date(2000, i, 1).toLocaleString("en", { month: "long" })}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          Day
          <input
            className="input mt-1"
            type="number"
            min="1"
            max="31"
            value={day}
            onChange={(e) => {
              setDay(e.target.value);
              setSaved(false);
            }}
          />
        </label>
      </div>
      <label className="flex gap-2 text-sm">
        <input
          type="checkbox"
          checked={share}
          onChange={(e) => {
            setShare(e.target.checked);
            setSaved(false);
          }}
        />
        Show my birthday to the team
      </label>
      <ErrorNotice error={error || action.error} />
      <div className="flex gap-2">
        <button disabled={action.busy || !data} className="admin-button">
          {action.busy ? "Saving…" : "Save birthday"}
        </button>
        <button
          type="button"
          className="admin-button"
          onClick={() => {
            setMonth("");
            setDay("");
            setShare(false);
            setSaved(false);
          }}
        >
          Clear fields
        </button>
      </div>
      {saved && (
        <p role="status" className="text-sm text-success">
          Birthday preference saved.
        </p>
      )}
    </form>
  );
}
