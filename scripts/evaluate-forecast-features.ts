// Input: anonymous HourDay[] JSON, one row per date, guests/sales arrays of length 24.
// Run: node --import tsx scripts/evaluate-forecast-features.ts /path/to/hourly-days.json
import {readFileSync} from "node:fs";
import {rollingDay,type HourDay} from "../src/lib/analytics/rollingForecast";
const input=process.argv[2];if(!input)throw Error("Provide hourly-days.json");
const days=JSON.parse(readFileSync(input,"utf8")) as HourDay[];
if(!Array.isArray(days)||days.some(d=>!/^\d{4}-\d{2}-\d{2}$/.test(d.date)||[d.guests,d.sales].some(a=>!Array.isArray(a)||a.length!==24||a.some(v=>!Number.isFinite(v)||v<0))))throw Error("Invalid hourly input");
days.sort((a,b)=>a.date.localeCompare(b.date));
const totals={recent:{guests:0,sales:0},calendar:{guests:0,sales:0},weather:{guests:0,sales:0},adaptive:{guests:0,sales:0}};let n=0;
for(let i=1;i<days.length;i++){
 if(days[i].complete===false)continue;
 const results=Object.keys(totals).map(mode=>[mode,rollingDay(days.slice(0,i),days[i],24,mode==="adaptive"?{}:{forceMode:mode as "recent"|"calendar"|"weather"})] as const);
 if(results.some(([,p])=>!p))continue;n++;
 for(const [mode,p] of results){const t=totals[mode as keyof typeof totals];t.guests+=p!.guestMAE!;t.sales+=p!.salesMAE!;}
 const p=results[3][1]!;console.log(JSON.stringify({date:days[i].date,selected:p.model.selected,guestMAE:p.guestMAE,salesMAE:p.salesMAE}));
}
console.log(JSON.stringify({evaluatedDays:n,meanHourlyAbsoluteError:Object.fromEntries(Object.entries(totals).map(([mode,t])=>[mode,{guests:n?t.guests/n:null,sales:n?t.sales/n:null}]))},null,2));
