-- AlterTable
ALTER TABLE "AttendanceRecord" ADD COLUMN "clockInFaceDistance" REAL;
ALTER TABLE "AttendanceRecord" ADD COLUMN "clockInFaceMatch" BOOLEAN;
ALTER TABLE "AttendanceRecord" ADD COLUMN "clockOutFaceDistance" REAL;
ALTER TABLE "AttendanceRecord" ADD COLUMN "clockOutFaceMatch" BOOLEAN;

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
    "phone" TEXT,
    "alternatePhone" TEXT,
    "address" TEXT,
    "hobbies" TEXT,
    "profilePhoto" TEXT,
    "faceDescriptor" TEXT
);
INSERT INTO "new_User" ("active", "createdAt", "employeeCode", "hourlyRateRs", "id", "name", "passwordHash", "role", "updatedAt") SELECT "active", "createdAt", "employeeCode", "hourlyRateRs", "id", "name", "passwordHash", "role", "updatedAt" FROM "User";
DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";
CREATE UNIQUE INDEX "User_employeeCode_key" ON "User"("employeeCode");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
