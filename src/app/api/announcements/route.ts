import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const announcements = await prisma.announcement.findMany({
    orderBy: { createdAt: "desc" },
    take: 50,
    include: { author: { select: { name: true } } },
  });

  return NextResponse.json({ announcements });
}

export async function POST(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Admin only." }, { status: 403 });

  let body: { title?: string; body?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const title = (body.title || "").trim();
  const text = (body.body || "").trim();
  if (!title || !text) {
    return NextResponse.json({ error: "Title and message are required." }, { status: 400 });
  }

  const announcement = await prisma.announcement.create({
    data: { title, body: text, authorId: admin.id },
    include: { author: { select: { name: true } } },
  });

  return NextResponse.json({ announcement });
}
