import { NextResponse } from "next/server";
import { CAPTAIN_COOKIE } from "@/lib/analytics/auth";
import { SESSION_COOKIE } from "@/lib/auth";
export async function POST(){const res=NextResponse.json({ok:true});for(const name of [CAPTAIN_COOKIE,SESSION_COOKIE])res.cookies.set(name,"",{path:"/",maxAge:0});return res;}
