CREATE TABLE "AssistantTurn" (
 "id" TEXT NOT NULL PRIMARY KEY, "userId" TEXT NOT NULL, "sourceKey" TEXT NOT NULL,
 "sourceHref" TEXT, "source" TEXT NOT NULL, "body" TEXT NOT NULL, "status" TEXT NOT NULL DEFAULT 'QUEUED',
 "reply" TEXT, "draftJson" TEXT, "requestId" TEXT, "escalated" BOOLEAN NOT NULL DEFAULT false,
 "resolvedAt" DATETIME, "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" DATETIME NOT NULL,
 CONSTRAINT "AssistantTurn_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "AssistantTurn_sourceKey_key" ON "AssistantTurn"("sourceKey");
CREATE INDEX "AssistantTurn_userId_createdAt_idx" ON "AssistantTurn"("userId", "createdAt");
CREATE INDEX "AssistantTurn_status_createdAt_idx" ON "AssistantTurn"("status", "createdAt");
