import twilio from "twilio";
import { voiceConfig, processVoiceCallback } from "@/lib/announcementVoice";
export const runtime="nodejs";
export async function POST(req:Request,{params:routeParams}:{params:Promise<{key:string}>}) {
  const config=voiceConfig();
  if(!config) return new Response("Voice unavailable",{status:503});
  const url=new URL(req.url),event=url.searchParams.get("event");
  if(!["ack","status"].includes(event || "")) return new Response("Invalid event",{status:400});
  const raw=await req.text();
  if(raw.length>16384) return new Response("Too large",{status:413});
  const params=Object.fromEntries(new URLSearchParams(raw));
  if(!twilio.validateRequest(config.token,req.headers.get("x-twilio-signature") || "",`${config.origin}${url.pathname}${url.search}`,params) || params.AccountSid!==config.sid || !/^CA[0-9a-f]{32}$/i.test(params.CallSid || "")) return new Response("Invalid signature",{status:403});
  const {key}=await routeParams;
  if(!await processVoiceCallback(key,event!,params)) return new Response("Call not found",{status:404});
  if(event==="status") return new Response(null,{status:204});
  const response=new twilio.twiml.VoiceResponse();
  response.say({language:"en-IN",voice:"Polly.Aditi"},params.Digits==="1" ? "Thank you. Your acknowledgement has been recorded." : "No acknowledgement recorded. Please read the announcement on the staff website.");
  response.hangup();
  return new Response(response.toString(),{headers:{"Content-Type":"text/xml","Cache-Control":"no-store"}});
}
