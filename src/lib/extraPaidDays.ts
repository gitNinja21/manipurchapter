import type {User} from "@prisma/client";
import {prisma} from "./prisma";
import {TeamError} from "./team";
import {validDate} from "./reporting";
import {todayWorkDate,workDateFor} from "./time";
import {statisticsFrom} from "./statisticsStart";
export function validateExtraMonth(value:unknown){
 if(typeof value!=="string"||!/^\d{4}-\d{2}$/.test(value)||!validDate(`${value}-01`))throw new TeamError("Choose a valid payroll month.");
 return value;
}
export async function saveExtraPaidDays(actor:Pick<User,"id"|"name"|"role"|"active">,input:Record<string,unknown>){
 if(actor.role!=="ADMIN"||!actor.active)throw new TeamError("Admin only.",403);
 const month=validateExtraMonth(input.month),date=String(input.creditDate),days=input.days,revision=input.revision;
 if(typeof days!=="number"||!Number.isInteger(days)||days<0||days>31)throw new TeamError("Choose 0 to 31 extra paid days.");
 if(!validDate(date)||date.slice(0,7)!==month||date>todayWorkDate())throw new TeamError("Choose a credit date in that month, up to today.");
 if(typeof revision!=="number"||!Number.isInteger(revision)||revision<0)throw new TeamError("Reload this allowance before saving.");
 return prisma.$transaction(async tx=>{
  const employee=await tx.user.findFirst({where:{id:String(input.userId),role:"EMPLOYEE"}});
  if(!employee)throw new TeamError("Employee not found.",404);
  if(date<statisticsFrom(workDateFor(employee.createdAt)))throw new TeamError("The credit date must be on or after the employee's payroll start date.");
  const before=await tx.extraPaidDay.findUnique({where:{userId_month:{userId:employee.id,month}}});
  if(before?.days===days&&before.creditDate===date)return before;
  if((before?.revision??0)!==revision)throw new TeamError("Another admin changed this allowance. Reload before saving.",409);
  const data={days,creditDate:date,updatedById:actor.id};
  const after=before?await tx.extraPaidDay.update({where:{id:before.id},data:{...data,revision:{increment:1}}}):await tx.extraPaidDay.create({data:{...data,userId:employee.id,month}});
  await tx.policyAudit.create({data:{entityId:after.id,userId:employee.id,actorId:actor.id,actorName:actor.name,action:"EXTRA_PAID_DAYS_SET",beforeJson:JSON.stringify(before),afterJson:JSON.stringify(after)}});
  return after;
 });
}
