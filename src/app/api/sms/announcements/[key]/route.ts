import twilio from "twilio";
import { announcementSmsConfig, processAnnouncementSmsCallback } from "@/lib/announcementSms";
export const runtime = "nodejs";
export async function POST(req: Request, {params}: {params:Promise<{key:string}>}) {
  const config = announcementSmsConfig();
  if (!config) return new Response("SMS unavailable",{status:503});
  const raw = await req.text();
  if (raw.length>16384) return new Response("Too large",{status:413});
  const fields = Object.fromEntries(new URLSearchParams(raw)), url = new URL(req.url);
  if (!twilio.validateRequest(config.token,req.headers.get("x-twilio-signature") || "",`${config.origin}${url.pathname}${url.search}`,fields) ||
      fields.AccountSid !== config.sid || !/^SM[0-9a-f]{32}$/i.test(fields.MessageSid || "")) return new Response("Invalid signature",{status:403});
  if (!await processAnnouncementSmsCallback((await params).key,fields)) return new Response("Message not found",{status:404});
  return new Response(null,{status:204});
}
