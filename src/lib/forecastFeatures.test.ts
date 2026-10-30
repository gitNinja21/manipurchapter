import test from "node:test";
import assert from "node:assert/strict";
import {dateFeatures,monthEffectsReady,parseWeather,priorWeather,similarity} from "./analytics/forecastFeatures";
import {rollingDay,type HourDay} from "./analytics/rollingForecast";
const weather={temperature:30,rain:0,humidity:60};
const day=(date:string):HourDay=>({date,guests:Array(24).fill(10),sales:Array(24).fill(1000),weather:Array(24).fill(weather)});
test("calendar engineering handles leap month, weekday and month phase",()=>{
 assert.equal(dateFeatures("2028-02-28").daysToMonthEnd,1);
 assert.equal(dateFeatures("2026-10-10").monthPhase,0);assert.equal(dateFeatures("2026-10-11").monthPhase,1);assert.equal(dateFeatures("2026-10-21").monthPhase,2);
 assert.equal(dateFeatures("2026-10-18").weekend,true);
 assert.equal(monthEffectsReady([day("2026-10-17"),day("2026-10-28")]),false);
 const history=["08","09","10"].flatMap(m=>[1,2,11,12,21,22].map(d=>day(`2026-${m}-${String(d).padStart(2,"0")}`)));
 assert.equal(monthEffectsReady(history),true);
});
test("weather is missing-aware, lagged and separated into day and evening",()=>{
 assert.equal(parseWeather({temperature:null,rain:0,humidity:50}),null);
 assert.equal(parseWeather({...weather,humidity:120}),null);
 const d=day("2026-10-20");assert.equal(priorWeather(d,6),null);assert.equal(priorWeather(d,18),null);assert.deepEqual(priorWeather(d,19),weather);
 d.weather![18]=null;assert.equal(priorWeather(d,19),null);
 assert.equal(similarity(d,d,"weather",false,null,18),similarity(d,d,"calendar",false,null,18));
});
test("weather and model selection cannot see target-hour or future observations",()=>{
 const history=Array.from({length:8},(_,i)=>day(`2026-10-${10+i}`)),target=day("2026-10-18");
 const a=rollingDay(history,target,12,{forceMode:"weather"})!;
 const changed=structuredClone(target);for(let h=12;h<24;h++){changed.weather![h]={temperature:5,rain:20,humidity:99};changed.guests[h]=999;}
 const b=rollingDay(history,changed,12,{forceMode:"weather"})!;
 assert.deepEqual(a.hours.map(h=>h.guests),b.hours.map(h=>h.guests));
 assert.deepEqual(a.model.scores,b.model.scores);
 const forecast=Array(24).fill({temperature:5,rain:20,humidity:99});
 const c=rollingDay(history,target,12,{forceMode:"weather",weatherForecast:forecast})!;
 assert.deepEqual(a.hours.slice(0,12),c.hours.slice(0,12));
});
test("unfinished days do not train and a flat series keeps the simple model",()=>{
 const history=Array.from({length:8},(_,i)=>day(`2026-10-${10+i}`));history[2].complete=false;
 const result=rollingDay(history,day("2026-10-20"))!;
 assert.equal(result.trainingDates.length,7);assert.deepEqual(result.model.selected,{guests:"recent",sales:"recent"});
});
test("weekday candidate earns selection when weekly differences repeat",()=>{
 const history=Array.from({length:50},(_,i)=>{const date=new Date(Date.UTC(2026,7,1+i)).toISOString().slice(0,10),d=day(date),level=dateFeatures(date).weekend?100:5;d.guests=Array.from({length:24},(_,h)=>h>=12&&h<=21?level:0);d.sales=d.guests.map(n=>n*500);return d;});
 const result=rollingDay(history,day("2026-09-25"))!;
 assert.equal(result.model.selected.guests,"calendar");assert.equal(result.model.selected.sales,"calendar");
});
