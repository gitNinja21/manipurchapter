import { prisma } from "@/lib/prisma";
import { adminOnly, teamRoute, TeamError } from "@/lib/team";
import { getAttendanceToday } from "@/lib/employeeDashboard";
import { getHomeSummary } from "@/lib/homeSummary";

// Explicit target on a read-only admin endpoint; the login/session never changes.
export const GET = teamRoute(async (admin, req) => {
  adminOnly(admin);
  const employeeId = req.nextUrl.searchParams.get("employeeId");
  const section = req.nextUrl.searchParams.get("section") ?? "today";
  if (!employeeId || !["today", "home"].includes(section))
    throw new TeamError("Choose an employee and a valid dashboard section.");
  const employee = await prisma.user.findFirst({ where: { id: employeeId, role: "EMPLOYEE" } });
  if (!employee) throw new TeamError("Employee not found.", 404);
  if (section === "home") return getHomeSummary(employee);
  const data = await getAttendanceToday(employee);
  const r = data.record;
  return {
    ...data,
    record: r ? {
      clockInAt: r.clockInAt, clockOutAt: r.clockOutAt, workDate: r.workDate,
      unpaidBreakMinutes: r.unpaidBreakMinutes, policyVersion: r.policyVersion,
      extraTimeCutoff: r.extraTimeCutoff, extraTimeStatus: r.extraTimeStatus, lateClockOutStatus:r.lateClockOutStatus,
    } : null,
    meetings: data.meetings.map(m => ({ id: m.id, kind: m.kind })),
  };
});
