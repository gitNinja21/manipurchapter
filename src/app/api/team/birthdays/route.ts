import { prisma } from "@/lib/prisma";
import { teamRoute, memberWhere } from "@/lib/team";
import { nextBirthday } from "@/lib/teamValidation";
import { todayWorkDate } from "@/lib/time";
export const GET = teamRoute(async (u) => {
  const today = todayWorkDate();
  const people = await prisma.user.findMany({
    where: {
      AND: [
        memberWhere,
        { birthdayMonth: { not: null }, birthdayDay: { not: null } },
        ...(u.role === "ADMIN"
          ? []
          : [{ OR: [{ shareBirthday: true }, { id: u.id }] }]),
      ],
    },
    select: {
      id: true,
      name: true,
      birthdayMonth: true,
      birthdayDay: true,
      shareBirthday: true,
    },
  });
  return {
    birthdays: people
      .map((p) => ({
        ...p,
        nextDate: nextBirthday(p.birthdayMonth!, p.birthdayDay!, today),
      }))
      .sort(
        (a, b) =>
          a.nextDate.localeCompare(b.nextDate) || a.name.localeCompare(b.name),
      ),
    today,
    admin: u.role === "ADMIN",
  };
});
