import { monthlyPerformance } from "@/lib/performanceServer";
import { todayWorkDate } from "@/lib/time";
import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const DEFAULT_EMPLOYEE_PASSWORD = process.env.DEFAULT_EMPLOYEE_PASSWORD || "Welcome123!";

export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Admin only." }, { status: 403 });

  const employees = await prisma.user.findMany({
    where: { role: "EMPLOYEE" },
    orderBy: { name: "asc" },
    select: {
      id: true,
      employeeCode: true,
      name: true,
      hourlyRateRs: true,
      active: true,
      approved: true,
      createdAt: true,
      mustChangePassword: true,
      phone: true,
      alternatePhone: true,
      address: true,
      hobbies: true,
      profilePhoto: true,
    },
  });

  const scores = await monthlyPerformance(todayWorkDate().slice(0,7));
  return NextResponse.json({ employees: employees.map(e => ({...e, points: scores.totals.get(e.id)?.points ?? 0})) });
}

export async function POST(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Admin only." }, { status: 403 });

  let body: {
    employeeCode?: string;
    name?: string;
    hourlyRateRs?: number;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const employeeCode = (body.employeeCode || "").trim().toUpperCase();
  const name = (body.name || "").trim();
  const hourlyRateRs =
    typeof body.hourlyRateRs === "number" && body.hourlyRateRs >= 0 ? body.hourlyRateRs : 100;

  if (!employeeCode || !name) {
    return NextResponse.json(
      { error: "Login ID and name are both required." },
      { status: 400 }
    );
  }

  const existing = await prisma.user.findUnique({ where: { employeeCode } });
  if (existing) {
    return NextResponse.json({ error: "That login ID is already in use." }, { status: 409 });
  }

  // This is the manual fallback for someone who can't complete the /signup
  // flow themselves (e.g. no smartphone) — most employees should sign up on
  // their own now. They start on the same shared default password and are
  // forced through onboarding (set their own password + profile +
  // enrollment photo) on first sign-in — see src/app/onboarding/. Approved
  // immediately since an admin is creating the account directly, so there's
  // nothing left to review the way there is for a self-signup.
  const passwordHash = await bcrypt.hash(DEFAULT_EMPLOYEE_PASSWORD, 10);
  const employee = await prisma.user.create({
    data: {
      employeeCode,
      name,
      passwordHash,
      role: "EMPLOYEE",
      hourlyRateRs,
      mustChangePassword: true,
      approved: true,
    },
    select: {
      id: true,
      employeeCode: true,
      name: true,
      hourlyRateRs: true,
      active: true,
      approved: true,
      createdAt: true,
      mustChangePassword: true,
    },
  });

  return NextResponse.json({
    employee,
    defaultPassword: DEFAULT_EMPLOYEE_PASSWORD,
  });
}
