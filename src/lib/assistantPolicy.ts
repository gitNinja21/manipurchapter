export const REQUEST_KINDS = ["LEAVE", "CORRECTION", "LATE_ARRIVAL", "EARLY_DEPARTURE"] as const;
export type AssistantDraft = {kind:string;fromDate:string;toDate:string;reason:string;proposedIn:string|null;proposedOut:string|null};
export type AssistantResult = {reply:string;escalate:boolean;draft:AssistantDraft|null};
const date = (s: unknown) => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && new Date(s).toISOString().slice(0,10) === s;
export function parseAssistantResult(value:unknown):AssistantResult {
  if (!value || typeof value !== "object") throw new Error("Invalid assistant result");
  const v = value as AssistantResult;
  if (typeof v.reply !== "string" || !v.reply.trim() || v.reply.length > 2000 || typeof v.escalate !== "boolean") throw new Error("Invalid assistant reply");
  if (v.draft !== null) {
    const d=v.draft;
    if (!d || !REQUEST_KINDS.includes(d.kind as typeof REQUEST_KINDS[number]) || !date(d.fromDate) || !date(d.toDate) || d.toDate<d.fromDate || typeof d.reason!=="string" || !d.reason.trim() || d.reason.length>1000) throw new Error("Invalid assistant draft");
    if (d.kind!=="LEAVE" && d.fromDate!==d.toDate) throw new Error("Single date required");
    for(const t of [d.proposedIn,d.proposedOut]) if(t!==null && (typeof t!=="string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:00\+05:30$/.test(t) || !Number.isFinite(Date.parse(t)))) throw new Error("Invalid IST time");
    if(d.kind==="CORRECTION" && (!d.proposedIn || !d.proposedOut || Date.parse(d.proposedOut)<=Date.parse(d.proposedIn))) throw new Error("Correction needs both times");
    // Copy only permitted fields; model-supplied user IDs/status/approval flags are never used.
    return {reply:"Please check the draft below. Nothing has been submitted yet. Submit it only if the dates, times and reason are correct.",escalate:false,draft:{kind:d.kind,fromDate:d.fromDate,toDate:d.toDate,reason:d.reason,proposedIn:d.kind==="CORRECTION"?d.proposedIn:null,proposedOut:d.kind==="CORRECTION"?d.proposedOut:null}};
  }
  return {reply:v.reply,escalate:v.escalate,draft:null};
}
const nullableText={type:["string","null"]};
export const assistantSchema = {
 type:"object",additionalProperties:false,required:["reply","escalate","draft"],
 properties:{
  reply:{type:"string"},escalate:{type:"boolean"},
  draft:{anyOf:[{type:"null"},{
   type:"object",additionalProperties:false,
   required:["kind","fromDate","toDate","reason","proposedIn","proposedOut"],
   properties:{kind:{type:"string",enum:REQUEST_KINDS},fromDate:{type:"string"},toDate:{type:"string"},reason:{type:"string"},proposedIn:nullableText,proposedOut:nullableText}
  }]}
 }
};
