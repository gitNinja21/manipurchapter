import { requireAdmin } from "@/lib/auth";
import { redirect } from "next/navigation";
import { todayWorkDate } from "@/lib/time";
import CustomerAnalytics from "@/components/CustomerAnalytics";
export default async function AnalyticsPage(){
 if(!await requireAdmin())redirect("/analytics");
 return <CustomerAnalytics today={todayWorkDate()}/>;
}
