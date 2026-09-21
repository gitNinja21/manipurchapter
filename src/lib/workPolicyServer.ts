import type { Prisma } from "@prisma/client";
export async function retireExtraTimeRequests(tx: Prisma.TransactionClient, userId: string, workDate: string) {
  await tx.staffRequest.updateMany({
    where: {userId,kind:{in:["EXTRA_TIME","LATE_CLOCK_OUT"]},fromDate:workDate,status:"PENDING"},
    data: {status:"CANCELLED",reviewNote:"Superseded by an administrator-approved attendance correction."},
  });
}
