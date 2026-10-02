// Fake SMS provider and disposable SQLite database; no live SMS or credentials.
import assert from "node:assert/strict";
import {mkdtempSync,writeFileSync} from "node:fs";
import {join} from "node:path";
import {tmpdir} from "node:os";
import {spawnSync} from "node:child_process";
import bcrypt from "bcryptjs";
async function main(){
 const file=join(mkdtempSync(join(tmpdir(),"mc-recovery-")),"test.sqlite");writeFileSync(file,"");
 process.env.DATABASE_URL=`file:${file}`;process.env.JWT_SECRET="disposable-recovery-tests-only";
 const m=spawnSync(process.execPath,["node_modules/prisma/build/index.js","migrate","deploy"],{env:process.env,encoding:"utf8"});assert.equal(m.status,0,m.stderr);
 const {prisma}=await import("../src/lib/prisma");
 const {beginRecovery,checkRecovery,resetRecovery,recoveryLimit}=await import("../src/lib/accountRecovery");
 const {signSession,verifySession}=await import("../src/lib/auth");
 let sent=0,checked=0;
 const provider={send:async()=>`VE${++sent}`,check:async(_sid:string,code:string)=>{checked++;return code==="123456";}};
 const now=new Date();
 const passwordHash=await bcrypt.hash("Old-password-123",4);
 try{
  for(const [id,phone,role,active,approved] of [["a","9876543210","EMPLOYEE",true,true],["shared-a","9876543211","EMPLOYEE",true,true],["shared-b","+919876543211","EMPLOYEE",true,true],["admin","9876543212","ADMIN",true,true],["inactive","9876543213","EMPLOYEE",false,true],["pending","9876543214","EMPLOYEE",true,false]] as const)await prisma.user.create({data:{id,name:id,employeeCode:id.toUpperCase(),phone,role,active,approved,passwordHash,mustChangePassword:false}});
  for(const phone of ["9876543211","9876543212","9876543213","9876543214","9876543215"]){const token=await beginRecovery(phone,provider,now);await assert.rejects(checkRecovery(token,"123456",provider,now));}assert.equal(sent,0);assert.equal(checked,0);
  const token=await beginRecovery("9876543210",provider,now);assert.equal(sent,1);
  await assert.rejects(beginRecovery("+919876543210",provider,now),/Too many/);
  await assert.rejects(resetRecovery(token,"New-password-123",now),/Verify/);
  await assert.rejects(checkRecovery(token,"000000",provider,now),/invalid/);
  assert.deepEqual(await checkRecovery(token,"123456",provider,now),{employeeCode:"A"});
  const session=await signSession({userId:"a",employeeCode:"A",name:"a",role:"EMPLOYEE",approved:true,mustChangePassword:false,authVersion:0});assert.ok(await verifySession(session));
  await assert.rejects(resetRecovery(token,"short",now),/8 characters/);
  await resetRecovery(token,"New-password-123",now);
  assert.equal(await verifySession(session),null);
  const user=await prisma.user.findUniqueOrThrow({where:{id:"a"}});assert.equal(user.authVersion,1);assert.ok(await bcrypt.compare("New-password-123",user.passwordHash));assert.equal(user.mustChangePassword,false);
  await assert.rejects(resetRecovery(token,"Another-password",now),/expired/);
  const later=new Date(+now+120000);
  const expired=await beginRecovery("9876543210",provider,later);
  await assert.rejects(checkRecovery(expired,"123456",provider,new Date(+later+600001)),/expired/);
  const limited=await beginRecovery("9876543210",provider,new Date(+later+120000));
  for(let i=0;i<5;i++)await assert.rejects(checkRecovery(limited,"000000",provider,new Date(+later+120000)),/invalid/);
  await assert.rejects(checkRecovery(limited,"123456",provider,new Date(+later+120000)),/limit/);
  const changed=await beginRecovery("9876543210",provider,new Date(+later+240000));
  await prisma.user.update({where:{id:"a"},data:{phone:"9876543220"}});
  await assert.rejects(checkRecovery(changed,"123456",provider,new Date(+later+240000)),/changed/);
  const grant=await beginRecovery("9876543220",provider,now);await checkRecovery(grant,"123456",provider,now);
  await prisma.user.update({where:{id:"a"},data:{passwordHash:await bcrypt.hash("Changed-elsewhere",4)}});
  await assert.rejects(resetRecovery(grant,"New-password-again",now),/changed/);
  const failing=await beginRecovery("9876543220",{...provider,send:async()=>{throw Error("provider unavailable");}},later);
  await assert.rejects(checkRecovery(failing,"123456",provider,later),/expired/);
  await recoveryLimit("test","ip",600,1,now);await assert.rejects(recoveryLimit("test","ip",600,1,now),/Too many/);
  console.log("PASS: migration, eligible/unique phone matching, admin/inactive isolation, send limits, invalid/expired codes, check limit, login-ID recovery, password reset, grant replay protection, account changes, provider errors and JWT revocation. No live SMS.");
 }finally{await prisma.$disconnect();}
}
void main();
