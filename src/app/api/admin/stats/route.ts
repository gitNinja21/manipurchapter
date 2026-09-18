import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { computeStatsForRange } from "@/lib/stats";
import { validRange } from "@/lib/reporting";
import { todayWorkDate } from "@/lib/time";

function firstOfMonth(workDate: string): string {
  const [y, m] = workDate.split("-");
  return `${y}-${m}-01`;
}

export async function GET(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin)
    return NextResponse.json({ error: "Admin only." }, { status: 403 });

  const url = new URL(req.url);
  const today = todayWorkDate();
  const from = url.searchParams.get("from") || firstOfMonth(today);
  const to = url.searchParams.get("to") || today;

  if (!validRange(from, to))
    return NextResponse.json(
      { error: "Choose a valid date range." },
      { status: 400 },
    );

  const stats = await computeStatsForRange(from, to);

  const totals = stats.reduce(
    (acc, s) => ({
      totalHours: acc.totalHours + s.totalHours,
      totalSalaryRs: acc.totalSalaryRs + s.salaryRs,
      totalMissed: acc.totalMissed + s.missedDays,
      totalPendingApproval: acc.totalPendingApproval + s.pendingApprovalDays,
      totalOvertimeHours: acc.totalOvertimeHours + s.overtimeHours,
      totalBonusPayRs: acc.totalBonusPayRs + s.bonusPayRs,
      totalOffDaysPayRs: acc.totalOffDaysPayRs + s.offDaysPayRs,
    }),
    {
      totalHours: 0,
      totalSalaryRs: 0,
      totalMissed: 0,
      totalPendingApproval: 0,
      totalOvertimeHours: 0,
      totalBonusPayRs: 0,
      totalOffDaysPayRs: 0,
    },
  );

  return NextResponse.json({ from, to, stats, totals });
}
