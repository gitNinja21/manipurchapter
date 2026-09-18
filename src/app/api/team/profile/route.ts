import { prisma } from "@/lib/prisma";
import { teamRoute, jsonBody, TeamError } from "@/lib/team";
import { validBirthday } from "@/lib/teamValidation";
export const GET = teamRoute(async (u) => ({
  profile: {
    birthdayMonth: u.birthdayMonth,
    birthdayDay: u.birthdayDay,
    shareBirthday: u.shareBirthday,
    muteChat: u.muteChat,
  },
  role: u.role,
  userId: u.id,
}));
export const PATCH = teamRoute(async (u, req) => {
  const b = await jsonBody(req);
  const data: {
    birthdayMonth?: number | null;
    birthdayDay?: number | null;
    shareBirthday?: boolean;
    muteChat?: boolean;
  } = {};
  if ("birthdayMonth" in b || "birthdayDay" in b) {
    if (b.birthdayMonth === null && b.birthdayDay === null) {
      data.birthdayMonth = null;
      data.birthdayDay = null;
    } else {
      if (!validBirthday(b.birthdayMonth, b.birthdayDay))
        throw new TeamError("Choose a valid birthday day and month.");
      data.birthdayMonth = Number(b.birthdayMonth);
      data.birthdayDay = Number(b.birthdayDay);
    }
  }
  for (const k of ["shareBirthday", "muteChat"] as const)
    if (k in b) {
      if (typeof b[k] !== "boolean") throw new TeamError("Invalid preference.");
      data[k] = b[k] as boolean;
    }
  await prisma.user.update({ where: { id: u.id }, data });
  return { ok: true };
});
