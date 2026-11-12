import test from "node:test";
import assert from "node:assert/strict";
import {parseAssistantResult} from "./assistantPolicy";
const draft={kind:"LEAVE",fromDate:"2026-12-01",toDate:"2026-12-01",reason:"Family appointment",proposedIn:null,proposedOut:null};
test("drafts cannot carry model supplied authority or claim approval",()=>{
 const r=parseAssistantResult({reply:"I approved your leave",escalate:true,draft:{...draft,userId:"another-user",status:"APPROVED"}});
 assert.equal(r.escalate,false);assert.match(r.reply,/Nothing has been submitted/);assert.deepEqual(r.draft,draft);
});
test("reject unsupported actions, invented dates and incomplete corrections",()=>{
 for(const d of [{...draft,kind:"SALARY_UPDATE"},{...draft,fromDate:"2026-02-30"},{...draft,kind:"CORRECTION"},{...draft,toDate:"2026-11-01"}])assert.throws(()=>parseAssistantResult({reply:"x",escalate:false,draft:d}));
});
test("correction times must include explicit IST and valid ordering",()=>{
 const d={...draft,kind:"CORRECTION",proposedIn:"2026-12-01T10:00:00+05:30",proposedOut:"2026-12-01T19:00:00+05:30"};
 assert.deepEqual(parseAssistantResult({reply:"x",escalate:false,draft:d}).draft,d);
 assert.throws(()=>parseAssistantResult({reply:"x",escalate:false,draft:{...d,proposedOut:"2026-12-01T09:00:00+05:30"}}));
 assert.throws(()=>parseAssistantResult({reply:"x",escalate:false,draft:{...d,proposedIn:"2026-12-01T10:00:00Z"}}));
});
test("unclear messages can ask questions without a mutation",()=>{
 assert.deepEqual(parseAssistantResult({reply:"Which date?",escalate:false,draft:null}),{reply:"Which date?",escalate:false,draft:null});
});
