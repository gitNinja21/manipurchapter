import { prisma } from "@/lib/prisma";
import { adminOnly, teamRoute } from "@/lib/team";
export const GET = teamRoute(async user => {
  adminOnly(user);
  const employees = await prisma.user.findMany({ where: { role: "EMPLOYEE", active: true, approved: true },
    select: { id: true, name: true, employeeCode: true }, orderBy: { name: "asc" } });
  return { employees };
});
