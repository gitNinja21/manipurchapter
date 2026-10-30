import test from "node:test";
import assert from "node:assert/strict";
import {isSelfieTheme,themeApplies,SELFIE_THEMES} from "./selfieThemes";
import {parsePoseVerdict,posePasses,selfiePhotoHash,verifyPoseImage} from "./selfiePoseVision";
const photo=`data:image/jpeg;base64,${Buffer.alloc(120,7).toString("base64")}`;
test("four themes, no implicit gesture on normal dates, scoped clock actions",()=>{
 assert.equal(Object.keys(SELFIE_THEMES).length,4);assert.equal(isSelfieTheme("__proto__"),false);assert.equal(isSelfieTheme("NONE"),false);
 assert.equal(themeApplies(null,"in"),false);assert.equal(themeApplies({enabled:false,appliesTo:"both"},"in"),false);
 assert.equal(themeApplies({enabled:true,appliesTo:"in"},"out"),false);assert.equal(themeApplies({enabled:true,appliesTo:"both"},"out"),true);
});
test("photo binding rejects non-image URLs and detects photo substitution",()=>{
 assert.throws(()=>selfiePhotoHash("https://example.com/photo"));assert.throws(()=>selfiePhotoHash("data:image/svg+xml;base64,xxx"));assert.throws(()=>selfiePhotoHash("data:image/jpeg;base64,YQ=="));
 assert.notEqual(selfiePhotoHash(photo),selfiePhotoHash(`data:image/jpeg;base64,${Buffer.alloc(120,8).toString("base64")}`));
});
test("ambiguous, hidden face and multiple-person results never pass",()=>{
 const good={matches:true,faceVisible:true,singlePerson:true,uncertain:false,feedback:"Pose accepted."};assert.equal(posePasses(parsePoseVerdict(good)),true);
 for(const change of [{matches:false},{faceVisible:false},{singlePerson:false},{uncertain:true}])assert.equal(posePasses({...good,...change}),false);
 assert.throws(()=>parsePoseVerdict({...good,matches:"true"}));assert.throws(()=>parsePoseVerdict(null));
});
test("vision request stays server-side, stateless, and handles provider failure",async()=>{
 const old=process.env.OPENAI_API_KEY;process.env.OPENAI_API_KEY="test-only";
 try{
  let sent:{store:boolean;text:{format:{strict:boolean}};input:{content:{image_url?:string}[]}[]}|undefined;
  const fake=(async(_url:unknown,init:RequestInit)=>{sent=JSON.parse(String(init.body));return new Response(JSON.stringify({status:"completed",output:[{content:[{type:"output_text",text:JSON.stringify({matches:true,faceVisible:true,singlePerson:true,uncertain:false,feedback:"Accepted"})}]}]}));}) as typeof fetch;
  assert.equal(posePasses(await verifyPoseImage(photo,"MINI_HEART",fake)),true);assert.equal(sent!.store,false);assert.equal(sent!.text.format.strict,true);assert.equal(sent!.input[0].content[1].image_url,photo);
  await assert.rejects(()=>verifyPoseImage(photo,"BUNNY",(async()=>new Response("provider detail",{status:401})) as typeof fetch),/temporarily unavailable/);
  await assert.rejects(()=>verifyPoseImage(photo,"POWER",(async()=>new Response(JSON.stringify({status:"incomplete",output:[]}))) as typeof fetch),/temporarily unavailable/);
 }finally{if(old===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=old;}
});
