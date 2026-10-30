import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import type { EmployeeStats, PayrollDay } from "./stats";

const money = (n:number) => n.toLocaleString("en-IN",{minimumFractionDigits:2,maximumFractionDigits:2});
const hours = (n:number) => `${Math.floor(n)}h ${Math.floor((n-Math.floor(n))*60+1e-6)}m`;
const time = (s:string|null) => s ? new Date(s).toLocaleTimeString("en-GB",{timeZone:"Asia/Kolkata",hour:"2-digit",minute:"2-digit"}) : "-";
const date = (s:string) => new Date(`${s}T00:00:00+05:30`).toLocaleDateString("en-GB",{timeZone:"Asia/Kolkata",day:"2-digit",month:"short",year:"numeric"});
const ink=rgb(.098,.239,.208), muted=rgb(.38,.44,.42), gold=rgb(.66,.49,.25), pale=rgb(.94,.96,.94), white=rgb(1,1,1);
/** PDF contains calculated earnings only, never an assertion that payment was made. */
export async function createPayrollPdf(s:EmployeeStats, from:string, to:string, generatedAt=new Date()) {
 const doc=await PDFDocument.create();
 const normal=await doc.embedFont(StandardFonts.Helvetica), bold=await doc.embedFont(StandardFonts.HelveticaBold);
 doc.setTitle(`Manipur Chapter - ${s.name} - Payroll ${from} to ${to}`);
 doc.setAuthor("Manipur Chapter");doc.setCreationDate(generatedAt);
 let page=doc.addPage([595.28,841.89]);
 // Standard PDF fonts cover Latin; unsupported code points are shown explicitly, not allowed to crash an export.
 const safe=(v:string)=>Array.from(v).map(ch=>{try{normal.encodeText(ch);return ch;}catch{return "?";}}).join("");
 const text=(x:number,y:number,v:string,size=10,strong=false,color=ink,max=515)=>{
  let value=safe(v);const font=strong?bold:normal;
  while(font.widthOfTextAtSize(value,size)>max && value.length>3)value=value.slice(0,-4)+"...";
  page.drawText(value,{x,y,size,font,color});
 };
 const right=(x:number,y:number,v:string,size=10,strong=false)=>text(x-(strong?bold:normal).widthOfTextAtSize(safe(v),size),y,v,size,strong);
 const line=(y:number)=>page.drawLine({start:{x:40,y},end:{x:555,y},thickness:.5,color:rgb(.85,.89,.86)});
 const header=(subtitle:string)=>{
  page.drawRectangle({x:0,y:712,width:596,height:130,color:ink});
  text(40,796,"MANIPUR CHAPTER",23,true,white);text(40,772,subtitle,11,false,white);
  text(40,740,"EMPLOYEE PAYROLL STATEMENT",9,true,rgb(.85,.71,.49));
  right(555,689,`${date(from)} - ${date(to)}`,10);
 };
 const section=(y:number,n:string,title:string)=>{text(40,y,n,10,true,gold);text(63,y,title,12,true);};
 const days=s.payrollDays??[];
 header("Your attendance, hours and earnings - clearly explained");
 text(40,662,s.name,17,true,ink,400);text(40,642,`Employee code: ${s.employeeCode} | ${s.active?"Active":"Inactive"}`,10);
 text(40,622,`Rate: INR ${money(s.hourlyRateRs)}/hour | INR ${money(s.dailyRateRs)}/day`,10,false,muted);
 page.drawRectangle({x:40,y:530,width:515,height:70,color:pale});
 text(56,576,"TOTAL CALCULATED SALARY",10,true);text(56,547,`INR ${money(s.salaryRs)}`,26,true);
 section(503,"01","Attendance at a glance");
 const counts=[['Worked',days.filter(d=>d.status==='Worked').length],['Missed shifts',days.filter(d=>d.status==='Missed shift').length],['Paid off days',s.offDays],['Approved leave',days.filter(d=>d.status==='Approved leave').length]] as const;
 counts.forEach(([label,n],i)=>{text(40+i*132,474,String(n),22,true);text(40+i*132,456,label,9,false,muted);});
 text(40,434,`${s.incompleteDays} incomplete | ${s.rejectedDays} rejected | ${days.filter(d=>d.lateMinutes>0).length} late arrivals`,9,false,muted);
 line(420);section(398,"02","Salary breakdown");
 const salaryRows=[['Regular completed work',s.regularPayRs], [`Paid off days (${s.offDays})`,s.offDaysPayRs],[`Bonus days earned (${s.bonusDays})`,s.bonusPayRs]] as const;
 salaryRows.forEach(([label,n],i)=>{const y=367-i*36;text(40,y,label,11);right(555,y,`INR ${money(n)}`,11);line(y-13);});
 text(40,254,'Total calculated salary',12,true);right(555,254,`INR ${money(s.salaryRs)}`,14,true);
 section(218,"03","Hours and bonus balance");
 text(40,192,`${hours(s.totalHours)} counted time`,11,true);text(305,192,`${hours(s.overtimeBalanceHours)} carried forward`,11,true,ink,250);
 text(40,173,`${hours(s.overtimeHours)} eligible extra time in period`,9,false,muted);
 text(305,173,`${s.bonusDays} bonus days earned in period`,9,false,muted);
 text(40,150,'Every 8 eligible extra hours earns one bonus day; unused hours carry forward.',9,false,muted);
 text(40,131,'Short shifts and exclusions are already reflected in earnings, not deducted twice.',9,false,muted);
 text(40,112,`Billing from: ${s.billingFromDate?date(s.billingFromDate):'No employment overlap in this period'}`,9,false,muted);
 text(40,93,'Calculated earnings only. This statement does not confirm that payment was made.',9,false,muted);
 const chunks:PayrollDay[][]=[];for(let i=0;i<days.length;i+=18)chunks.push(days.slice(i,i+18));if(!chunks.length)chunks.push([]);
 for(let ci=0;ci<chunks.length;ci++){
  page=doc.addPage([595.28,841.89]);header('Daily attendance and calculation details');
  text(40,665,`${s.name} | ${s.employeeCode}`,11,true);
  text(40,644,'Times in IST. Regular pay includes applicable paid breaks and arrival grace.',9,false,muted);
  page.drawRectangle({x:40,y:604,width:515,height:28,color:ink});
  const xs=[44,103,210,293,354,410,473];
  ['Date','Status','In / Out','Unpaid','Regular','Extra','Pay INR'].forEach((v,i)=>text(xs[i],614,v,8,true,white));
  chunks[ci].forEach((d,i)=>{
   const y=604-(i+1)*23;if(i%2===0)page.drawRectangle({x:40,y,width:515,height:23,color:pale});
   const vals=[date(d.date).slice(0,6),d.status,`${time(d.clockIn)} / ${time(d.clockOut)}`,hours(d.unpaidHours),hours(d.regularHours),hours(d.overtimeHours)];
   vals.forEach((v,j)=>text(xs[j],y+8,v,7.5,false,ink,(xs[j+1]??555)-xs[j]-3));right(549,y+8,money(d.payRs),8);
  });
  const y=604-chunks[ci].length*23-24;
  text(40,y,'Daily pay subtotal (this page)',9,true);right(549,y,money(chunks[ci].reduce((n,d)=>n+d.payRs,0)),10,true);
  text(40,146,'Daily pay excludes bonus-day awards; these appear in the salary summary.',9,false,muted);
  text(40,129,'Unpaid = applied break deduction. Paid break allowances are included, not added.',9,false,muted);
  text(40,112,'Off days follow saved rules. Incomplete shifts and rejected records earn no regular pay.',9,false,muted);
  text(40,95,'For a correction, contact your admin with the date and actual clock-in/out times.',9,false,muted);
 }
 // Per-record allowances are policy snapshots, not evidence of breaks actually taken.
 const allowances=[...new Set(days.filter(d=>d.clockIn).map(d=>d.paidBreakMinutes))];
 if(allowances.length){text(40,77,`Recorded paid-break allowances: ${allowances.map(n=>n===null?'legacy / not recorded':`${n} min`).join(', ')}.`,8,false,muted);}
 const pages=doc.getPages();pages.forEach((p,i)=>{page=p;line(48);text(40,33,`Confidential | Generated ${generatedAt.toLocaleDateString('en-GB',{timeZone:'Asia/Kolkata'})}`,8,false,muted);right(555,33,`${i+1} / ${pages.length}`,8);});
 return doc.save();
}
