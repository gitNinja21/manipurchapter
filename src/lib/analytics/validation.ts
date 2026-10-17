import { CATALOG, isOpenItem } from "./menu";
export const DISCOVERY=["NOT_ASKED","WALK_IN","INSTAGRAM","GOOGLE","FRIEND_FAMILY","OTHER"] as const;
export type ItemSnapshot={menuId:string;name:string;category:string;diet:string;unitPriceRs:number;quantity:number;favourite:boolean};
function integer(value:unknown,label:string,min=0,max=300):number {if(typeof value!=="number" || !Number.isInteger(value) || value<min || value>max) throw new Error(`${label} must be a whole number from ${min} to ${max}.`);return value;}
function itemQuantity(value:unknown,open:boolean):number {
 if(typeof value!=="number" || !Number.isFinite(value) || value<0.5 || value>500 || !Number.isInteger(value*2))throw new Error("Quantity must be in half steps from ½ to 500.");
 if(open && value!==0.5)throw new Error("Open Items are half portions only. For a full portion, choose the item from Menu Items.");
 return value;
}
function text(value:unknown,label:string,max:number){if(value===undefined)return "";if(typeof value!=="string" || value.length>max)throw new Error(`${label} must be text, up to ${max} characters.`);return value.trim();}
function choice<T extends string>(value:unknown,allowed:readonly T[],label:string):T {if(typeof value!=="string" || !allowed.includes(value as T))throw new Error(`Choose a valid ${label}.`);return value as T;}
export function validateVisit(body:unknown,existingItems:ItemSnapshot[]=[]){
 if(!body || typeof body!=="object" || Array.isArray(body))throw new Error("Invalid visit.");
 const b=body as Record<string,unknown>;
 const maleCount=integer(b.maleCount,"Male count"),femaleCount=integer(b.femaleCount,"Female count"),unrecordedCount=integer(b.unrecordedCount ?? 0,"Legacy group count");
 const groupSize=integer(maleCount+femaleCount+unrecordedCount,"Group size",1,300);
 const groupType=unrecordedCount===groupSize ? "NOT_RECORDED" : maleCount===groupSize ? "MALE" : femaleCount===groupSize ? "FEMALE" : "MIXED";
 if(!Array.isArray(b.items) || b.items.length>100)throw new Error("Choose up to 100 items.");
 const seen=new Set<string>();
 const items:ItemSnapshot[]=b.items.map(raw=>{
  if(!raw || typeof raw!=="object")throw new Error("Invalid item.");
  const item=CATALOG.find(m=>m.id===raw.menuId);
  const previous=existingItems.find(m=>m.menuId===raw.menuId && m.diet===raw.diet);
  if(!item && !previous)throw new Error("Choose an item from the menu.");
  const diet=choice(raw.diet,["VEG","NON_VEG"],"veg/non-veg option");
  if(item && item.diet!=="CHOICE" && diet!==item.diet)throw new Error(`Diet does not match ${item.name}.`);
  const key=`${raw.menuId}:${diet}`;if(seen.has(key))throw new Error("An item is repeated. Increase its quantity instead.");seen.add(key);
  if(typeof raw.favourite!=="boolean")throw new Error("Invalid favourite selection.");
  return {menuId:raw.menuId,name:previous?.name ?? item!.name,category:previous?.category ?? item!.category,diet,unitPriceRs:previous?.unitPriceRs ?? item!.price,quantity:itemQuantity(raw.quantity,isOpenItem(raw.menuId)),favourite:raw.favourite};
 });
 if(!Array.isArray(b.unavailable) || b.unavailable.length>30)throw new Error("Enter up to 30 unavailable item names.");
 const unavailable=[...new Set(b.unavailable.map(v=>text(v,"Unavailable item",150)).filter(Boolean))];
 const discovery=choice(b.discovery,DISCOVERY,"discovery source"),discoveryOther=text(b.discoveryOther,"Other source",200);
 if(discovery==="OTHER" && !discoveryOther)throw new Error("Enter where the customer heard about us.");
 return {data:{maleCount,femaleCount,unrecordedCount,groupSize,groupType,visitType:choice(b.visitType,["NOT_SURE","FIRST","REPEAT"],"visit type"),discovery,discoveryOther:discovery==="OTHER"?discoveryOther:"",unavailableJson:JSON.stringify(unavailable),feedback:text(b.feedback,"Feedback",1000),tableLabel:text(b.tableLabel,"Table / reference",50),status:choice(b.status,["OPEN","COMPLETE"],"visit status")},items};
}
