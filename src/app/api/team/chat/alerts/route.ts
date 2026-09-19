import { prisma } from "@/lib/prisma";
import { teamRoute } from "@/lib/team";
import { pushConfigured } from "@/lib/push";
export const GET = teamRoute(async (u, req) => {
  const sinceRaw = req.nextUrl.searchParams.get("since");
  const since = sinceRaw && Number.isFinite(Date.parse(sinceRaw)) ? new Date(sinceRaw) : null;
  const baseline = new Date();
  const after = req.nextUrl.searchParams.get("after");
  const cursor = after ? await prisma.teamMessage.findUnique({where:{id:after},select:{id:true,createdAt:true}}) : null;
  const incremental = !!cursor || (!after && !!since);
  // Initial load establishes a baseline rather than sounding for old history.
  const rows = await prisma.teamMessage.findMany({
    where: cursor ? {OR:[{createdAt:{gt:cursor.createdAt}},{createdAt:cursor.createdAt,id:{gt:cursor.id}}]} : since && !after ? {createdAt:{gte:since}} : {},
    orderBy: [{createdAt:incremental ? "asc" : "desc"},{id:incremental ? "asc" : "desc"}], take:incremental ? 100 : 1,
    select:{id:true,authorId:true,createdAt:true,deletedAt:true,author:{select:{role:true}}},
  });
  return {userId:u.id,mode:u.chatSoundMode,muted:u.muteChat,
    cursor: rows.at(-1)?.id ?? after ?? "", initialized:!!cursor || !after,
    since:baseline.toISOString(), messages:incremental ? rows.filter(m=>!m.deletedAt).map(m=>({id:m.id,authorId:m.authorId,authorRole:m.author?.role ?? null,createdAt:m.createdAt})) : [],
    publicKey:pushConfigured() ? process.env.VAPID_PUBLIC_KEY : null,
  };
});
