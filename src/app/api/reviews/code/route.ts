import { NextResponse } from "next/server";
import { publicReviewRoute, limitCodeAttempts, claimReviewCode, REVIEW_COOKIE, SESSION_MS } from "@/lib/customerReviewServer";
import { jsonBody } from "@/lib/team";
export const POST = publicReviewRoute(async req => {
  await limitCodeAttempts(req);
  const body = await jsonBody(req);
  const result = await claimReviewCode(body.code);
  const response = NextResponse.json({employeeName:result.employeeName,submitted:false});
  response.cookies.set(REVIEW_COOKIE,result.token,{httpOnly:true,secure:process.env.NODE_ENV === "production",sameSite:"strict",path:"/api/reviews",maxAge:SESSION_MS/1000});
  return response;
});
