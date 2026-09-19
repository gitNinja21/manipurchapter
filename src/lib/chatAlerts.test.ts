import test from "node:test";
import assert from "node:assert/strict";
import { shouldChime } from "./chatAlerts";
import { readFileSync } from "node:fs";
import vm from "node:vm";
test("admin-only default, opt-in all messages, mute and sender exclusion", () => {
  assert.equal(shouldChime("ADMIN",false,"staff","admin","ADMIN"),true);
  assert.equal(shouldChime("ADMIN",false,"staff","other","EMPLOYEE"),false);
  assert.equal(shouldChime("ALL",false,"staff","other","EMPLOYEE"),true);
  for(const mode of ["ADMIN","ALL","OFF"]) {
    assert.equal(shouldChime(mode,true,"staff","admin","ADMIN"),false);
    assert.equal(shouldChime(mode,false,"staff","staff","ADMIN"),false);
  }
  assert.equal(shouldChime("OFF",false,"staff","admin","ADMIN"),false);
});
test("service worker distinguishes chat, stays visible, avoids duplicate OS sound and restricts destinations", async () => {
  type Options = {body:string;silent:boolean;data:{url:string}};
  const handlers:Record<string,(event:unknown)=>void>={}, notifications: {title:string;options:Options}[]=[], opened:string[]=[];
  let visible=false;
  const self={addEventListener:(name:string,fn:(event:unknown)=>void)=>handlers[name]=fn,
    registration:{showNotification:async(title:string,options:Options)=>{notifications.push({title,options});}},
    clients:{matchAll:async()=>[{visibilityState:visible?"visible":"hidden"}],openWindow:async(url:string)=>opened.push(url)},location:{origin:"https://attendance.example"}};
  vm.runInNewContext(readFileSync("public/sw.js","utf8"),{self,URL});
  const push=async(data:unknown)=>{let task:Promise<unknown>|undefined;handlers.push({data:{json:()=>data},waitUntil:(p:Promise<unknown>)=>task=p});await task;return notifications.at(-1)!;};
  let n=await push({kind:"CHAT",url:"/employee/team?view=chat",tag:"chat-1",silent:false});
  assert.match(n.options.body,/team message/);assert.equal(n.options.silent,false);
  visible=true;n=await push({kind:"CHAT",url:"/employee/team?view=chat",silent:false});assert.equal(n.options.silent,true);
  visible=false;n=await push({kind:"CHAT",silent:true});assert.equal(n.options.silent,true);
  n=await push({url:"https://evil.example"});assert.match(n.options.body,/announcement/);assert.equal(n.options.data.url,"/");
  let task:Promise<unknown>|undefined;
  handlers.notificationclick({notification:{close:()=>{},data:{url:"https://evil.example"}},waitUntil:(p:Promise<unknown>)=>task=p});await task;
  assert.equal(opened[0],"https://attendance.example/");
});

test("concurrent tabs claim a message once; hidden tabs and duplicate polling stay silent", async (t) => {
  const {unlockChime,chimeOnce}=await import("./chatSound");
  let oscillators=0;
  const memory=new Map<string,string>();
  let queue=Promise.resolve();
  const mocks:Record<string,unknown>={
    AudioContext:class {state="running";currentTime=0;destination={};resume(){return Promise.resolve();}createOscillator(){oscillators++;return {type:"",frequency:{value:0},connect(){},disconnect(){},start(){},stop(){},onended:null};}createGain(){return {gain:{setValueAtTime(){},exponentialRampToValueAtTime(){}},connect(){},disconnect(){}};}},
    localStorage:{getItem:(k:string)=>memory.get(k)??null,setItem:(k:string,v:string)=>memory.set(k,v)},
    document:{visibilityState:"visible",hasFocus:()=>true},
    navigator:{locks:{request:(_key:string,fn:()=>void)=>{const task=queue.then(fn);queue=task;return task;}}},
  };
  for(const [key,value] of Object.entries(mocks)) {
    const original=Object.getOwnPropertyDescriptor(globalThis,key);
    Object.defineProperty(globalThis,key,{value,configurable:true});
    t.after(()=>{if(original)Object.defineProperty(globalThis,key,original);else Reflect.deleteProperty(globalThis,key);});
  }
  await unlockChime();
  await Promise.all([chimeOnce("staff","one"),chimeOnce("staff","one")]);
  assert.equal(oscillators,2); // two notes, one bell
  await chimeOnce("staff","one");assert.equal(oscillators,2);
  (mocks.document as {visibilityState:string}).visibilityState="hidden";
  await chimeOnce("staff","two");assert.equal(oscillators,2);
});
