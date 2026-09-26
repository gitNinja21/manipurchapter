// Isolated database and fake clock. Never touches real staff or payroll.
import assert from "node:assert/strict";
import {mkdtemp,writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import path from "node:path";
import {spawn,spawnSync} from "node:child_process";
import {PrismaClient} from "@prisma/client";
import bcrypt from "bcryptjs";
const dir=await mkdtemp(path.join(tmpdir(),"mc-reviews-"));
const url=`file:${dir}/test.sqlite`, clock=path.join(dir,"clock.txt"), preload=path.join(dir,"clock.cjs");
await writeFile(path.join(dir,"test.sqlite"),"");
const setTime=t=>writeFile(clock,String(+new Date(t)));
await setTime("2026-09-21T12:00:00+05:30");
await writeFile(preload,`const fs=require('node:fs');const RealDate=Date;const now=()=>Number(fs.readFileSync(${JSON.stringify(clock)},'utf8'));global.Date=class extends RealDate{constructor(...a){a.length?super(...a):super(now())}static now(){return now()}static parse(v){return RealDate.parse(v)}static UTC(...a){return RealDate.UTC(...a)}};`);
const env={...process.env,DATABASE_URL:url,JWT_SECRET:"isolated-work-rules-test-secret",ATTENDANCE_REMINDERS_ENABLED:"false",VAPID_PUBLIC_KEY:"",VAPID_PRIVATE_KEY:""};
const migration=spawnSync(process.execPath,["node_modules/prisma/build/index.js","migrate","deploy"],{env,encoding:"utf8"});
assert.equal(migration.status,0,migration.stdout+migration.stderr);
const db=new PrismaClient({datasources:{db:{url}}});
let server,logs="";
const base="http://127.0.0.1:3105";
const request=async(cookie,route,method="GET",body,ip="127.0.0.1")=>{
 const r=await fetch(base+route,{method,headers:{cookie,"Content-Type":"application/json","X-Forwarded-For":ip},...(body===undefined?{}:{body:JSON.stringify(body)}),redirect:"manual"});
 return {status:r.status,data:await r.json(),cookie:r.headers.get("set-cookie")?.split(";")[0],headers:r.headers};
};
const ok=async(...a)=>{const r=await request(...a);assert.equal(r.status,200,JSON.stringify(r.data));return r;};
try {
 const passwordHash=await bcrypt.hash("Test-only-work-rules-123",4);
 for(const [id,name,role] of [["admin","Test Admin","ADMIN"],["review-a","Test Waiter A","EMPLOYEE"],["review-b","Test Waitress B","EMPLOYEE"]])
  await db.user.create({data:{id,name,employeeCode:id.toUpperCase(),role,passwordHash,active:true,approved:true,mustChangePassword:false,createdAt:new Date("2026-09-01T00:00:00Z")}});
 server=spawn(process.execPath,["--require",preload,"node_modules/next/dist/bin/next","start","--hostname","127.0.0.1","--port","3105"],{env,stdio:["ignore","pipe","pipe"]});
 process.once("SIGINT",()=>{server.kill("SIGTERM");process.exit(130)});
 server.stdout.on("data",b=>logs+=b);server.stderr.on("data",b=>logs+=b);
 for(let i=0;i<80;i++){try{if((await fetch(base)).ok)break;}catch{}if(i===79)throw Error(logs);await new Promise(r=>setTimeout(r,250));}
 const login=async id=>(await ok("","/api/auth/login","POST",{employeeCode:id.toUpperCase(),password:"Test-only-work-rules-123"})).cookie;
 const admin=await login("admin"), a=await login("review-a"), b=await login("review-b");
 assert.equal((await request("","/api/team/reviews","POST",{})).status,403);
 assert.equal((await request(admin,"/api/team/reviews","POST",{})).status,403);
 const issued=await Promise.all([ok(a,"/api/team/reviews","POST",{}),ok(b,"/api/team/reviews","POST",{}),ok(a,"/api/team/reviews","POST",{})]);
 const ca=issued[0].data.invite.code,cb=issued[1].data.invite.code;
 assert.match(ca,/^\d{4}$/);assert.notEqual(ca,cb);assert.equal(issued[2].data.invite.code,ca);
 assert.equal(new Date(issued[0].data.invite.expiresAt)-new Date(issued[0].data.serverTime),300000);
 assert.equal((await request(a,"/api/reviews/code","POST",{code:ca})).status,403);
 const inviteId=issued[0].data.invite.id;
 assert.ok(inviteId);
 assert.equal((await request("","/api/reviews/code","POST",{code:ca,inviteId:issued[1].data.invite.id})).status,410);
 const claims=await Promise.all([request("","/api/reviews/code","POST",{code:ca,inviteId}),request("","/api/reviews/code","POST",{code:ca,inviteId})]);
 assert.equal(claims.filter(r=>r.status===200).length,1);
 const claim=claims.find(r=>r.status===200);assert.equal(claim.data.employeeName,"Test Waiter A");
 assert.ok(claim.cookie.startsWith("mc_customer_review="));assert.ok(!claim.cookie.includes("mc_session"));
 assert.equal((await request(claim.cookie,"/api/team/reviews")).status,403);
 const all5={friendliness:5,attentiveness:5,accuracy:5,speed:5,overall:5};
 assert.equal((await request(claim.cookie,"/api/reviews/submit","POST",{...all5,speed:6})).status,400);
 assert.equal((await request("","/api/reviews/submit","POST",all5)).status,401);
 assert.equal((await db.customerReview.count()),0);
 // Code expiry does not break an already claimed session.
 await setTime("2026-09-21T12:05:00+05:30");
 assert.equal((await request("","/api/reviews/code","POST",{code:cb})).status,410);
 const submissions=await Promise.all([ok(claim.cookie,"/api/reviews/submit","POST",{...all5,userId:"review-b",points:999}),ok(claim.cookie,"/api/reviews/submit","POST",all5)]);
 assert.equal(submissions.length,2);assert.equal(await db.customerReview.count(),1);
 const saved=await db.customerReview.findFirst();assert.equal(saved.userId,"review-a");assert.equal(saved.points,1);
 const perf=(await ok(admin,"/api/team/performance?month=2026-09")).data;
 assert.equal(perf.employees.find(e=>e.id==="review-a").points,1);
 assert.equal(perf.employees.find(e=>e.id==="review-b").points,0);
 assert.equal((await ok(b,"/api/team/reviews?employeeId=review-a")).data.total,0);
 assert.equal((await ok(a,"/api/team/reviews")).data.total,1);
 const publicState=(await ok(claim.cookie,"/api/reviews/session")).data;
 assert.equal(publicState.submitted,true);assert.deepEqual(Object.keys(publicState).sort(),["employeeName","ratings","submitted"]);
 assert.deepEqual(publicState.ratings,{friendliness:5,attentiveness:5,accuracy:5,speed:5,overall:5});
 // Reassigning a released short code cannot redirect an old customer's session.
 await ok(b,"/api/team/reviews","POST",{});
 await db.customerReviewInvite.update({where:{activeUserId:"review-b"},data:{code:ca}});
 const claimB=await ok("","/api/reviews/code","POST",{code:ca});
 assert.equal(claimB.data.employeeName,"Test Waitress B");
 await ok(claim.cookie,"/api/reviews/submit","POST",all5);assert.equal(await db.customerReview.count(),1);
 await ok(claimB.cookie,"/api/reviews/submit","POST",{...all5,overall:1});
 assert.equal((await db.customerReview.findFirst({where:{userId:"review-b"}})).points,.84);
 // Expired session, disabled employee, and brute-force attempt limits.
 await setTime("2026-09-21T12:21:00+05:30");
 assert.equal((await request(claimB.cookie,"/api/reviews/submit","POST",all5)).status,410);
 const disabledCode=(await ok(a,"/api/team/reviews","POST",{})).data.invite.code;
 await db.user.update({where:{id:"review-a"},data:{active:false}});
 assert.equal((await request("","/api/reviews/code","POST",{code:disabledCode})).status,410);
 assert.equal((await request(a,"/api/team/reviews","POST",{})).status,403);
 await db.user.update({where:{id:"review-a"},data:{active:true}});
 for(let i=0;i<30;i++) assert.equal((await request("","/api/reviews/code","POST",{code:"0000"},"192.0.2.77")).status,410);
 assert.equal((await request("","/api/reviews/code","POST",{code:"0000"},"192.0.2.77")).status,429);
 assert.equal((await ok(admin,"/api/team/reviews")).data.total,2);
 assert.equal((await ok(admin,"/api/team/reviews")).data.points,1.84);
 assert.ok(!JSON.stringify((await ok(admin,"/api/team/reviews")).data).includes("tokenHash"));
 console.log("PASS: simultaneous code uniqueness, single active code per employee, expiry, exclusive claims, server-scored ratings, duplicate-submit idempotency, exact employee attribution, monthly points, isolation, no staff access via customer cookie, reused-code session binding, disabled accounts and rate limiting.");
 console.log("Disposable database:",dir);
 if(process.env.KEEP_TEST_SERVER==="1"){
  await setTime("2026-09-21T12:30:00+05:30");
  const preview=(await ok(b,"/api/team/reviews","POST",{})).data.invite;
  console.log("Browser preview code:",preview.code,"server:",base);
  await new Promise(()=>{});
 }
} catch(e){console.error(logs.slice(-4000));throw e;}
finally{if(server)server.kill("SIGTERM");await db.$disconnect();}
