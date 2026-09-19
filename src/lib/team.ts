import { NextRequest, NextResponse } from "next/server";
import type { User, Prisma } from "@prisma/client";
import { getCurrentUser } from "./auth";
export class TeamError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
export function teamRoute(
  handler: (user: User, req: NextRequest) => Promise<unknown>,
) {
  return async (req: NextRequest) => {
    try {
      const user = await getCurrentUser();
      if (
        !user ||
        (user.role !== "ADMIN" && (!user.approved || user.mustChangePassword))
      )
        throw new TeamError("An active, approved account is required.", 403);
      return NextResponse.json(await handler(user, req));
    } catch (e) {
      if (e instanceof TeamError)
        return NextResponse.json({ error: e.message }, { status: e.status });
      if (e && typeof e === "object" && "code" in e && ["P2002", "P2034", "P1008"].includes(String(e.code)))
        return NextResponse.json({error: "This item was changed or already exists. Refresh and try again."}, {status: 409});
      console.error(
        "Team request failed",
        e instanceof Error ? e.name : "Error",
      );
      return NextResponse.json(
        { error: "Could not complete the request. Please try again." },
        { status: 500 },
      );
    }
  };
}
export function adminOnly(user: User) {
  if (user.role !== "ADMIN") throw new TeamError("Admin only.", 403);
}
export async function jsonBody(req: Request): Promise<Record<string, unknown>> {
  try {
    const value = await req.json();
    if (!value || typeof value !== "object" || Array.isArray(value))
      throw new Error();
    return value;
  } catch {
    throw new TeamError("Invalid request body.");
  }
}
export function textField(value: unknown, label: string, max = 2000) {
  if (typeof value !== "string" || !value.trim() || value.trim().length > max)
    throw new TeamError(`${label} is required (maximum ${max} characters).`);
  return value.trim();
}
export const memberWhere = {
  active: true,
  OR: [
    { role: "ADMIN" },
    { role: "EMPLOYEE", approved: true, mustChangePassword: false },
  ],
};
export async function notify(
  tx: Prisma.TransactionClient,
  users: { id: string; role: string }[],
  kind: string,
  entityKey: string,
  title: string,
  path: string,
  createdAt?: Date,
) {
  for (const u of users)
    await tx.notification.upsert({
      where: { userId_kind_entityKey: { userId: u.id, kind, entityKey } },
      create: {
        userId: u.id,
        kind,
        entityKey,
        title,
        createdAt,
        href: `/${u.role === "ADMIN" ? "admin" : "employee"}/${path}`,
      },
      update: {},
    });
}
