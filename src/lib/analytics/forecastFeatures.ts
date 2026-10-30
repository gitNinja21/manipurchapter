export type HourWeather={temperature:number;rain:number;humidity:number};
export type FeatureDay={date:string;weather?:(HourWeather|null)[];holiday?:boolean;festival?:boolean;complete?:boolean};
export type FeatureMode="recent"|"calendar"|"weather";
export function dateFeatures(date:string){
 const d=new Date(`${date}T12:00:00Z`),day=d.getUTCDate(),weekday=d.getUTCDay(),length=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,0)).getUTCDate();
 return {weekday,weekend:weekday===0||weekday===6,monthPhase:day<=10?0:day<=20?1:2,daysToMonthEnd:length-day,month:date.slice(0,7)};
}
// Unknown weather stays unknown. Never treat a missing reading as a dry/cool hour.
export function parseWeather(value:unknown):HourWeather|null{
 if(!value||typeof value!=="object")return null;
 const v=value as Record<string,unknown>;
 if(![v.temperature,v.rain,v.humidity].every(n=>typeof n==="number"&&Number.isFinite(n)))return null;
 const w=v as HourWeather;
 return w.temperature>=-50&&w.temperature<=60&&w.rain>=0&&w.humidity>=0&&w.humidity<=100?w:null;
}
export function monthEffectsReady(history:FeatureDay[]){
 return new Set(history.map(d=>d.date.slice(0,7))).size>=3 && [0,1,2].every(p=>history.filter(d=>dateFeatures(d.date).monthPhase===p).length>=5);
}
// Daytime and evening conditions are never pooled. Only readings before the
// prediction's origin may be used for a retrospective weather proxy.
export function priorWeather(day:FeatureDay,hour:number):HourWeather|null{
 const start=hour>=18?18:hour>=6?6:0;
 for(let h=hour-1;h>=Math.max(start,hour-3);h--)if(day.weather?.[h])return day.weather[h];
 return null;
}
export function similarity(day:FeatureDay,target:FeatureDay,mode:FeatureMode,monthReady:boolean,weather:HourWeather|null,hour:number){
 if(mode==="recent")return 1;
 const a=dateFeatures(day.date),b=dateFeatures(target.date);
 let distance=(a.weekday===b.weekday?0:.7)+(a.weekend===b.weekend?0:.7);
 if(day.holiday!==undefined&&target.holiday!==undefined&&day.holiday!==target.holiday)distance+=.6;
 if(day.festival!==undefined&&target.festival!==undefined&&day.festival!==target.festival)distance+=.4;
 if(monthReady){distance+=a.monthPhase===b.monthPhase?0:.4;distance+=Math.min(1,Math.abs(a.daysToMonthEnd-b.daysToMonthEnd)/10)*.2;}
 const old=day.weather?.[hour];
 if(mode==="weather"&&weather&&old){
  distance+=Math.min(2,Math.abs(old.temperature-weather.temperature)/5)*.4;
  distance+=Math.min(2,Math.abs(old.humidity-weather.humidity)/20)*.15;
  distance+=Math.min(2,Math.abs(Math.log1p(old.rain)-Math.log1p(weather.rain)))*.4;
 }
 // Retain broad support even when there is only one matching weekday.
 return .25+.75*Math.exp(-distance);
}
