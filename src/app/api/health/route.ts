import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const headers = { "Cache-Control": "no-store" };
  try {
    // Check the actual application database/table, not just the HTTP listener.
    // An empty database is fine provided its schema is accessible.
    await prisma.user.findFirst({ select: { id: true } });
    return Response.json({ status: "ok" }, { headers });
  } catch {
    // Public endpoint: never expose database paths, credentials or query errors.
    return Response.json({ status: "unavailable" }, { status: 503, headers });
  }
}
