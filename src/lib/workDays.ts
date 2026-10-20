import type { Prisma } from "@prisma/client";
export async function workDayMode(db:Prisma.TransactionClient,date:string) {
  return (await db.workDayOverride.findUnique({where:{workDate:date}}))?.mode ?? null;
}
export async function paidClosureDates(db:Prisma.TransactionClient) {
  return new Set((await db.workDayOverride.findMany({where:{mode:"PAID_OFF"}})).map(d=>d.workDate));
}
