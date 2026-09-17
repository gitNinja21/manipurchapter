import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { signSession, SESSION_COOKIE, SESSION_COOKIE_MAX_AGE } from "@/lib/auth";

export async function POST(req: NextRequest) {
  let body: { employeeCode?: string; password?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const employeeCode = (body.employeeCode || "").trim();
  const password = body.password || "";

  if (!employeeCode || !password) {
    return NextResponse.json(
      { error: "Login ID and password are required." },
      { status: 400 }
    );
  }

  const user = await prisma.user.findUnique({
    where: { employeeCode: employeeCode.toUpperCase() },
  });

  // Generic error message on purpose — don't reveal whether the ID exists.
  const invalid = () =>
    NextResponse.json({ error: "Incorrect login ID or password." }, { status: 401 });

  if (!user || !user.active) return invalid();

  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) return invalid();

  const token = await signSession({
    userId: user.id,
    role: user.role as "ADMIN" | "EMPLOYEE",
    employeeCode: user.employeeCode,
    name: user.name,
    mustChangePassword: user.mustChangePassword,
    approved: user.approved,
  });

  const res = NextResponse.json({
    ok: true,
    user: {
      id: user.id,
      name: user.name,
      employeeCode: user.employeeCode,
      role: user.role,
      mustChangePassword: user.mustChangePassword,
      approved: user.approved,
    },
  });

  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_COOKIE_MAX_AGE,
  });

  return res;
}
