import {teamRoute,jsonBody,TeamError} from "@/lib/team";
import {prisma} from "@/lib/prisma";
import {saveExtraPaidDays,validateExtraMonth} from "@/lib/extraPaidDays";
import {todayWorkDate} from "@/lib/time";
export const GET=teamRoute(async(u,req)=>{
 if(!u.active)throw new TeamError("Account inactive.",403);
 const id=req.nextUrl.searchParams.get("employeeId")||u.id;
 if(u.role!=="ADMIN"&&id!==u.id)throw new TeamError("You can only view your own allowance.",403);
 const month=validateExtraMonth(req.nextUrl.searchParams.get("month")||todayWorkDate().slice(0,7));
 const employee=await prisma.user.findFirst({where:{id,role:"EMPLOYEE"},select:{hourlyRateRs:true,standardShiftHours:true}});
 if(!employee)throw new TeamError("Employee not found.",404);
 const row=await prisma.extraPaidDay.findUnique({where:{userId_month:{userId:id,month}}});
 const rate=employee.hourlyRateRs*employee.standardShiftHours;
 return {days:row?.days??0,creditDate:row?.creditDate??null,revision:row?.revision??0,dailyRateRs:rate,payRs:(row?.days??0)*rate};
});
export const POST=teamRoute(async(u,req)=>({allowance:await saveExtraPaidDays(u,await jsonBody(req))}));
