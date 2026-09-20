import { teamRoute } from "@/lib/team";
import { getHomeSummary } from "@/lib/homeSummary";
export const GET = teamRoute(async (user) => getHomeSummary(user));
