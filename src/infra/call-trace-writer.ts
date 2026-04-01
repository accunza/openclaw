import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { OpenClawConfig } from "../config/config.js";
import { type DiagnosticEventPayload, onDiagnosticEvent } from "./diagnostic-events.js";

export type CallTraceRow = {
  ts: number;
  taskId?: string | null;
  sessionKey?: string | null;
  sessionId?: string | null;
  agentId?: string | null;
  spawnDepth?: number | null;
  triggerKind?: string | null;
  triggerChannel?: string | null;
  triggerMessageId?: string | null;
  triggerSenderId?: string | null;
  triggerSenderName?: string | null;
  triggerPromptSnippet?: string | null;
  provider?: string | null;
  model?: string | null;
  status: "done" | "error";
  inputTokens?: number | null;
  outputTokens?: number | null;
  cacheReadTokens?: number | null;
  cacheWriteTokens?: number | null;
  thinkingTokens?: number | null;
  thinkLevel?: string | null;
  reasoningLevel?: string | null;
  contextUsed?: number | null;
  contextLimit?: number | null;
  costUsd?: number | null;
  durationMs?: number | null;
  errorKind?: string | null;
  errorReason?: string | null;
  errorMessage?: string | null;
};

function resolveCallsDir(cfg: OpenClawConfig): string {
  const dir = cfg.telemetry?.calls?.dir;
  if (dir) {
    return dir.startsWith("~") ? path.join(os.homedir(), dir.slice(1)) : dir;
  }
  return path.join(os.homedir(), ".openclaw", "calls");
}

function dateKey(ts: number): string {
  return new Date(ts).toISOString().slice(0, 10);
}

function appendRow(dir: string, ts: number, row: CallTraceRow): void {
  try {
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, `${dateKey(ts)}.jsonl`);
    fs.appendFileSync(file, JSON.stringify(row) + "\n", "utf8");
  } catch {
    // best-effort — never throw from telemetry writer
  }
}

export function startCallTraceWriter(cfg: OpenClawConfig): () => void {
  if (cfg.telemetry?.calls?.enabled !== true) {
    return () => {};
  }
  const dir = resolveCallsDir(cfg);

  const handler = (evt: DiagnosticEventPayload): void => {
    if (evt.type === "model.usage") {
      const row: CallTraceRow = {
        ts: evt.ts,
        taskId: evt.taskId ?? null,
        sessionKey: evt.sessionKey ?? null,
        sessionId: evt.sessionId ?? null,
        agentId: evt.agentId ?? null,
        spawnDepth: evt.spawnDepth ?? null,
        triggerKind: null,
        triggerChannel: evt.channel ?? null,
        triggerMessageId: null,
        triggerSenderId: null,
        triggerSenderName: null,
        triggerPromptSnippet: null,
        provider: evt.provider ?? null,
        model: evt.model ?? null,
        status: "done",
        inputTokens: evt.usage.input ?? null,
        outputTokens: evt.usage.output ?? null,
        cacheReadTokens: evt.usage.cacheRead ?? null,
        cacheWriteTokens: evt.usage.cacheWrite ?? null,
        thinkingTokens: evt.thinkingTokens ?? null,
        thinkLevel: evt.thinkLevel ?? null,
        reasoningLevel: evt.reasoningLevel ?? null,
        contextUsed: evt.context?.used ?? null,
        contextLimit: evt.context?.limit ?? null,
        costUsd: evt.costUsd ?? null,
        durationMs: evt.durationMs ?? null,
        errorKind: null,
        errorReason: null,
        errorMessage: null,
      };
      appendRow(dir, evt.ts, row);
    } else if (evt.type === "model.error") {
      const row: CallTraceRow = {
        ts: evt.ts,
        taskId: evt.taskId ?? null,
        sessionKey: evt.sessionKey ?? null,
        sessionId: evt.sessionId ?? null,
        agentId: evt.agentId ?? null,
        spawnDepth: evt.spawnDepth ?? null,
        triggerKind: null,
        triggerChannel: null,
        triggerMessageId: null,
        triggerSenderId: null,
        triggerSenderName: null,
        triggerPromptSnippet: null,
        provider: evt.provider ?? null,
        model: evt.model ?? null,
        status: "error",
        inputTokens: null,
        outputTokens: null,
        cacheReadTokens: null,
        cacheWriteTokens: null,
        thinkingTokens: null,
        thinkLevel: evt.thinkLevel ?? null,
        reasoningLevel: evt.reasoningLevel ?? null,
        contextUsed: null,
        contextLimit: null,
        costUsd: null,
        durationMs: evt.durationMs ?? null,
        errorKind: evt.errorKind,
        errorReason: evt.errorReason ?? null,
        errorMessage: evt.errorMessage,
      };
      appendRow(dir, evt.ts, row);
    }
  };

  return onDiagnosticEvent(handler);
}
