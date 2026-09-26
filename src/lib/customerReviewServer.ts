import { createHash, createHmac, randomBytes, randomInt } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { getCurrentUser } from "./auth";
import { TeamError } from "./team";
import { reviewScore } from "./customerReviews";
import { workDateFor } from "./time";
export const REVIEW_COOKIE = "mc_customer_review";
export const CODE_MS = 5 * 60000;
export const SESSION_MS = 15 * 60000;
const eligible = { role: "EMPLOYEE", active: true, approved: true, mustChangePassword: false };
const hash = (token: string) => createHash("sha256").update(token).digest("hex");

// SQLite serializes writers. Retry uniqueness/lock conflicts instead of ever sharing a code.
export async function reviewTransaction<T>(fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try { return await prisma.$transaction(fn); }
    catch (e) {
      const code = e && typeof e === "object" && "code" in e ? String(e.code) : "";
      if (attempt >= 7 || !["P2002", "P2034", "P1008"].includes(code)) throw e;
      await new Promise(resolve => setTimeout(resolve, 20 + randomInt(60)));
    }
  }
}
export async function issueReviewCode(userId: string) {
  return reviewTransaction(async tx => {
    const now = new Date();
    if (!await tx.user.findFirst({ where: { id: userId, ...eligible } })) throw new TeamError("An active employee account is required.", 403);
    // Expiry releases only the short code; an already claimed customer session remains bound to its invite.
    await tx.customerReviewInvite.updateMany({where:{expiresAt:{lte:now},activeUserId:{not:null}},data:{code:null,activeUserId:null}});
    const existing = await tx.customerReviewInvite.findUnique({where:{activeUserId:userId}});
    if (existing) return existing;
    const recent = await tx.customerReviewInvite.findFirst({where:{userId,createdAt:{gt:new Date(+now-30000)}}});
    if (recent) throw new TeamError("Wait a few seconds before generating another code.", 429);
    return tx.customerReviewInvite.create({data:{userId,createdAt:now,activeUserId:userId,code:String(randomInt(1000,10000)),expiresAt:new Date(+now+CODE_MS)}});
  });
}
export async function limitCodeAttempts(req: NextRequest) {
  // The deployment's reverse proxy must replace/sanitize forwarded IP headers.
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() || req.headers.get("x-real-ip") || "unknown";
  const bucket = Math.floor(Date.now() / CODE_MS);
  const key = createHmac("sha256", process.env.JWT_SECRET!).update(`review:${ip}:${bucket}`).digest("hex");
  const row = await reviewTransaction(async tx => {
    await tx.reviewRateLimit.deleteMany({where:{expiresAt:{lte:new Date()}}});
    return tx.reviewRateLimit.upsert({where:{key},create:{key,count:1,expiresAt:new Date((bucket+1)*CODE_MS)},update:{count:{increment:1}}});
  });
  if (row.count > 30) throw new TeamError("Too many code attempts. Please wait five minutes and try again.", 429);
}
export async function claimReviewCode(code: unknown, inviteId?: unknown) {
  if (typeof code !== "string" || !/^\d{4}$/.test(code)) throw new TeamError("Enter the four-digit code from your server.");
  const token = randomBytes(32).toString("hex");
  const invite = await reviewTransaction(async tx => {
    const now = new Date();
    const current = await tx.customerReviewInvite.findFirst({where:{code,...(inviteId === undefined ? {} : {id:typeof inviteId === "string" ? inviteId : ""}),expiresAt:{gt:now},claimedAt:null,usedAt:null,user:eligible},select:{id:true,user:{select:{name:true}}}});
    if (!current) throw new TeamError("This code has expired or has already been used. Ask your server for a new code.", 410);
    const changed = await tx.customerReviewInvite.updateMany({where:{id:current.id,claimedAt:null,expiresAt:{gt:now},usedAt:null},data:{claimedAt:now,tokenHash:hash(token),sessionExpiresAt:new Date(+now+SESSION_MS)}});
    if (!changed.count) throw new TeamError("This code has already been used.", 409);
    return current;
  });
  return { token, employeeName: invite.user.name };
}
export async function reviewSession(req: NextRequest) {
  const token = req.cookies.get(REVIEW_COOKIE)?.value;
  if (!token || !/^[a-f0-9]{64}$/.test(token)) throw new TeamError("Enter a new code to start your review.", 401);
  const invite = await prisma.customerReviewInvite.findFirst({where:{tokenHash:hash(token),sessionExpiresAt:{gt:new Date()},user:eligible},include:{user:{select:{name:true}}}});
  if (!invite) throw new TeamError("Your review session has expired. Ask your server for a new code.", 410);
  return invite;
}
export async function submitReview(req: NextRequest, body: unknown) {
  const score = reviewScore(body);
  if (!score) throw new TeamError("Please select 1–5 stars for all five questions.");
  const session = await reviewSession(req);
  return reviewTransaction(async tx => {
    const prior = await tx.customerReview.findUnique({where:{inviteId:session.id}});
    if (prior) return {ok:true}; // Retries never award points twice.
    const now = new Date();
    const changed = await tx.customerReviewInvite.updateMany({where:{id:session.id,usedAt:null,sessionExpiresAt:{gt:now},user:eligible},data:{usedAt:now,code:null,activeUserId:null}});
    if (!changed.count) throw new TeamError("This review has expired or has already been submitted.", 409);
    await tx.customerReview.create({data:{userId:session.userId,inviteId:session.id,...score.ratings,totalStars:score.totalStars,points:score.points,workDate:workDateFor(now),createdAt:now}});
    return {ok:true};
  });
}
export function publicReviewRoute(handler: (req: NextRequest) => Promise<NextResponse>) {
  return async (req: NextRequest) => {
    try {
      // A code grants review access only, never an employee login.
      if (await getCurrentUser()) throw new TeamError("Customer reviews must be completed on the customer's device, without a staff login.",403);
      if (req.method !== "GET" && !req.headers.get("content-type")?.includes("application/json")) throw new TeamError("Expected a JSON request.",415);
      const response = await handler(req);
      response.headers.set("Cache-Control","no-store");
      return response;
    } catch(e) {
      const known = e instanceof TeamError;
      if (!known) console.error("Customer review request failed", e instanceof Error ? e.name : "Error");
      return NextResponse.json({error:known ? e.message : "Could not save your review. Please try again."},{status:known ? e.status : 500,headers:{"Cache-Control":"no-store"}});
    }
  };
}
