import type { Prisma } from "@prisma/client";
import { TeamError } from "./team";

export function announcementWhere(user: { id: string; role: string }): Prisma.AnnouncementWhereInput {
  return user.role === "ADMIN" ? {} : { OR: [{ audience: "LEGACY_ALL" }, { recipients: { some: { userId: user.id } } }] };
}
export async function announcementRecipients(tx: Prisma.TransactionClient, audience: unknown, ids: unknown) {
  if (audience !== "ALL" && audience !== "SELECTED") throw new TeamError("Choose all employees or selected employees.");
  if (audience === "SELECTED" && (!Array.isArray(ids) || !ids.length || ids.length > 1000 || ids.some(id => typeof id !== "string")))
    throw new TeamError("Select at least one employee.");
  const selected = audience === "SELECTED" ? [...new Set(ids as string[])] : null;
  const users = await tx.user.findMany({ where: { role: "EMPLOYEE", active: true, approved: true,
    ...(selected ? { id: { in: selected } } : {}) }, select: { id: true, role: true, phone: true } });
  if (!users.length || (selected && users.length !== selected.length)) throw new TeamError("Some selected employees are unavailable. Refresh the employee list.");
  return users;
}
