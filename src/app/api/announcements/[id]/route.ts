import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const admin = await requireAdmin();
  if (!admin)
    return NextResponse.json({ error: "Admin only." }, { status: 403 });

  const { id } = await params;
  await prisma.$transaction([
    prisma.notification.deleteMany({
      where: { kind: "ANNOUNCEMENT", entityKey: id },
    }),
    prisma.announcement.deleteMany({ where: { id } }),
  ]);

  return NextResponse.json({ ok: true });
}
