/**
 * Cron scheduler — Layer 2 (Gateway Core)
 *
 * Loads enabled CronJobs from the DB on startup, schedules each with Croner,
 * and re-registers jobs when they are created/updated/deleted via the API.
 *
 * This module is server-only. It must not import React or any Next.js page/component module.
 */

import { Cron } from "croner";
import type { PrismaClient } from "@prisma/client";

export type BroadcastFn = (message: unknown) => void;

interface RunContext {
  db: PrismaClient;
  serverUrl: string;
  broadcast: BroadcastFn;
}

// Active job registry: cronJobId → Croner instance
const activeJobs = new Map<string, Cron>();

/**
 * Consume a Cognition SSE stream until the `done` event, collecting the
 * final output text and total token usage from `usage` events.
 */
async function consumeStream(
  response: Response,
): Promise<{ output: string; tokenUsage: number }> {
  const reader = response.body?.getReader();
  if (!reader) return { output: "", tokenUsage: 0 };

  const decoder = new TextDecoder();
  let buffer = "";
  let output = "";
  let tokenUsage = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      if (line.startsWith("event: ")) {
        const eventName = line.slice(7).trim();
        continue;
      }
      if (line.startsWith("data: ")) {
        try {
          const payload = JSON.parse(line.slice(6));
          if (payload.event === "done" && payload.data?.assistant_data?.content) {
            output = payload.data.assistant_data.content as string;
          }
          if (payload.event === "usage") {
            tokenUsage =
              ((payload.data?.input_tokens ?? 0) as number) +
              ((payload.data?.output_tokens ?? 0) as number);
          }
          // Also handle flat event/data shape (SSE data contains event name)
          if (!payload.event) {
            // Already handled by `event:` line above
          }
        } catch {
          // Ignore unparseable lines
        }
      }
    }
  }

  return { output, tokenUsage };
}

/**
 * Execute a cron job: create a Cognition session, send the prompt, consume
 * the SSE stream, write a CronJobRun, and broadcast the result.
 */
async function runCronJob(
  cronJobId: string,
  ctx: RunContext,
): Promise<void> {
  const { db, serverUrl, broadcast } = ctx;

  const job = await db.cronJob.findUnique({ where: { id: cronJobId } });
  if (!job || !job.enabled) return;

  const run = await db.cronJobRun.create({
    data: {
      cronJobId: job.id,
      status: "running",
    },
  });

  broadcast({
    type: "cron_run_started",
    cronJobId: job.id,
    cronJobName: job.name,
    runId: run.id,
  });

  let sessionId: string | undefined;

  try {
    // Create a Cognition session
    const sessionRes = await fetch(`${serverUrl}/sessions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: `Cron: ${job.name}`, agent_name: job.agentName }),
    });
    if (!sessionRes.ok) {
      throw new Error(
        `Failed to create session: ${sessionRes.status} ${await sessionRes.text()}`,
      );
    }
    const session = (await sessionRes.json()) as { id: string };
    sessionId = session.id;

    // Send the prompt and stream the response
    const msgRes = await fetch(`${serverUrl}/sessions/${sessionId}/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "text/event-stream",
      },
      body: JSON.stringify({ content: job.prompt }),
    });
    if (!msgRes.ok) {
      throw new Error(
        `Failed to send message: ${msgRes.status} ${await msgRes.text()}`,
      );
    }

    const { output, tokenUsage } = await consumeStream(msgRes);

    const finishedRun = await db.cronJobRun.update({
      where: { id: run.id },
      data: {
        status: "success",
        sessionId,
        output,
        tokenUsage,
        finishedAt: new Date(),
      },
    });

    // Webhook delivery if configured
    if (job.deliveryMode === "webhook" && job.deliveryTarget) {
      await fetch(job.deliveryTarget, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cronJobId: job.id,
          cronJobName: job.name,
          runId: run.id,
          sessionId,
          output,
          tokenUsage,
          status: "success",
        }),
      }).catch((err: unknown) => {
        console.error(`[cron] Webhook delivery failed for job ${job.id}:`, err);
      });
    }

    broadcast({
      type: "cron_run_completed",
      cronJobId: job.id,
      cronJobName: job.name,
      runId: finishedRun.id,
      status: "success",
      sessionId,
      output,
    });
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    console.error(`[cron] Job ${job.id} (${job.name}) failed:`, error);

    await db.cronJobRun.update({
      where: { id: run.id },
      data: {
        status: "error",
        sessionId,
        error,
        finishedAt: new Date(),
      },
    });

    broadcast({
      type: "cron_run_completed",
      cronJobId: job.id,
      cronJobName: job.name,
      runId: run.id,
      status: "error",
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
  ctx: RunContext,
): void {
  // Remove existing registration if any
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
export async function initCronScheduler(ctx: RunContext): Promise<void> {
  const jobs = await ctx.db.cronJob.findMany({ where: { enabled: true } });
  for (const job of jobs) {
    registerJob(job.id, job.schedule, ctx);
  }
  console.log(`[cron] Initialized ${jobs.length} job(s)`);
}
