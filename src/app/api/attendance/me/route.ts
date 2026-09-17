import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const records = await prisma.attendanceRecord.findMany({
    where: { userId: user.id },
    orderBy: { workDate: "desc" },
    take: 90,
  });

  return NextResponse.json({ records });
}
