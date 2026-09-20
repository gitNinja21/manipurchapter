import type { Prisma } from "@prisma/client";
export async function retireExtraTimeRequests(tx: Prisma.TransactionClient, userId: string, workDate: string) {
  await tx.staffRequest.updateMany({
    where: {userId,kind:"EXTRA_TIME",fromDate:workDate,status:"PENDING"},
    data: {status:"CANCELLED",reviewNote:"Extra-time review retired; eligible hours count automatically."},
  });
}
