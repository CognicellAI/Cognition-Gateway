/**
 * Audit logging utility — Layer 2
 *
 * Writes AuditLog records for significant Gateway actions.
 * All writes are best-effort — a logging failure must never crash the request.
 */

import { db } from "@/lib/db/client";

export type AuditAction =
  | "session.create"
  | "session.delete"
  | "config.patch"
  | "config.rollback"
  | "cron.create"
  | "cron.update"
  | "cron.delete"
  | "cron.run"
  | "webhook.create"
  | "webhook.update"
  | "webhook.delete"
  | "webhook.invoke"
  | "user.create"
  | "user.role_change"
  | "apikey.create"
  | "apikey.delete"
  | "apikey.use";

interface AuditParams {
  userId?: string;
  userEmail?: string;
  action: AuditAction;
  resource?: string;
  details?: Record<string, unknown>;
  ip?: string;
}

/**
 * Write an audit log entry. Errors are swallowed so logging never crashes a request.
 */
export async function audit(params: AuditParams): Promise<void> {
  try {
    await db.auditLog.create({
      data: {
        userId: params.userId ?? null,
        userEmail: params.userEmail ?? null,
        action: params.action,
        resource: params.resource ?? null,
        details: params.details ? JSON.stringify(params.details) : null,
        ip: params.ip ?? null,
      },
    });
  } catch (err) {
    console.error("[audit] Failed to write audit log:", err);
  }
}

/**
 * Extract IP from a Request object (respects X-Forwarded-For).
 */
export function getIp(request: Request): string | undefined {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? undefined
  );
}
