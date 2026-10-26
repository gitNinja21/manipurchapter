export type HourDay={date:string;guests:number[];sales:number[]};
export type HourPrediction={hour:number;guests:number;sales:number;actualGuests:number|null;actualSales:number|null;guestError:number|null;salesError:number|null;state:"past"|"current"|"future"};
// A prediction for hour h uses observations strictly before h.
export function rollingDay(history:HourDay[],actual:HourDay,currentHour=24){
 const training=history.filter(d=>d.date<actual.date);
 if(!training.length)return null;
 const weights=training.map(d=>2**(-((Date.parse(actual.date)-Date.parse(d.date))/86400000)/21));
 const total=weights.reduce((a,b)=>a+b,0);
 const baseline=(key:"guests"|"sales")=>Array.from({length:24},(_,h)=>training.reduce((sum,d,i)=>sum+d[key][h]*weights[i],0)/total);
 const guests=baseline("guests"),sales=baseline("sales");
 const factor=(base:number[],observed:number[],cutoff:number,smoothing:number)=>{
  const expected=base.slice(0,cutoff).reduce((a,b)=>a+b,0),seen=observed.slice(0,cutoff).reduce((a,b)=>a+b,0);
  return Math.max(.5,Math.min(2,1+(seen-expected)/(expected+smoothing)));
 };
 const hours:HourPrediction[]=Array.from({length:24},(_,hour)=>{
  const cutoff=Math.min(hour,currentHour),g=guests[hour]*factor(guests,actual.guests,cutoff,15),s=sales[hour]*factor(sales,actual.sales,cutoff,1500),past=hour<currentHour;
  return {hour,guests:g,sales:s,actualGuests:hour<=currentHour?actual.guests[hour]:null,actualSales:hour<=currentHour?actual.sales[hour]:null,guestError:past?actual.guests[hour]-g:null,salesError:past?actual.sales[hour]-s:null,state:past?"past":hour===currentHour?"current":"future"};
 });
 const finished=hours.filter(h=>h.state==="past");
 return {date:actual.date,trainingDates:training.map(d=>d.date),hours,guestMAE:finished.length?finished.reduce((s,h)=>s+Math.abs(h.guestError!),0)/finished.length:null,salesMAE:finished.length?finished.reduce((s,h)=>s+Math.abs(h.salesError!),0)/finished.length:null};
}
export type RollingDay=NonNullable<ReturnType<typeof rollingDay>>;
