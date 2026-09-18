import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { validRange } from "@/lib/reporting";
import { todayWorkDate } from "@/lib/time";
export async function GET(req: NextRequest) {
  if (!(await requireAdmin()))
    return NextResponse.json({ error: "Admin only." }, { status: 403 });
  const p = req.nextUrl.searchParams;
  const from = p.get("from") || `${todayWorkDate().slice(0, 7)}-01`,
    to = p.get("to") || todayWorkDate();
  if (!validRange(from, to))
    return NextResponse.json(
      { error: "Choose a valid date range." },
      { status: 400 },
    );
  const q = p.get("q") || "",
    action = p.get("action") || undefined;
  const page = Math.max(1, Math.min(100000, Number(p.get("page")) || 1));
  const where = {
    workDate: { gte: from, lte: to },
    action,
    ...(q
      ? {
          OR: [
            { employeeName: { contains: q } },
            { employeeCode: { contains: q } },
            { actorName: { contains: q } },
          ],
        }
      : {}),
  };
  const [entries, total] = await prisma.$transaction([
    prisma.attendanceAudit.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: (Math.floor(page) - 1) * 50,
      take: 50,
    }),
    prisma.attendanceAudit.count({ where }),
  ]);
  return NextResponse.json({ entries, total });
}
