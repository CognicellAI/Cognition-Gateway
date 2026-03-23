/**
 * Cron scheduler — Layer 2 (Gateway Core)
 *
 * Loads enabled CronJobs from the DB on startup, schedules each with Croner,
 * and re-registers jobs when they are created/updated/deleted via the API.
 *
 * This module is server-only. It must not import React or any Next.js page/component module.
 */

import { Cron } from "croner";
import {
  createDispatchRun,
  executeDispatch,
  executeDispatchInSession,
  findMappedSessionId,
  markDispatchRunError,
  markDispatchRunSuccess,
  type DispatchContext,
  upsertContextMapping,
} from "./dispatch";

// Active job registry: cronJobId -> Croner instance
const activeJobs = new Map<string, Cron>();

/**
 * Execute a cron job: create a Cognition session, send the prompt, record a
 * DispatchRun, and broadcast the result.
 */
async function runCronJob(
  cronJobId: string,
  ctx: DispatchContext,
): Promise<void> {
  const { db, serverUrl, broadcast } = ctx;

  const job = await db.cronJob.findUnique({ where: { id: cronJobId } });
  if (!job || !job.enabled) {
    return;
  }

  const contextKey = job.sessionMode === "persistent" ? `cron:${job.id}` : undefined;
  const existingSessionId = await findMappedSessionId(db, contextKey);
  const approvalRequired = job.approvalMode === "always";

  const dispatchRun = await createDispatchRun(db, {
    sourceType: "cron",
    sourceId: job.id,
    contextKey,
    status: approvalRequired ? "awaiting_approval" : "running",
    approvalRequired,
    approvalReason: approvalRequired ? "Prompt matched approval policy placeholder" : undefined,
    renderedPrompt: job.prompt,
    metadata: {
      cronJobName: job.name,
      title: `Cron: ${job.name}`,
      agentName: job.agentName,
      sessionMode: job.sessionMode,
      deliveryMode: job.deliveryMode,
      approvalMode: job.approvalMode,
      scopeUserId: ctx.scopeUserId,
    },
    cronJobId: job.id,
  });

  broadcast({
    type: "cron_run_started",
    cronJobId: job.id,
    cronJobName: job.name,
    runId: dispatchRun.id,
  });

  let sessionId: string | undefined;

  if (approvalRequired) {
    broadcast({
      type: "dispatch.approval_required",
      runId: dispatchRun.id,
      sourceType: "cron",
      sourceId: job.id,
      reason: "Cron job requires approval before execution",
    });
    return;
  }

  try {
    const dispatchResult = existingSessionId
      ? await executeDispatchInSession(serverUrl, {
          sessionId: existingSessionId,
          content: job.prompt,
        })
      : await executeDispatch(
          serverUrl,
          {
            title: `Cron: ${job.name}`,
            agentName: job.agentName,
          },
          job.prompt,
        );

    sessionId = dispatchResult.sessionId;

    if (contextKey) {
      await upsertContextMapping(db, {
        key: contextKey,
        sourceType: "cron",
        sourceId: job.id,
        sessionId,
        metadata: {
          cronJobName: job.name,
        },
      });
    }

    await markDispatchRunSuccess(db, dispatchRun.id, {
      sessionId,
      output: dispatchResult.output,
      tokenUsage: dispatchResult.tokenUsage,
    });

    if (job.deliveryMode === "webhook" && job.deliveryTarget) {
      await fetch(job.deliveryTarget, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cronJobId: job.id,
          cronJobName: job.name,
          runId: dispatchRun.id,
          sessionId,
          output: dispatchResult.output,
          tokenUsage: dispatchResult.tokenUsage,
          status: "success",
        }),
      }).catch((err: unknown) => {
        console.error(`[cron] Webhook delivery failed for job ${job.id}:`, err);
      });
    }

    broadcast({
      type: "cron.run.complete",
      cronJobId: job.id,
      cronJobName: job.name,
      runId: dispatchRun.id,
      status: "success",
      sessionId,
      output: dispatchResult.output,
    });
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    console.error(`[cron] Job ${job.id} (${job.name}) failed:`, error);

    await markDispatchRunError(db, dispatchRun.id, {
      sessionId,
      error,
    });

    broadcast({
      type: "cron.run.failed",
      cronJobId: job.id,
      cronJobName: job.name,
      runId: dispatchRun.id,
      status: "error",
      sessionId,
      error,
    });
  }
}

/**
 * Register a single job in the active scheduler.
 * If a job with the same ID is already registered, it is stopped first.
 */
export function registerJob(
  cronJobId: string,
  schedule: string,
  ctx: DispatchContext,
): void {
  unregisterJob(cronJobId);

  const task = new Cron(schedule, { catch: true }, () => {
    runCronJob(cronJobId, ctx).catch((err: unknown) => {
      console.error(`[cron] Unhandled error in job ${cronJobId}:`, err);
    });
  });

  activeJobs.set(cronJobId, task);
  console.log(`[cron] Registered job ${cronJobId} with schedule "${schedule}"`);
}

/**
 * Remove a job from the active scheduler.
 */
export function unregisterJob(cronJobId: string): void {
  const existing = activeJobs.get(cronJobId);
  if (existing) {
    existing.stop();
    activeJobs.delete(cronJobId);
    console.log(`[cron] Unregistered job ${cronJobId}`);
  }
}

/**
 * Load all enabled CronJobs from the DB and register them.
 * Called once on server startup.
 */
export async function initCronScheduler(ctx: DispatchContext): Promise<void> {
  const jobs = await ctx.db.cronJob.findMany({ where: { enabled: true } });
  for (const job of jobs) {
    registerJob(job.id, job.schedule, ctx);
  }
  console.log(`[cron] Initialized ${jobs.length} job(s)`);
}
