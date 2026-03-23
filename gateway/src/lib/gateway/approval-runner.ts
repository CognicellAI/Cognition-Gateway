import {
  executeDispatch,
  executeDispatchInSession,
  findMappedSessionId,
  markDispatchRunError,
  markDispatchRunRunning,
  markDispatchRunSuccess,
  type BroadcastFn,
  upsertContextMapping,
} from "./dispatch";
import type { PrismaClient } from "@prisma/client";

interface ApprovalRunnerContext {
  db: PrismaClient;
  serverUrl: string;
  broadcast: BroadcastFn;
  scopeUserId?: string;
}

function parseMetadata(value: string | null): Record<string, unknown> {
  if (!value) {
    return {};
  }

  try {
    return JSON.parse(value) as Record<string, unknown>;
  } catch {
    return {};
  }
}

export async function executeApprovedDispatchRun(
  runId: string,
  ctx: ApprovalRunnerContext,
): Promise<void> {
  const run = await ctx.db.dispatchRun.findUnique({ where: { id: runId } });
  if (!run || run.status !== "queued") {
    return;
  }

  await markDispatchRunRunning(ctx.db, run.id);

  let sessionId = run.sessionId ?? undefined;

  try {
    const metadata = parseMetadata(run.metadata);
    const agentName =
      typeof metadata.agentName === "string" && metadata.agentName.trim().length > 0
        ? metadata.agentName
        : "default";
    const title =
      typeof metadata.title === "string" && metadata.title.trim().length > 0
        ? metadata.title
        : `${run.sourceType}: ${run.sourceId}`;
    const prompt = run.renderedPrompt ?? "";
    const mappedSessionId = await findMappedSessionId(ctx.db, run.contextKey ?? undefined);

    const result = mappedSessionId
      ? await executeDispatchInSession(ctx.serverUrl, {
          sessionId: mappedSessionId,
          content: prompt,
          scopeUserId:
            typeof metadata.scopeUserId === "string" ? metadata.scopeUserId : ctx.scopeUserId,
        })
      : await executeDispatch(
          ctx.serverUrl,
          {
            title,
            agentName,
            scopeUserId:
              typeof metadata.scopeUserId === "string" ? metadata.scopeUserId : ctx.scopeUserId,
          },
          prompt,
        );

    sessionId = result.sessionId;

    await markDispatchRunSuccess(ctx.db, run.id, {
      sessionId,
      output: result.output,
      tokenUsage: result.tokenUsage,
    });

    if (run.contextKey) {
      await upsertContextMapping(ctx.db, {
        key: run.contextKey,
        sourceType: run.sourceType,
        sourceId: run.sourceId,
        sessionId,
        metadata,
      });
    }

    ctx.broadcast({
      type: "dispatch.run.complete",
      runId: run.id,
      sourceType: run.sourceType,
      sourceId: run.sourceId,
      sessionId,
      status: "success",
      output: result.output,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    await markDispatchRunError(ctx.db, run.id, {
      sessionId,
      error: message,
    });

    ctx.broadcast({
      type: "dispatch.run.failed",
      runId: run.id,
      sourceType: run.sourceType,
      sourceId: run.sourceId,
      sessionId,
      status: "error",
      error: message,
    });
  }
}
