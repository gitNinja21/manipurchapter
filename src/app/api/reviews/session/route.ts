import { NextResponse } from "next/server";
import { publicReviewRoute, reviewSession } from "@/lib/customerReviewServer";
export const GET = publicReviewRoute(async req => {
  const invite = await reviewSession(req);
  return NextResponse.json({employeeName:invite.user.name,submitted:!!invite.usedAt});
});
