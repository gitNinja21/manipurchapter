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
    "faceDescriptor" TEXT
);
INSERT INTO "new_User" ("active", "address", "alternatePhone", "createdAt", "employeeCode", "faceDescriptor", "hobbies", "hourlyRateRs", "id", "mustChangePassword", "name", "passwordHash", "phone", "profilePhoto", "role", "updatedAt") SELECT "active", "address", "alternatePhone", "createdAt", "employeeCode", "faceDescriptor", "hobbies", "hourlyRateRs", "id", "mustChangePassword", "name", "passwordHash", "phone", "profilePhoto", "role", "updatedAt" FROM "User";
DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";
CREATE UNIQUE INDEX "User_employeeCode_key" ON "User"("employeeCode");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- Grandfather in every account that already existed before self-signup was a
-- thing (the admin login plus every employee an admin had already added) so
-- nobody who was already using the system gets locked out waiting on an
-- approval that was never meant to apply to them. Only accounts created from
-- here on via the new /signup flow start at approved = false.
UPDATE "User" SET "approved" = true;
