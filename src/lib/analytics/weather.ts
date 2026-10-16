export type WeatherSnapshot={status:"OK"|"NOT_CONFIGURED"|"UNAVAILABLE";source:"WeatherAPI.com";requestedAt:string;observedAt?:string;temperatureC?:number;precipitationMm?:number;humidity?:number;condition?:string;latitude:number;longitude:number};
export async function visitWeather(at:Date,fetcher:typeof fetch=fetch):Promise<WeatherSnapshot>{
 const latitude=Number(process.env.RESTAURANT_LAT || "26.158283"),longitude=Number(process.env.RESTAURANT_LNG || "91.782532");
 const base={source:"WeatherAPI.com" as const,requestedAt:at.toISOString(),latitude,longitude};
 const key=process.env.WEATHERAPI_KEY?.trim();
 if(!key)return {...base,status:"NOT_CONFIGURED"};
 try{
  if(!Number.isFinite(latitude)||!Number.isFinite(longitude))throw new Error("Location unavailable");
  const url=new URL("https://api.weatherapi.com/v1/current.json");url.searchParams.set("key",key);url.searchParams.set("q",`${latitude},${longitude}`);url.searchParams.set("aqi","no");
  const response=await fetcher(url,{cache:"no-store",signal:AbortSignal.timeout(5000)});
  if(!response.ok)throw new Error("Weather unavailable");
  const {current:c}=await response.json();
  if(!c || ![c.last_updated_epoch,c.temp_c,c.precip_mm,c.humidity].every(v=>typeof v==="number" && Number.isFinite(v)) || typeof c.condition?.text!=="string")throw new Error("Incomplete weather");
  const observedAt=new Date(c.last_updated_epoch*1000);
  // Never substitute stale/day-average or future weather for this arrival.
  if(+at-+observedAt>45*60000 || +observedAt-+at>5*60000)throw new Error("Weather timestamp does not match visit");
  return {...base,status:"OK",observedAt:observedAt.toISOString(),temperatureC:c.temp_c,precipitationMm:c.precip_mm,humidity:c.humidity,condition:c.condition.text.slice(0,150)};
 }catch{return {...base,status:"UNAVAILABLE"};}
}
