import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const employeeCode = process.env.ADMIN_EMPLOYEE_CODE || "ADMIN";
  const name = process.env.ADMIN_NAME || "Admin";
  const password = process.env.ADMIN_PASSWORD || "ChangeMe123!";

  const existing = await prisma.user.findUnique({ where: { employeeCode } });
  if (existing) {
    console.log(`Admin login "${employeeCode}" already exists, skipping.`);
    return;
  }

  const passwordHash = await bcrypt.hash(password, 10);
  await prisma.user.create({
    data: {
      employeeCode,
      name,
      passwordHash,
      role: "ADMIN",
      hourlyRateRs: 0,
      // Admins are handed their password directly (not the shared employee
      // default), so they skip the forced onboarding flow.
      mustChangePassword: false,
      // Not gated by the employee approval flow, but set explicitly rather
      // than left at the schema default so the row doesn't look like an
      // unreviewed signup.
      approved: true,
    },
  });

  console.log("Created admin login:");
  console.log(`  Login ID: ${employeeCode}`);
  console.log(`  Password: ${password}`);
  console.log("Log in and change this password (or create a proper admin) before going live.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
