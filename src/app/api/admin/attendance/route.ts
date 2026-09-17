import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { todayWorkDate } from "@/lib/time";

export async function GET(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Admin only." }, { status: 403 });

  const url = new URL(req.url);
  const userId = url.searchParams.get("userId") || undefined;
  const today = todayWorkDate();
  const from = url.searchParams.get("from") || today;
  const to = url.searchParams.get("to") || today;

  const records = await prisma.attendanceRecord.findMany({
    where: {
      userId,
      workDate: { gte: from, lte: to },
    },
    include: { user: { select: { name: true, employeeCode: true } } },
    orderBy: [{ workDate: "desc" }, { clockInAt: "desc" }],
    take: 200,
  });

  return NextResponse.json({ records });
}
