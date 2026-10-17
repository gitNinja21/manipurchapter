-- Preserve every saved line while allowing half-portion quantities.
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_CustomerVisitItem" (
 "id" TEXT NOT NULL PRIMARY KEY, "visitId" TEXT NOT NULL, "menuId" TEXT NOT NULL,
 "name" TEXT NOT NULL, "category" TEXT NOT NULL, "diet" TEXT NOT NULL,
 "unitPriceRs" INTEGER NOT NULL, "quantity" REAL NOT NULL, "favourite" BOOLEAN NOT NULL DEFAULT false,
 CONSTRAINT "CustomerVisitItem_visitId_fkey" FOREIGN KEY ("visitId") REFERENCES "CustomerVisit"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_CustomerVisitItem" ("id","visitId","menuId","name","category","diet","unitPriceRs","quantity","favourite")
 SELECT "id","visitId","menuId","name","category","diet","unitPriceRs","quantity","favourite" FROM "CustomerVisitItem";
DROP TABLE "CustomerVisitItem";
ALTER TABLE "new_CustomerVisitItem" RENAME TO "CustomerVisitItem";
CREATE UNIQUE INDEX "CustomerVisitItem_visitId_menuId_diet_key" ON "CustomerVisitItem"("visitId","menuId","diet");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
