-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "employeeCode" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'EMPLOYEE',
    "hourlyRateRs" REAL NOT NULL DEFAULT 100,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "mustChangePassword" BOOLEAN NOT NULL DEFAULT true,
    "approved" BOOLEAN NOT NULL DEFAULT false,
    "phone" TEXT,
    "alternatePhone" TEXT,
    "address" TEXT,
    "hobbies" TEXT,
    "profilePhoto" TEXT,
    "faceDescriptor" TEXT,
    "birthdayMonth" INTEGER,
    "birthdayDay" INTEGER,
    "shareBirthday" BOOLEAN NOT NULL DEFAULT false,
    "muteChat" BOOLEAN NOT NULL DEFAULT false,
    "chatReadAt" DATETIME,
    "attendancePolicyFrom" TEXT,
    "attendanceStartMinute" INTEGER NOT NULL DEFAULT 570,
    "attendanceLatestMinute" INTEGER NOT NULL DEFAULT 630,
    "attendanceEndMinute" INTEGER NOT NULL DEFAULT 1350,
    "attendanceAllowEarly" BOOLEAN NOT NULL DEFAULT false
);
INSERT INTO "new_User" ("active", "address", "alternatePhone", "approved", "attendancePolicyFrom", "birthdayDay", "birthdayMonth", "chatReadAt", "createdAt", "employeeCode", "faceDescriptor", "hobbies", "hourlyRateRs", "id", "mustChangePassword", "muteChat", "name", "passwordHash", "phone", "profilePhoto", "role", "shareBirthday", "updatedAt") SELECT "active", "address", "alternatePhone", "approved", "attendancePolicyFrom", "birthdayDay", "birthdayMonth", "chatReadAt", "createdAt", "employeeCode", "faceDescriptor", "hobbies", "hourlyRateRs", "id", "mustChangePassword", "muteChat", "name", "passwordHash", "phone", "profilePhoto", "role", "shareBirthday", "updatedAt" FROM "User";
DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";
CREATE UNIQUE INDEX "User_employeeCode_key" ON "User"("employeeCode");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;


-- Match the existing account IDs supplied by the administrator. No fuzzy name matching.
-- Angai: scheduled minutes after midnight in IST; one-hour deduction is snapshotted at clock-in.
UPDATE "User" SET "attendancePolicyFrom" = '2026-09-19', "attendanceStartMinute" = 780, "attendanceLatestMinute" = 780, "attendanceEndMinute" = 1350, "attendanceAllowEarly" = true WHERE "id" = 'cmu5ag8ce000395shnlmls7ln' AND "role" = 'EMPLOYEE';
-- Chetan: scheduled minutes after midnight in IST; one-hour deduction is snapshotted at clock-in.
UPDATE "User" SET "attendancePolicyFrom" = '2026-09-19', "attendanceStartMinute" = 780, "attendanceLatestMinute" = 780, "attendanceEndMinute" = 1350, "attendanceAllowEarly" = true WHERE "id" = 'cmu5adpin000295shn82n6p47' AND "role" = 'EMPLOYEE';
-- Dinjana: scheduled minutes after midnight in IST; one-hour deduction is snapshotted at clock-in.
UPDATE "User" SET "attendancePolicyFrom" = '2026-09-19', "attendanceStartMinute" = 690, "attendanceLatestMinute" = 690, "attendanceEndMinute" = 1230, "attendanceAllowEarly" = true WHERE "id" = 'cmu5cokep000495shpehjvqai' AND "role" = 'EMPLOYEE';
-- Joyshree: scheduled minutes after midnight in IST; one-hour deduction is snapshotted at clock-in.
UPDATE "User" SET "attendancePolicyFrom" = '2026-09-19', "attendanceStartMinute" = 600, "attendanceLatestMinute" = 600, "attendanceEndMinute" = 1140, "attendanceAllowEarly" = true WHERE "id" = 'cmu5ctlgj000795sh8a4rawn1' AND "role" = 'EMPLOYEE';
-- Sagar: scheduled minutes after midnight in IST; one-hour deduction is snapshotted at clock-in.
UPDATE "User" SET "attendancePolicyFrom" = '2026-09-19', "attendanceStartMinute" = 780, "attendanceLatestMinute" = 780, "attendanceEndMinute" = 1350, "attendanceAllowEarly" = true WHERE "id" = 'cmu5abali000095sh62r5yttk' AND "role" = 'EMPLOYEE';
-- Vicky: scheduled minutes after midnight in IST; one-hour deduction is snapshotted at clock-in.
UPDATE "User" SET "attendancePolicyFrom" = '2026-09-19', "attendanceStartMinute" = 750, "attendanceLatestMinute" = 750, "attendanceEndMinute" = 1350, "attendanceAllowEarly" = true WHERE "id" = 'cmu5acmqw000195sht77e1cok' AND "role" = 'EMPLOYEE';
