import { getCurrentUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import LoginForm from "@/components/LoginForm";
export default async function AnalyticsLogin(){
 const user=await getCurrentUser();if(user?.role==="ADMIN")redirect("/admin/analytics");
 return <main className="review-backdrop flex items-center justify-center p-6"><section className="max-w-md w-full bg-surface rounded-2xl p-8 shadow-lg"><p className="text-brand uppercase text-xs tracking-widest">Manipur Chapter</p><h1 className="text-3xl font-bold mt-2 mb-3">Analytics</h1><p className="text-sm text-foreground/65 mb-6">Customer visits, orders and daily insights. Sign in with an admin account.</p>{user ? <p>Access is restricted to admins. Sign out from your account to use an admin login.</p>:<LoginForm adminDestination="/admin/analytics"/>}<Link href="/" className="block text-sm underline mt-6">Back to home</Link></section></main>;
}
