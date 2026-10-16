import {requireAdmin} from "@/lib/auth";
import {redirect} from "next/navigation";
import CaptainAccounts from "@/components/CaptainAccounts";
export default async function Page(){if(!await requireAdmin())redirect("/");return <CaptainAccounts/>;}
