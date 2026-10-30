import {parseWeather,type HourWeather} from "./forecastFeatures";
type Result={hours:(HourWeather|null)[];status:string};
let cached:{key:string;expires:number;result:Result}|undefined;
let pending:{key:string;promise:Promise<Result>}|undefined;
export async function forecastWeather(date:string,fetcher:typeof fetch=fetch):Promise<Result>{
 const apiKey=process.env.WEATHERAPI_KEY?.trim(),lat=process.env.RESTAURANT_LAT||"26.158283",lng=process.env.RESTAURANT_LNG||"91.782532";
 if(!apiKey)return {hours:[],status:"Weather forecast unavailable: WEATHERAPI_KEY is not configured."};
 const key=`${date}:${lat}:${lng}`;
 if(cached?.key===key&&cached.expires>Date.now())return cached.result;
 if(pending?.key===key)return pending.promise;
 const promise=(async()=>{
  let result:Result;
  try{
   const url=new URL("https://api.weatherapi.com/v1/forecast.json");url.searchParams.set("key",apiKey);url.searchParams.set("q",`${lat},${lng}`);url.searchParams.set("days","1");url.searchParams.set("aqi","no");url.searchParams.set("alerts","no");
   const response=await fetcher(url,{cache:"no-store",signal:AbortSignal.timeout(5000)});
   if(!response.ok)throw Error("Weather provider unavailable");
   const body=await response.json(),day=body.forecast?.forecastday?.find((d:{date:string})=>d.date===date);
   if(!Array.isArray(day?.hour))throw Error("Missing forecast");
   const hours:(HourWeather|null)[]=Array(24).fill(null);
   for(const row of day.hour){const time=typeof row.time==="string"?row.time:"";if(!time.startsWith(`${date} `))continue;const h=Number(time.slice(11,13));if(Number.isInteger(h)&&h>=0&&h<24)hours[h]=parseWeather({temperature:row.temp_c,rain:row.precip_mm,humidity:row.humidity});}
   if(!hours.some(Boolean))throw Error("Missing weather readings");
   result={hours,status:"Hourly weather forecast available (WeatherAPI.com)."};
  }catch{result={hours:[],status:"Hourly weather forecast unavailable. Using earlier observed weather where available."};}
  cached={key,expires:Date.now()+(result.hours.length?30:5)*60000,result};return result;
 })();
 pending={key,promise};try{return await promise;}finally{if(pending?.promise===promise)pending=undefined;}
}
