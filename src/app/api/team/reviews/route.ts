import { prisma } from "@/lib/prisma";
import { teamRoute, TeamError } from "@/lib/team";
import { issueReviewCode } from "@/lib/customerReviewServer";
import { todayWorkDate } from "@/lib/time";
export const GET = teamRoute(async (u, req) => {
  const month = req.nextUrl.searchParams.get("month") || todayWorkDate().slice(0,7);
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new TeamError("Choose a valid month.");
  const employeeId = u.role === "ADMIN" ? req.nextUrl.searchParams.get("employeeId") : u.id;
  const where = { ...(employeeId ? {userId:employeeId} : {}), workDate:{startsWith:month} };
  const page = Math.max(1,Math.min(10000,Math.floor(Number(req.nextUrl.searchParams.get("page")) || 1)));
  const [reviews, total, summary, invite, employees] = await Promise.all([
    prisma.customerReview.findMany({where,orderBy:[{createdAt:"desc"},{id:"desc"}],skip:(page-1)*30,take:30,select:{id:true,createdAt:true,friendliness:true,attentiveness:true,accuracy:true,speed:true,overall:true,totalStars:true,points:true,user:{select:{id:true,name:true}}}}),
    prisma.customerReview.count({where}),
    prisma.customerReview.aggregate({where,_sum:{points:true,totalStars:true}}),
    u.role === "EMPLOYEE" ? prisma.customerReviewInvite.findFirst({where:{activeUserId:u.id,expiresAt:{gt:new Date()}},select:{code:true,expiresAt:true,claimedAt:true}}) : null,
    u.role === "ADMIN" ? prisma.user.findMany({where:{role:"EMPLOYEE"},select:{id:true,name:true},orderBy:{name:"asc"}}) : [],
  ]);
  return {reviews,total,points:Math.round((summary._sum.points ?? 0)*100)/100,average:total ? Math.round((summary._sum.totalStars ?? 0)/total/5*100)/100 : null,invite,employees,serverTime:new Date().toISOString()};
});
export const POST = teamRoute(async u => {
  if (u.role !== "EMPLOYEE") throw new TeamError("Generate codes from your employee account.",403);
  const invite = await issueReviewCode(u.id);
  return {invite:{code:invite.code,expiresAt:invite.expiresAt,claimedAt:invite.claimedAt},serverTime:new Date().toISOString()};
});
