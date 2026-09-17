import { SignJWT } from "jose/jwt/sign";
import { jwtVerify } from "jose/jwt/verify";
import { cookies } from "next/headers";
import { NextRequest } from "next/server";
import { prisma } from "./prisma";
import type { Role } from "./roles";

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  // Fail loudly at boot rather than silently signing tokens with "undefined".
  throw new Error("JWT_SECRET env var is not set. Add it to your .env file.");
}
const secretKey = new TextEncoder().encode(JWT_SECRET);

export const SESSION_COOKIE = "mc_session";
const SESSION_DURATION_SECONDS = 60 * 60 * 24 * 14; // 14 days

export type SessionPayload = {
  userId: string;
  role: Role;
  employeeCode: string;
  name: string;
  // Mirrors User.mustChangePassword at the time the session was issued, so
  // middleware (which runs on the Edge runtime and can't hit Prisma) can
  // redirect to /onboarding without a database round-trip. Onboarding
  // completion re-signs the session with this set to false.
  mustChangePassword: boolean;
  // Mirrors User.approved at the time the session was issued, for the same
  // Edge-runtime reason. This can go stale the moment an admin approves
  // someone from a different browser/session — the pending-approval page
  // works around that by polling the live value via /api/auth/me and, once
  // it flips, calling /api/auth/refresh-session to re-sign the cookie.
  approved: boolean;
};

// jose (not jsonwebtoken) is used deliberately: it's built on Web Crypto, so
// the exact same signing/verification code works in both normal Node.js
// route handlers AND in Next's Edge middleware (see src/middleware.ts).
export async function signSession(payload: SessionPayload): Promise<string> {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DURATION_SECONDS}s`)
    .sign(secretKey);
}

export async function verifySession(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey);
    return payload as unknown as SessionPayload;
  } catch {
    return null;
  }
}

/** Read + verify the session cookie from a Server Component / Route Handler context. */
export async function getSession(): Promise<SessionPayload | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return verifySession(token);
}

/** Read + verify the session cookie from inside a Route Handler using the raw NextRequest. */
export async function getSessionFromRequest(
  req: NextRequest
): Promise<SessionPayload | null> {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return verifySession(token);
}

export const SESSION_COOKIE_MAX_AGE = SESSION_DURATION_SECONDS;

/** Fetches the full current user row, or null if not logged in / not found / deactivated. */
export async function getCurrentUser() {
  const session = await getSession();
  if (!session) return null;
  const user = await prisma.user.findUnique({ where: { id: session.userId } });
  if (!user || !user.active) return null;
  return user;
}

/** For use at the top of Route Handlers: returns the logged-in admin, or null if not an active admin. */
export async function requireAdmin() {
  const user = await getCurrentUser();
  if (!user || user.role !== "ADMIN") return null;
  return user;
}
