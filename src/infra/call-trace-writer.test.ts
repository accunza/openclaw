import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { OpenClawConfig } from "../config/config.js";
import { startCallTraceWriter } from "./call-trace-writer.js";
import {
  emitDiagnosticEvent,
  onDiagnosticEvent,
  resetDiagnosticEventsForTest,
} from "./diagnostic-events.js";

describe("call-trace-writer", () => {
  let tmpDir: string;

  beforeEach(() => {
    resetDiagnosticEventsForTest();
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "openclaw-call-trace-"));
  });

  afterEach(() => {
    resetDiagnosticEventsForTest();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("does nothing when telemetry calls is disabled", () => {
    const cfg = { telemetry: { calls: { enabled: false, dir: tmpDir } } } as OpenClawConfig;
    const stop = startCallTraceWriter(cfg);

    emitDiagnosticEvent({
      type: "model.usage",
      usage: {},
    });

    stop();
    const file = path.join(tmpDir, `${new Date().toISOString().slice(0, 10)}.jsonl`);
    expect(fs.existsSync(file)).toBe(false);
  });

  it("registers listener when telemetry calls is enabled", () => {
    const cfg = { telemetry: { calls: { enabled: true, dir: tmpDir } } } as OpenClawConfig;
    const before: string[] = [];
    const after: string[] = [];
    const tap = onDiagnosticEvent((evt) => {
      if (evt.type === "model.usage") {
        after.push(evt.type);
      } else {
        before.push(evt.type);
      }
    });
    const stop = startCallTraceWriter(cfg);

    emitDiagnosticEvent({ type: "model.usage", usage: {} });

    stop();
    tap();
    expect(after.length).toBe(1);
  });

  it("writes model.usage row", () => {
    const cfg = { telemetry: { calls: { enabled: true, dir: tmpDir } } } as OpenClawConfig;
    const stop = startCallTraceWriter(cfg);
    const ts = Date.now();
    emitDiagnosticEvent({
      type: "model.usage",
      sessionKey: "agent:samantha:main",
      sessionId: "sid-1",
      taskId: "task-1",
      agentId: "samantha",
      spawnDepth: 1,
      channel: "discord",
      provider: "openrouter",
      model: "x",
      thinkLevel: "high",
      reasoningLevel: "medium",
      thinkingTokens: 7,
      usage: { input: 10, output: 20, cacheRead: 1, cacheWrite: 2 },
      context: { used: 30, limit: 100 },
      costUsd: 0.01,
      durationMs: 123,
    });
    stop();

    const file = path.join(tmpDir, `${new Date(ts).toISOString().slice(0, 10)}.jsonl`);
    expect(fs.existsSync(file)).toBe(true);
    const lines = fs.readFileSync(file, "utf8").trim().split("\n");
    expect(lines.length).toBe(1);
    const row = JSON.parse(lines[0]) as Record<string, unknown>;
    expect(row.status).toBe("done");
    expect(row.taskId).toBe("task-1");
    expect(row.thinkingTokens).toBe(7);
    expect(row.inputTokens).toBe(10);
  });

  it("writes model.error row with null token fields", () => {
    const cfg = { telemetry: { calls: { enabled: true, dir: tmpDir } } } as OpenClawConfig;
    const stop = startCallTraceWriter(cfg);
    const ts = Date.now();
    emitDiagnosticEvent({
      type: "model.error",
      sessionKey: "agent:samantha:main",
      sessionId: "sid-2",
      taskId: "task-2",
      agentId: "samantha",
      spawnDepth: 2,
      provider: "openrouter",
      model: "y",
      thinkLevel: "low",
      reasoningLevel: "low",
      durationMs: 55,
      errorKind: "FailoverError",
      errorReason: "timeout",
      errorMessage: "boom",
    });
    stop();

    const file = path.join(tmpDir, `${new Date(ts).toISOString().slice(0, 10)}.jsonl`);
    const row = JSON.parse(fs.readFileSync(file, "utf8").trim()) as Record<string, unknown>;
    expect(row.status).toBe("error");
    expect(row.inputTokens).toBeNull();
    expect(row.outputTokens).toBeNull();
    expect(row.errorKind).toBe("FailoverError");
    expect(row.errorReason).toBe("timeout");
  });

  it("stops writing after unsubscribe", () => {
    const cfg = { telemetry: { calls: { enabled: true, dir: tmpDir } } } as OpenClawConfig;
    const stop = startCallTraceWriter(cfg);
    emitDiagnosticEvent({ type: "model.usage", usage: { input: 1 } });
    stop();
    emitDiagnosticEvent({ type: "model.usage", usage: { input: 2 } });

    const file = path.join(tmpDir, `${new Date().toISOString().slice(0, 10)}.jsonl`);
    const lines = fs.readFileSync(file, "utf8").trim().split("\n");
    expect(lines.length).toBe(1);
  });
});
