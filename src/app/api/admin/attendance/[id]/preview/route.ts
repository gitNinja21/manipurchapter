import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { computeStatsForRange } from "@/lib/stats";
import { todayWorkDate } from "@/lib/time";
import { isApprovalStatus } from "@/lib/attendanceApproval";
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!(await requireAdmin()))
    return NextResponse.json({ error: "Admin only." }, { status: 403 });
  const status = req.nextUrl.searchParams.get("status") || "APPROVED";
  if (!isApprovalStatus(status))
    return NextResponse.json({ error: "Invalid status." }, { status: 400 });
  const { id } = await params;
  const record = await prisma.attendanceRecord.findUnique({ where: { id } });
  if (!record)
    return NextResponse.json({ error: "Shift not found." }, { status: 404 });
  if (record.extraTimeStatus === "PENDING" && status === "APPROVED")
    return NextResponse.json({error: "Review the extra-time request in Team → Requests before approving attendance."}, {status: 409});
  const from = `${record.workDate.slice(0, 7)}-01`;
  const end = new Date(`${from}T00:00:00Z`);
  end.setUTCMonth(end.getUTCMonth() + 1);
  end.setUTCDate(0);
  const to = [end.toISOString().slice(0, 10), todayWorkDate()].sort()[0];
  const [before, after] = await Promise.all([
    computeStatsForRange(from, to, {
      userId: record.userId,
      recordId: id,
      approvalStatus: record.approvalStatus,
    }),
    computeStatsForRange(from, to, {
      userId: record.userId,
      recordId: id,
      approvalStatus: status,
    }),
  ]);
  return NextResponse.json({
    from,
    to,
    before: before[0],
    after: after[0],
    expectedUpdatedAt: record.updatedAt.toISOString(),
  });
}
