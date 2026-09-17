import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose/jwt/verify";
import { SESSION_COOKIE } from "@/lib/auth";

// Middleware runs on the Edge runtime, which is why this uses `jose`
// (Web Crypto) directly rather than importing the full auth.ts (that file is
// also jose-based now, but pulls in next/headers + prisma, which don't run
// on the Edge runtime). Route handlers re-verify via getCurrentUser() before
// trusting anything for real work — this is just for redirect decisions.
type SessionInfo = {
  role: "ADMIN" | "EMPLOYEE";
  mustChangePassword: boolean;
  approved: boolean;
} | null;

async function readSession(req: NextRequest): Promise<SessionInfo> {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  try {
    const secretKey = new TextEncoder().encode(process.env.JWT_SECRET as string);
    const { payload } = await jwtVerify(token, secretKey);
    const p = payload as {
      role?: "ADMIN" | "EMPLOYEE";
      mustChangePassword?: boolean;
      approved?: boolean;
    };
    if (!p.role) return null;
    return { role: p.role, mustChangePassword: !!p.mustChangePassword, approved: !!p.approved };
  } catch {
    return null;
  }
}

// Where a logged-in employee belongs right now, in priority order: finish
// onboarding first (only ever true for the admin-added fallback), then wait
// for approval (only ever true for a fresh self-signup), then the real app.
function employeeHome(session: NonNullable<SessionInfo>): string {
  if (session.mustChangePassword) return "/onboarding";
  if (!session.approved) return "/pending-approval";
  return "/employee";
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const session = await readSession(req);

  const isAdminPath = pathname.startsWith("/admin");
  const isEmployeePath = pathname.startsWith("/employee");
  const isOnboardingPath = pathname.startsWith("/onboarding");
  const isPendingApprovalPath = pathname.startsWith("/pending-approval");
  const isAccountPath = pathname.startsWith("/account");
  const isSignupPath = pathname.startsWith("/signup");

  const isProtectedPath =
    isAdminPath || isEmployeePath || isOnboardingPath || isPendingApprovalPath || isAccountPath;

  if (isProtectedPath && !session) {
    const url = new URL("/", req.url);
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  // /signup is public — but someone already signed in has no reason to be
  // there, so send them wherever they actually belong.
  if (isSignupPath) {
    if (!session) return NextResponse.next();
    return NextResponse.redirect(
      new URL(session.role === "ADMIN" ? "/admin" : employeeHome(session), req.url)
    );
  }

  if (!session) return NextResponse.next();

  if (isAdminPath && session.role !== "ADMIN") {
    return NextResponse.redirect(new URL(employeeHome(session), req.url));
  }

  if ((isEmployeePath || isOnboardingPath || isPendingApprovalPath) && session.role === "ADMIN") {
    return NextResponse.redirect(new URL("/admin", req.url));
  }

  if (session.role === "EMPLOYEE") {
    const home = employeeHome(session);

    // Onboarding is only for someone who still needs to set their own
    // password (the admin-added fallback) — once done, bounce them onward.
    if (isOnboardingPath && !session.mustChangePassword) {
      return NextResponse.redirect(new URL(home, req.url));
    }

    // The pending-approval screen is only for someone waiting on a decision
    // — once approved (or if they somehow still need onboarding), move on.
    if (isPendingApprovalPath && home !== "/pending-approval") {
      return NextResponse.redirect(new URL(home, req.url));
    }

    // The real app and the account page both require onboarding to be done
    // AND the account to be approved.
    if ((isEmployeePath || isAccountPath) && home !== "/employee") {
      return NextResponse.redirect(new URL(home, req.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/admin/:path*",
    "/employee/:path*",
    "/onboarding/:path*",
    "/pending-approval/:path*",
    "/account/:path*",
    "/signup/:path*",
  ],
};
