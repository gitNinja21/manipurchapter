export type WeatherSnapshot={status:"OK"|"NOT_CONFIGURED"|"UNAVAILABLE";source:"WeatherAPI.com";requestedAt:string;reason?:string;observedAt?:string;temperatureC?:number;precipitationMm?:number;humidity?:number;condition?:string;latitude:number;longitude:number};
export async function visitWeather(at:Date,fetcher:typeof fetch=fetch):Promise<WeatherSnapshot>{
 const latitude=Number(process.env.RESTAURANT_LAT || "26.158283"),longitude=Number(process.env.RESTAURANT_LNG || "91.782532");
 const base={source:"WeatherAPI.com" as const,requestedAt:at.toISOString(),latitude,longitude};
 const key=process.env.WEATHERAPI_KEY?.trim();
 if(!key)return {...base,status:"NOT_CONFIGURED",reason:"Weather API key is not configured on the server."};
 try{
  if(!Number.isFinite(latitude)||!Number.isFinite(longitude))throw new Error("Location unavailable");
  const url=new URL("https://api.weatherapi.com/v1/current.json");url.searchParams.set("key",key);url.searchParams.set("q",`${latitude},${longitude}`);url.searchParams.set("aqi","no");
  const response=await fetcher(url,{cache:"no-store",signal:AbortSignal.timeout(5000)});
  if(!response.ok){
   const error=await response.json().catch(()=>null);const code=error?.error?.code;
   const reason=code===2006 ? "Weather API key was rejected. Check WEATHERAPI_KEY in Railway." : code===2007 ? "Weather API monthly quota has been exceeded." : code===2008 ? "Weather API account is disabled." : "Weather provider could not return conditions. The visit is still saved.";
   return {...base,status:"UNAVAILABLE",reason};
  }
  const {current:c}=await response.json();
  if(!c || ![c.last_updated_epoch,c.temp_c,c.precip_mm,c.humidity].every(v=>typeof v==="number" && Number.isFinite(v)) || typeof c.condition?.text!=="string")throw new Error("Incomplete weather");
  const observedAt=new Date(c.last_updated_epoch*1000);
  // Never substitute stale/day-average or future weather for this arrival.
  if(+at-+observedAt>45*60000 || +observedAt-+at>5*60000)return {...base,status:"UNAVAILABLE",reason:"The provider reading was too far from the visit time to use safely."};
  return {...base,status:"OK",observedAt:observedAt.toISOString(),temperatureC:c.temp_c,precipitationMm:c.precip_mm,humidity:c.humidity,condition:c.condition.text.slice(0,150)};
 }catch{return {...base,status:"UNAVAILABLE",reason:"Weather request failed, timed out or returned incomplete data. The visit date and time are saved."};}
}
