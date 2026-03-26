CREATE TABLE "RuntimeBinding" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "workspaceBindingId" TEXT NOT NULL,
  "runtimeType" TEXT NOT NULL,
  "connectionConfig" TEXT NOT NULL DEFAULT '{}',
  "lifecyclePolicy" TEXT NOT NULL DEFAULT '{}',
  "executionPolicy" TEXT NOT NULL DEFAULT '{}',
  "capabilities" TEXT NOT NULL DEFAULT '[]',
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "RuntimeBinding_workspaceBindingId_fkey" FOREIGN KEY ("workspaceBindingId") REFERENCES "WorkspaceBinding" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "RuntimeBinding_workspaceBindingId_idx" ON "RuntimeBinding"("workspaceBindingId");
