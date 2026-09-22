import { NextResponse } from "next/server";
import { publicReviewRoute, reviewSession } from "@/lib/customerReviewServer";
import { prisma } from "@/lib/prisma";
export const GET = publicReviewRoute(async req => {
  const invite = await reviewSession(req);
  const ratings = invite.usedAt ? await prisma.customerReview.findUnique({
    where: {inviteId: invite.id},
    select: {friendliness:true, attentiveness:true, accuracy:true, speed:true, overall:true},
  }) : null;
  return NextResponse.json({employeeName:invite.user.name,submitted:!!invite.usedAt,ratings});
});
