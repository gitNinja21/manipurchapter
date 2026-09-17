import { NextResponse } from "next/server";
import { getCurrentUser, signSession, SESSION_COOKIE, SESSION_COOKIE_MAX_AGE } from "@/lib/auth";

// Re-signs the session cookie from the current database state. Needed
// because `approved` (and `mustChangePassword`) are embedded in the JWT for
// Edge-safe middleware redirects, so a session issued before an admin
// approves someone doesn't update itself — this is what the pending-approval
// page calls once it notices (via /api/auth/me) that it's been approved, so
// the employee lands in the app without having to log out and back in.
export async function POST() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const token = await signSession({
    userId: user.id,
    role: user.role as "ADMIN" | "EMPLOYEE",
    employeeCode: user.employeeCode,
    name: user.name,
    mustChangePassword: user.mustChangePassword,
    approved: user.approved,
  });

  const res = NextResponse.json({ ok: true, approved: user.approved });
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_COOKIE_MAX_AGE,
  });
  return res;
}
