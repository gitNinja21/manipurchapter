import type { Prisma } from "@prisma/client";
import { notify, memberWhere } from "./team";

export async function requestExtraTime(tx: Prisma.TransactionClient, record: {
  id: string; userId: string; workDate: string; clockInAt: Date | null;
  clockOutAt: Date | null; updatedAt: Date;
}, name: string, reason: string) {
  // A corrected shift supersedes its old pending extra-time request.
  await tx.staffRequest.updateMany({
    where: { userId: record.userId, kind: "EXTRA_TIME", fromDate: record.workDate, status: "PENDING" },
    data: { status: "CANCELLED", reviewNote: "Replaced by an updated attendance record." },
  });
  const request = await tx.staffRequest.create({data: {
    userId: record.userId, kind: "EXTRA_TIME", fromDate: record.workDate, toDate: record.workDate,
    reason, proposedIn: record.clockInAt, proposedOut: record.clockOutAt,
    expectedRecordId: record.id, expectedUpdatedAt: record.updatedAt,
  }});
  const admins = await tx.user.findMany({where: {...memberWhere, role: "ADMIN"}, select: {id: true, role: true}});
  await notify(tx, admins, "REQUEST", request.id, `${name}: time after 10:30 pm needs review`, "team?view=requests");
}
