import {monthEffectsReady,priorWeather,similarity,type FeatureDay,type FeatureMode,type HourWeather} from "./forecastFeatures";
export type HourDay=FeatureDay & {guests:number[];sales:number[]};
export type HourPrediction={hour:number;guests:number;sales:number;actualGuests:number|null;actualSales:number|null;guestError:number|null;salesError:number|null;state:"past"|"current"|"future"};
type Metric="guests"|"sales";
export type ForecastOptions={weatherForecast?:(HourWeather|null)[];forceMode?:FeatureMode};
const modes:FeatureMode[]=["recent","calendar","weather"];
function baselines(training:HourDay[],target:HourDay,mode:FeatureMode,currentHour:number,forecast?:ForecastOptions["weatherForecast"]){
 const monthReady=monthEffectsReady(training);
 const recency=training.map(d=>2**(-((Date.parse(target.date)-Date.parse(d.date))/86400000)/21));
 return Object.fromEntries((["guests","sales"] as Metric[]).map(key=>[key,Array.from({length:24},(_,hour)=>{
  // A newly fetched forecast can affect only present/future hours, never past scores.
  const weather=hour>=currentHour&&currentHour<24?forecast?.[hour]??priorWeather(target,currentHour):priorWeather(target,hour);
  const weights=training.map((d,i)=>recency[i]*similarity(d,target,mode,monthReady,weather,hour));
  const sum=weights.reduce((a,b)=>a+b,0);
  return training.reduce((s,d,i)=>s+d[key][hour]*weights[i],0)/sum;
 })])) as Record<Metric,number[]>;
}
function predictions(training:HourDay[],target:HourDay,mode:FeatureMode,currentHour=24,forecast?:ForecastOptions["weatherForecast"]){
 const base=baselines(training,target,mode,currentHour,forecast);
 return Object.fromEntries((["guests","sales"] as Metric[]).map(key=>[key,base[key].map((v,h)=>{
  const cutoff=Math.min(h,currentHour),expected=base[key].slice(0,cutoff).reduce((a,b)=>a+b,0),seen=target[key].slice(0,cutoff).reduce((a,b)=>a+b,0);
  return v*Math.max(.5,Math.min(2,1+(seen-expected)/(expected+(key==="guests"?15:1500))));
 })])) as Record<Metric,number[]>;
}
// Expanding-window validation: model selection sees prior days only. Keep the
// baseline unless a candidate improves MAE by 5% across at least three days.
function choose(training:HourDay[]){
 const errors=modes.map(mode=>({mode,guests:0,sales:0}));let count=0;
 for(let i=Math.max(3,training.length-14);i<training.length;i++){
  const earlier=training.slice(0,i),target=training[i];count++;
  for(const score of errors){const p=predictions(earlier,target,score.mode);for(const key of ["guests","sales"] as Metric[])score[key]+=p[key].reduce((n,v,h)=>n+Math.abs(v-target[key][h]),0)/24;}
 }
 const selected={guests:"recent" as FeatureMode,sales:"recent" as FeatureMode};
 if(count>=3)for(const key of ["guests","sales"] as Metric[]){
  let best=errors[0];for(const candidate of errors.slice(1))if(candidate[key]<best[key]*.95-1e-8)best=candidate;selected[key]=best.mode;
 }
 return {selected,validationDays:count,scores:errors.map(e=>({...e,guests:count?e.guests/count:null,sales:count?e.sales/count:null}))};
}
export function rollingDay(history:HourDay[],actual:HourDay,currentHour=24,options:ForecastOptions={}){
 const training=history.filter(d=>d.date<actual.date&&d.complete!==false).sort((a,b)=>a.date.localeCompare(b.date));
 if(!training.length)return null;
 const selection=choose(training);
 const selected=options.forceMode?{guests:options.forceMode,sales:options.forceMode}:selection.selected;
 const guest=predictions(training,actual,selected.guests,currentHour,options.weatherForecast).guests;
 const sales=predictions(training,actual,selected.sales,currentHour,options.weatherForecast).sales;
 const hours:HourPrediction[]=Array.from({length:24},(_,hour)=>{
  const past=hour<currentHour;
  return {hour,guests:guest[hour],sales:sales[hour],actualGuests:hour<=currentHour?actual.guests[hour]:null,actualSales:hour<=currentHour?actual.sales[hour]:null,guestError:past?actual.guests[hour]-guest[hour]:null,salesError:past?actual.sales[hour]-sales[hour]:null,state:past?"past":hour===currentHour?"current":"future"};
 });
 const finished=hours.filter(h=>h.state==="past");
 return {date:actual.date,trainingDates:training.map(d=>d.date),hours,guestMAE:finished.length?finished.reduce((s,h)=>s+Math.abs(h.guestError!),0)/finished.length:null,salesMAE:finished.length?finished.reduce((s,h)=>s+Math.abs(h.salesError!),0)/finished.length:null,model:{...selection,selected,monthEffectsActive:monthEffectsReady(training),weatherDays:training.filter(d=>d.weather?.some(Boolean)).length}};
}
export type RollingDay=NonNullable<ReturnType<typeof rollingDay>>;
