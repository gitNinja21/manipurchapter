import test from "node:test";
import assert from "node:assert/strict";
import {forecastWeather} from "./analytics/forecastWeather";
test("hourly weather handles absent credentials, caches requests and fails safely",async()=>{
 const old=process.env.WEATHERAPI_KEY;delete process.env.WEATHERAPI_KEY;
 try{
  assert.equal((await forecastWeather("2026-10-29")).hours.length,0);
  process.env.WEATHERAPI_KEY="test-only";let calls=0;
  const fetcher=(async()=>{calls++;return new Response(JSON.stringify({forecast:{forecastday:[{date:"2026-10-29",hour:[{time:"2026-10-29 13:00",temp_c:29,precip_mm:0,humidity:70},{time:"2026-10-29 14:00",temp_c:null,precip_mm:0,humidity:70}]}]}}));}) as typeof fetch;
  const a=await forecastWeather("2026-10-29",fetcher);assert.equal(a.hours[13]?.temperature,29);assert.equal(a.hours[14],null);
  await forecastWeather("2026-10-29",fetcher);assert.equal(calls,1);
  const failed=await forecastWeather("2026-10-30",(async()=>new Response("",{status:403})) as typeof fetch);assert.equal(failed.hours.length,0);
 }finally{if(old===undefined)delete process.env.WEATHERAPI_KEY;else process.env.WEATHERAPI_KEY=old;}
});
