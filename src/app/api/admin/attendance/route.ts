import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { todayWorkDate } from "@/lib/time";
import { validRange } from "@/lib/reporting";
import type { Prisma } from "@prisma/client";
export async function GET(req: NextRequest) {
  if (!(await requireAdmin()))
    return NextResponse.json({ error: "Admin only." }, { status: 403 });
  const p = req.nextUrl.searchParams,
    today = todayWorkDate();
  const from = p.get("from") || today,
    to = p.get("to") || today;
  if (!validRange(from, to))
    return NextResponse.json(
      { error: "Choose a valid date range." },
      { status: 400 },
    );
  const status = p.get("status"),
    q = p.get("q") || "";
  const page = Math.max(
    1,
    Math.min(100000, Math.floor(Number(p.get("page")) || 1)),
  );
  const where: Prisma.AttendanceRecordWhereInput = {
    userId: p.get("userId") || undefined,
    workDate: { gte: from, lte: to },
    ...(q
      ? {
          user: {
            OR: [{ name: { contains: q } }, { employeeCode: { contains: q } }],
          },
        }
      : {}),
  };
  if (status === "INCOMPLETE") {
    where.clockInAt = { not: null };
    where.clockOutAt = null;
    where.workDate = { gte: from, lte: to, lt: today };
  }
  if (status === "OPEN") {
    where.clockInAt = { not: null };
    where.clockOutAt = null;
    where.workDate = { gte: from, lte: to, equals: today };
  }
  if (status && ["PENDING", "APPROVED", "REJECTED"].includes(status)) {
    where.approvalStatus = status;
    where.clockInAt = { not: null };
    where.clockOutAt = { not: null };
  }
  const [records, total] = await prisma.$transaction([
    prisma.attendanceRecord.findMany({
      where,
      include: { user: { select: { name: true, employeeCode: true } } },
      orderBy: [{ workDate: "desc" }, { id: "desc" }],
      skip: (page - 1) * 50,
      take: 50,
    }),
    prisma.attendanceRecord.count({ where }),
  ]);
  return NextResponse.json({ records, total });
}
