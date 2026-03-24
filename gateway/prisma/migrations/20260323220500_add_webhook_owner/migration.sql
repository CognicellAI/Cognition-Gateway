ALTER TABLE "Webhook" ADD COLUMN "userId" TEXT;

UPDATE "Webhook"
SET "userId" = (
  SELECT "id"
  FROM "User"
  ORDER BY "createdAt" ASC
  LIMIT 1
)
WHERE "userId" IS NULL;

CREATE INDEX "Webhook_userId_idx" ON "Webhook"("userId");
