CREATE TABLE "WorkspaceBinding" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "scopeType" TEXT NOT NULL,
  "scopeKey" TEXT NOT NULL,
  "workspacePath" TEXT NOT NULL,
  "repoRoot" TEXT,
  "defaultBranch" TEXT,
  "envProfile" TEXT,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "WorkspaceBinding_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "WorkspaceBinding_userId_idx" ON "WorkspaceBinding"("userId");
CREATE UNIQUE INDEX "WorkspaceBinding_userId_scopeType_scopeKey_key" ON "WorkspaceBinding"("userId", "scopeType", "scopeKey");
