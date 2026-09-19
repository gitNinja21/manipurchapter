"use client";

import { useEffect, useState, useCallback } from "react";

type Employee = {
  id: string;
  employeeCode: string;
  points?: number;
  name: string;
  hourlyRateRs: number;
  active: boolean;
  approved: boolean;
  createdAt: string;
  mustChangePassword: boolean;
  phone?: string | null;
  alternatePhone?: string | null;
  address?: string | null;
  hobbies?: string | null;
  profilePhoto?: string | null;
};

export default function EmployeesPage() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [loadError, setLoadError] = useState("");
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [justAdded, setJustAdded] = useState<{
    employeeCode: string;
    defaultPassword: string;
  } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      const res = await fetch("/api/admin/employees");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not load employees.");
      setEmployees(data.employees ?? []);
    } catch (e) {
      setLoadError(
        e instanceof Error ? e.message : "Could not load employees.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setStatus(params.get("status") || "all");
    setQuery(params.get("q") || "");
    load();
  }, [load]);

  const matches = employees.filter((e) =>
    `${e.name} ${e.employeeCode}`.toLowerCase().includes(query.toLowerCase()),
  );
  const pending = matches.filter(
    (e) => !e.approved && (status === "all" || status === "pending"),
  );
  const approvedEmployees = matches.filter(
    (e) =>
      e.approved &&
      status !== "pending" &&
      (status === "all" ||
        (status === "active" && e.active) ||
        (status === "inactive" && !e.active)),
  );

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-[family-name:var(--font-display)] text-2xl font-bold">
          Employees
        </h1>
        <p className="text-sm text-foreground/55 mt-1">
          Employees create their own account at the sign-up page and take a
          reference photo — review and approve them below before they can clock
          in.
        </p>
      </div>

      <div className="admin-panel p-4 flex flex-wrap gap-3">
        <label className="flex-1 min-w-48">
          <span className="sr-only">Search employees</span>
          <input
            className="input"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search employee name or ID…"
          />
        </label>
        <label>
          <span className="sr-only">Employee status</span>
          <select
            className="input"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            <option value="all">All employees</option>
            <option value="pending">Awaiting account approval</option>
            <option value="active">Active employees</option>
            <option value="inactive">Inactive employees</option>
          </select>
        </label>
      </div>
      {loadError && (
        <p role="alert" className="text-danger">
          {loadError}{" "}
          <button className="underline" onClick={load}>
            Try again
          </button>
        </p>
      )}
      {!loading && pending.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-foreground/70">
            Pending signups
            <span className="ml-2 inline-flex items-center justify-center rounded-full bg-accent/15 text-accent text-xs font-semibold w-5 h-5">
              {pending.length}
            </span>
          </h2>
          <div className="space-y-3">
            {pending.map((emp) => (
              <PendingSignupCard key={emp.id} employee={emp} onDecided={load} />
            ))}
          </div>
        </div>
      )}

      <div className="bg-surface border border-border rounded-2xl overflow-hidden">
        <div className="admin-table-scroll">
          <table className="w-full text-sm min-w-[720px]">
            <thead>
              <tr className="bg-surface-muted text-foreground/60 text-left">
                <th className="px-4 py-2.5 font-medium">Name</th>
                <th className="px-4 py-2.5 font-medium">Login ID</th>
                <th className="px-4 py-2.5 font-medium">Rate/hr</th>
                <th className="px-4 py-2.5 font-medium">Status</th>
                <th className="px-4 py-2.5 font-medium">Onboarding</th>
                <th className="px-4 py-2.5 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td
                    colSpan={6}
                    className="px-4 py-6 text-center text-foreground/45"
                  >
                    Loading…
                  </td>
                </tr>
              ) : approvedEmployees.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="px-4 py-6 text-center text-foreground/45"
                  >
                    No approved employees match this view.
                  </td>
                </tr>
              ) : (
                approvedEmployees.map((emp) => (
                  <EmployeeRow
                    key={emp.id}
                    employee={emp}
                    editing={editingId === emp.id}
                    onToggleEdit={() =>
                      setEditingId(editingId === emp.id ? null : emp.id)
                    }
                    onSaved={() => {
                      setEditingId(null);
                      load();
                    }}
                  />
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="border-t border-border pt-6">
        <button
          onClick={() => {
            setShowAdd((v) => !v);
            setJustAdded(null);
          }}
          className="text-sm text-foreground/55 underline underline-offset-2 hover:text-foreground/80"
        >
          {showAdd ? "Close" : "Add an employee manually instead"}
        </button>
        <p className="text-xs text-foreground/45 mt-1">
          For someone who can&apos;t sign up themselves (e.g. no smartphone) —
          most employees should use the sign-up page instead.
        </p>

        {justAdded && (
          <div className="mt-4 bg-success/10 border border-success/20 rounded-xl px-4 py-3 text-sm text-foreground/80">
            Added{" "}
            <span className="font-semibold">{justAdded.employeeCode}</span>.
            Give them this login ID and starting password:{" "}
            <span className="font-mono bg-white border border-border rounded px-1.5 py-0.5">
              {justAdded.defaultPassword}
            </span>
            . They&apos;ll be asked to set their own password and profile the
            first time they sign in.
          </div>
        )}

        {showAdd && (
          <div className="mt-4">
            <AddEmployeeForm
              onDone={(added) => {
                setShowAdd(false);
                setJustAdded(added);
                load();
              }}
            />
          </div>
        )}
      </div>
    </div>
  );
}

function PendingSignupCard({
  employee,
  onDecided,
}: {
  employee: Employee;
  onDecided: () => void;
}) {
  const [rate, setRate] = useState(employee.hourlyRateRs || 100);
  const [rejecting, setRejecting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleApprove() {
    setSaving(true);
    setError(null);
    const res = await fetch(`/api/admin/employees/${employee.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ approved: true, hourlyRateRs: rate }),
    });
    const data = await res.json().catch(() => ({}));
    setSaving(false);
    if (!res.ok) {
      setError(data.error || "Could not approve this signup.");
      return;
    }
    onDecided();
  }

  async function handleReject() {
    setSaving(true);
    setError(null);
    const res = await fetch(`/api/admin/employees/${employee.id}`, {
      method: "DELETE",
    });
    const data = await res.json().catch(() => ({}));
    setSaving(false);
    if (!res.ok) {
      setError(data.error || "Could not reject this signup.");
      return;
    }
    onDecided();
  }

  return (
    <div className="bg-surface border border-accent/30 rounded-2xl p-5 flex flex-col sm:flex-row gap-4">
      {employee.profilePhoto ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={`/api/photos/${employee.profilePhoto}`}
          alt=""
          className="w-20 h-20 rounded-xl object-cover border border-border flex-shrink-0"
        />
      ) : (
        <div className="w-20 h-20 rounded-xl bg-surface-muted border border-border flex-shrink-0" />
      )}
      <div className="flex-1 text-sm space-y-1">
        <p className="font-semibold text-foreground">
          {employee.name}{" "}
          <span className="font-mono text-xs font-normal text-foreground/50">
            {employee.employeeCode}
          </span>
        </p>
        <p className="text-foreground/60">Phone: {employee.phone || "—"}</p>
        <p className="text-foreground/60">Address: {employee.address || "—"}</p>
        {employee.hobbies && (
          <p className="text-foreground/60">Hobbies: {employee.hobbies}</p>
        )}

        {!rejecting ? (
          <div className="flex flex-wrap items-center gap-3 pt-2">
            <label className="text-xs text-foreground/55 flex items-center gap-1.5">
              Rate ₹/hr
              <input
                type="number"
                min={0}
                value={rate}
                onChange={(e) => setRate(Number(e.target.value))}
                className="input !w-20 !py-1"
              />
            </label>
            <button
              type="button"
              onClick={handleApprove}
              disabled={saving}
              className="rounded-lg bg-success text-white text-sm font-medium px-3 py-1.5 hover:brightness-95 transition-[filter] disabled:opacity-60"
            >
              {saving ? "…" : "Approve"}
            </button>
            <button
              type="button"
              onClick={() => setRejecting(true)}
              className="text-sm text-danger/80 underline underline-offset-2 hover:text-danger"
            >
              Reject
            </button>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-3 pt-2">
            <span className="text-sm text-danger">
              Reject and delete this signup?
            </span>
            <button
              type="button"
              onClick={handleReject}
              disabled={saving}
              className="rounded-lg bg-danger text-white text-sm font-medium px-3 py-1.5 hover:brightness-110 disabled:opacity-60"
            >
              {saving ? "…" : "Confirm reject"}
            </button>
            <button
              type="button"
              onClick={() => setRejecting(false)}
              className="text-sm text-foreground/50 hover:text-foreground/80"
            >
              Cancel
            </button>
          </div>
        )}

        {error && (
          <p className="text-sm text-danger bg-danger/10 border border-danger/20 rounded-lg px-3 py-2 mt-2">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}

function AddEmployeeForm({
  onDone,
}: {
  onDone: (added: { employeeCode: string; defaultPassword: string }) => void;
}) {
  const [employeeCode, setEmployeeCode] = useState("");
  const [name, setName] = useState("");
  const [hourlyRateRs, setHourlyRateRs] = useState(100);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    const res = await fetch("/api/admin/employees", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ employeeCode, name, hourlyRateRs }),
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) {
      setError(data.error || "Could not add employee.");
      return;
    }
    onDone({
      employeeCode: data.employee.employeeCode,
      defaultPassword: data.defaultPassword,
    });
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="bg-surface border border-border rounded-2xl p-5 grid sm:grid-cols-2 gap-4"
    >
      <Field label="Login ID">
        <input
          value={employeeCode}
          onChange={(e) => setEmployeeCode(e.target.value)}
          placeholder="e.g. MC-014"
          className="input"
          required
        />
      </Field>
      <Field label="Full name">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Priya Singh"
          className="input"
          required
        />
      </Field>
      <Field label="Hourly rate (₹)">
        <input
          type="number"
          min={0}
          value={hourlyRateRs}
          onChange={(e) => setHourlyRateRs(Number(e.target.value))}
          className="input"
          required
        />
      </Field>
      <p className="text-xs text-foreground/50 self-end pb-2">
        They&apos;ll start on a shared default password and set their own on
        first sign-in.
      </p>

      {error && (
        <p className="sm:col-span-2 text-sm text-danger bg-danger/10 border border-danger/20 rounded-lg px-3 py-2">
          {error}
        </p>
      )}

      <div className="sm:col-span-2">
        <button
          type="submit"
          disabled={saving}
          className="rounded-lg bg-brand text-white text-sm font-medium px-4 py-2 hover:bg-brand-dark transition-colors disabled:opacity-60"
        >
          {saving ? "Adding…" : "Add employee"}
        </button>
      </div>
    </form>
  );
}

function EmployeeRow({
  employee,
  editing,
  onToggleEdit,
  onSaved,
}: {
  employee: Employee;
  editing: boolean;
  onToggleEdit: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(employee.name);
  const [hourlyRateRs, setHourlyRateRs] = useState(employee.hourlyRateRs);
  const [active, setActive] = useState(employee.active);
  const [newPassword, setNewPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setError(null);
    setSaving(true);
    const res = await fetch(`/api/admin/employees/${employee.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        hourlyRateRs,
        active,
        newPassword: newPassword || undefined,
      }),
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) {
      setError(data.error || "Could not save changes.");
      return;
    }
    onSaved();
  }

  async function handleForceOnboarding() {
    setError(null);
    setSaving(true);
    const res = await fetch(`/api/admin/employees/${employee.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ resetOnboarding: true }),
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) {
      setError(data.error || "Could not update employee.");
      return;
    }
    onSaved();
  }

  return (
    <>
      <tr className="border-t border-border">
        <td className="px-4 py-2.5 font-medium">{employee.name} <a href="/admin/team?view=performance" className="admin-badge" title="Current month points">{employee.points ?? 0} pts</a></td>
        <td className="px-4 py-2.5 font-mono text-xs">
          {employee.employeeCode}
        </td>
        <td className="px-4 py-2.5">₹{employee.hourlyRateRs}</td>
        <td className="px-4 py-2.5">
          {employee.active ? (
            <span className="text-success">Active</span>
          ) : (
            <span className="text-danger">Deactivated</span>
          )}
        </td>
        <td className="px-4 py-2.5">
          {employee.mustChangePassword ? (
            <span className="text-accent">Pending</span>
          ) : (
            <span className="text-success">Complete</span>
          )}
        </td>
        <td className="px-4 py-2.5 text-right">
          <button
            onClick={onToggleEdit}
            className="text-sm text-brand underline underline-offset-2 hover:text-brand-dark"
          >
            {editing ? "Close" : "Edit"}
          </button>
        </td>
      </tr>
      {editing && (
        <tr className="border-t border-border bg-surface-muted/60">
          <td colSpan={6} className="px-4 py-4">
            <div className="grid sm:grid-cols-2 gap-4 max-w-xl">
              <Field label="Full name">
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="input"
                />
              </Field>
              <Field label="Hourly rate (₹)">
                <input
                  type="number"
                  min={0}
                  value={hourlyRateRs}
                  onChange={(e) => setHourlyRateRs(Number(e.target.value))}
                  className="input"
                />
              </Field>
              <Field label="Reset password (optional)">
                <input
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Leave blank to keep current"
                  className="input"
                />
              </Field>
              <label className="flex items-center gap-2 text-sm mt-6">
                <input
                  type="checkbox"
                  checked={active}
                  onChange={(e) => setActive(e.target.checked)}
                />
                Active (can log in and clock in/out)
              </label>
            </div>

            {!employee.mustChangePassword && (
              <div className="mt-4 max-w-xl text-sm text-foreground/70 bg-white border border-border rounded-lg p-3 space-y-1">
                <p className="font-medium text-foreground/80 mb-1">
                  Profile on file
                </p>
                <p>Phone: {employee.phone || "—"}</p>
                <p>Alternate phone: {employee.alternatePhone || "—"}</p>
                <p>Address: {employee.address || "—"}</p>
                <p>Hobbies: {employee.hobbies || "—"}</p>
                <button
                  type="button"
                  onClick={handleForceOnboarding}
                  disabled={saving}
                  className="mt-2 text-sm text-brand underline underline-offset-2 hover:text-brand-dark disabled:opacity-60"
                >
                  Send back through onboarding (e.g. to retake their photo)
                </button>
              </div>
            )}

            {error && (
              <p className="mt-3 text-sm text-danger bg-danger/10 border border-danger/20 rounded-lg px-3 py-2 max-w-xl">
                {error}
              </p>
            )}

            <div className="mt-4 flex items-center gap-3">
              <button
                onClick={handleSave}
                disabled={saving}
                className="rounded-lg bg-brand text-white text-sm font-medium px-4 py-2 hover:bg-brand-dark transition-colors disabled:opacity-60"
              >
                {saving ? "Saving…" : "Save changes"}
              </button>
            </div>

            <div className="mt-6 pt-4 border-t border-border max-w-xl">
              <DeleteEmployeeButton employee={employee} onDeleted={onSaved} />
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function DeleteEmployeeButton({
  employee,
  onDeleted,
}: {
  employee: Employee;
  onDeleted: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const [typedCode, setTypedCode] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete() {
    setDeleting(true);
    setError(null);
    const res = await fetch(`/api/admin/employees/${employee.id}`, {
      method: "DELETE",
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setDeleting(false);
      setError(data.error || "Could not delete employee.");
      return;
    }
    onDeleted();
  }

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="text-sm text-danger/80 underline underline-offset-2 hover:text-danger"
      >
        Delete employee permanently
      </button>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-sm text-danger font-medium">
        This permanently deletes {employee.name} ({employee.employeeCode}) —
        their login and every attendance record, photo, and salary figure with
        it. This cannot be undone. Deactivating (above) is the reversible
        option.
      </p>
      <p className="text-sm text-foreground/60">
        Type{" "}
        <span className="font-mono font-semibold">{employee.employeeCode}</span>{" "}
        to confirm:
      </p>
      <div className="flex items-center gap-2">
        <input
          value={typedCode}
          onChange={(e) => setTypedCode(e.target.value)}
          placeholder={employee.employeeCode}
          className="input !w-auto max-w-[10rem]"
        />
        <button
          type="button"
          onClick={handleDelete}
          disabled={
            deleting ||
            typedCode.trim().toUpperCase() !==
              employee.employeeCode.toUpperCase()
          }
          className="text-sm bg-danger text-white rounded-lg px-3 py-2 hover:brightness-110 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {deleting ? "Deleting…" : "Permanently delete"}
        </button>
        <button
          type="button"
          onClick={() => {
            setConfirming(false);
            setTypedCode("");
            setError(null);
          }}
          className="text-sm text-foreground/50 hover:text-foreground/80"
        >
          Cancel
        </button>
      </div>
      {error && (
        <p className="text-sm text-danger bg-danger/10 border border-danger/20 rounded-lg px-3 py-2">
          {error}
        </p>
      )}
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="text-sm block">
      <span className="block text-foreground/55 mb-1">{label}</span>
      {children}
    </label>
  );
}
