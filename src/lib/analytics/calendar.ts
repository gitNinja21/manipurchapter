import { workDateFor } from "../time";
export const HOLIDAY_SOURCE="https://diphumch.assam.gov.in/sites/default/files/public_utility/Assam-Government-Holiday-List-2026-PDF_0.pdf";
// Assam government notification 17 Nov 2025. Calendar tags describe local context,
// not restaurant closures. Admin overrides allow corrigenda and local festivals.
const holidays:Record<string,string>={
 "2026-01-14":"Magh Bihu / Tusu Puja","2026-01-15":"Magh Bihu / Tusu Puja","2026-01-23":"Netaji's Birthday","2026-01-26":"Republic Day","2026-01-27":"Gwthar Bathou San","2026-01-31":"Me-Dam-Me-Phi","2026-02-01":"Bir Chilaray Divas","2026-03-03":"Dol Jatra","2026-03-21":"Id-Ul-Fitr","2026-04-03":"Good Friday","2026-04-14":"Bohag Bihu","2026-04-15":"Bohag Bihu","2026-04-16":"Bohag Bihu","2026-04-18":"Tithi of Damodar Deva","2026-04-21":"Sati Sadhini Divas","2026-05-01":"May Day / Buddha Purnima","2026-05-27":"Id-ul-Zuha","2026-06-01":"Janmotsav of Sri Sri Madhabdeva","2026-08-15":"Independence Day","2026-09-01":"Tirubhav Tithi of Sri Sri Madhabdeva","2026-09-04":"Janmastomi","2026-09-12":"Tirubhav Tithi of Srimanta Sankardeva","2026-09-21":"Janmotsav of Srimanta Sankardeva","2026-09-22":"Karam Puja","2026-10-02":"Gandhi Jayanti","2026-10-18":"Kati Bihu / Durga Puja","2026-10-19":"Durga Puja / Vijaya Dashomi","2026-10-20":"Durga Puja / Vijaya Dashomi","2026-10-21":"Durga Puja / Vijaya Dashomi","2026-11-08":"Kali Puja / Diwali","2026-11-11":"Bhatri Dwitiya","2026-11-15":"Chhath Puja","2026-11-24":"Guru Nanak's Birthday / Lachit Divas","2026-12-02":"Asom Divas","2026-12-25":"Christmas Day"
};
export function calendarDay(date:string,override?:{namesJson:string;isHoliday:boolean}|null){
 return {date,names:override ? JSON.parse(override.namesJson) as string[] : holidays[date] ? [holidays[date]] : date==="2026-10-25" ? ["Lakshmi Puja (government half holiday)"] : [],isHoliday:override?.isHoliday ?? !!holidays[date],source:override ? "Admin calendar" : date.startsWith("2026-") ? "Assam 2026 published calendar" : "Calendar not configured for this year",covered:!!override || date.startsWith("2026-")};
}
export function visitTime(at:Date){
 const workDate=workDateFor(at),weekday=new Date(`${workDate}T12:00:00Z`).getUTCDay(),day=Number(workDate.slice(-2));
 return {workDate,weekday,isWeekend:weekday===0||weekday===6,monthPeriod:day<=10 ? "START" : day<=20 ? "MIDDLE":"END"};
}
export function validDate(value:unknown):value is string{return typeof value==="string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0,10)===value;}
