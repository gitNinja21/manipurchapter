import { requireAnalytics } from "@/lib/analytics/auth";
import Link from "next/link";
import CaptainLogin from "@/components/CaptainLogin";
import CustomerAnalytics from "@/components/CustomerAnalytics";
import AnalyticsLogout from "@/components/AnalyticsLogout";
import { todayWorkDate } from "@/lib/time";
export default async function AnalyticsPage(){
 const actor=await requireAnalytics();
 if(!actor)return <main className="review-backdrop flex items-center justify-center p-6"><section className="max-w-md w-full bg-surface rounded-2xl p-8 shadow-lg"><p className="text-brand uppercase text-xs tracking-widest">Manipur Chapter</p><h1 className="text-3xl font-bold mt-2 mb-3">Captain dashboard</h1><p className="text-sm text-foreground/65 mb-6">Customer visits, orders and daily insights.</p><CaptainLogin/><Link href="/" className="block text-sm underline mt-6">Back to home / admin sign in</Link></section></main>;
 return <div className="min-h-screen bg-background"><header className="bg-brand text-white px-6 py-4"><div className="max-w-6xl mx-auto flex flex-wrap items-center justify-between gap-4"><Link href="/analytics" className="font-semibold">Manipur Chapter · Captain dashboard</Link><div className="flex items-center gap-4 text-sm"><span>{actor.name}</span>{actor.kind==="ADMIN"&&<Link className="underline" href="/admin/captains">Manage captain logins</Link>}<AnalyticsLogout/></div></div></header><main className="max-w-6xl mx-auto px-4 sm:px-6 py-8"><CustomerAnalytics today={todayWorkDate()} accountKey={`${actor.kind}:${actor.id}`}/></main></div>;
}
