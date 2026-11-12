import {submitStaffRequest} from "@/lib/staffRequestSubmission";
import {prisma} from "@/lib/prisma";
import {teamRoute,jsonBody} from "@/lib/team";
export const GET = teamRoute(async (u, req) => {
  const status = req.nextUrl.searchParams.get("status");
  const page = Math.max(
    1,
    Math.min(
      10000,
      Math.floor(Number(req.nextUrl.searchParams.get("page")) || 1),
    ),
  );
  const where = {
    ...(u.role === "ADMIN" ? {} : { userId: u.id }),
    ...(status ? { status } : {}),
    ...(status === "PENDING" ? {kind:{not:"EXTRA_TIME"}} : {}),
  };
  const [requests, total] = await prisma.$transaction([
    prisma.staffRequest.findMany({
      where,
      include: { user: { select: { name: true, employeeCode: true } } },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 30,
      skip: (page - 1) * 30,
    }),
    prisma.staffRequest.count({ where }),
  ]);
  const records = await prisma.attendanceRecord.findMany({
    where: {id: {in: requests.filter(r => r.kind === "EXTRA_TIME" && r.expectedRecordId).map(r => r.expectedRecordId!)}},
    select: {id: true, extraTimeCutoff: true},
  });
  const cutoffs = new Map(records.map(r => [r.id, r.extraTimeCutoff]));
  return { requests: requests.map(r => ({...r, extraTimeCutoff: r.expectedRecordId ? cutoffs.get(r.expectedRecordId) ?? null : null})), total, admin: u.role === "ADMIN" };
});
export const POST = teamRoute(async (u, req) => submitStaffRequest(u, await jsonBody(req)));
