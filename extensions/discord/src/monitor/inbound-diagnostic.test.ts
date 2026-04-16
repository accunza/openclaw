import { beforeEach, describe, expect, it, vi } from "vitest";

const { loggerMocks } = vi.hoisted(() => ({
  loggerMocks: {
    child: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock("openclaw/plugin-sdk/runtime-env", async () => {
  const actual = await vi.importActual<typeof import("openclaw/plugin-sdk/runtime-env")>(
    "openclaw/plugin-sdk/runtime-env",
  );
  return {
    ...actual,
    createSubsystemLogger: () => loggerMocks,
  };
});

let logDiscordInboundIngress: typeof import("./inbound-diagnostic.js").logDiscordInboundIngress;
let logDiscordRouteResolved: typeof import("./inbound-diagnostic.js").logDiscordRouteResolved;
let logDiscordInboundWorkerStart: typeof import("./inbound-diagnostic.js").logDiscordInboundWorkerStart;
let logDiscordReplyOutcome: typeof import("./inbound-diagnostic.js").logDiscordReplyOutcome;

beforeEach(async () => {
  loggerMocks.info.mockClear();
  ({
    logDiscordInboundIngress,
    logDiscordRouteResolved,
    logDiscordInboundWorkerStart,
    logDiscordReplyOutcome,
  } = await import("./inbound-diagnostic.js"));
});

describe("inbound diagnostic breadcrumbs", () => {
  it("logs ingress fields without retaining blank identifiers", () => {
    logDiscordInboundIngress({
      accountId: "default",
      channelId: "channel-1",
      messageId: "message-1",
      guildId: " ",
      authorId: "author-1",
      isBotAuthor: false,
    });

    expect(loggerMocks.info).toHaveBeenCalledWith("discord inbound ingress", {
      phase: "ingress",
      accountId: "default",
      channelId: "channel-1",
      messageId: "message-1",
      guildId: undefined,
      authorId: "author-1",
      isBotAuthor: false,
    });
  });

  it("logs route resolution with stable routing metadata", () => {
    logDiscordRouteResolved({
      accountId: "default",
      channelId: "channel-1",
      messageId: "message-1",
      routeKind: "channel",
      boundSessionKey: "agent:main:discord:channel:bound",
      route: {
        agentId: "main",
        sessionKey: "agent:main:discord:channel:channel-1",
        matchedBy: "binding.channel",
        lastRoutePolicy: "session",
      },
    });

    expect(loggerMocks.info).toHaveBeenCalledWith("discord inbound route resolved", {
      phase: "route_resolved",
      accountId: "default",
      channelId: "channel-1",
      messageId: "message-1",
      routeKind: "channel",
      agentId: "main",
      sessionKey: "agent:main:discord:channel:channel-1",
      matchedBy: "binding.channel",
      lastRoutePolicy: "session",
      boundSessionKey: "agent:main:discord:channel:bound",
    });
  });

  it("logs worker start and reply outcome", () => {
    logDiscordInboundWorkerStart({
      accountId: "default",
      channelId: "channel-1",
      messageId: "message-1",
      queueKey: "agent:main:discord:channel:channel-1",
      sessionKey: "agent:main:discord:channel:channel-1",
    });
    logDiscordReplyOutcome({
      accountId: "default",
      channelId: "channel-1",
      messageId: "message-1",
      sessionKey: "agent:main:discord:channel:channel-1",
      createdThreadId: "thread-1",
      outcome: "delivered",
    });

    expect(loggerMocks.info).toHaveBeenNthCalledWith(1, "discord inbound worker start", {
      phase: "worker_execution",
      status: "start",
      accountId: "default",
      channelId: "channel-1",
      messageId: "message-1",
      queueKey: "agent:main:discord:channel:channel-1",
      sessionKey: "agent:main:discord:channel:channel-1",
    });
    expect(loggerMocks.info).toHaveBeenNthCalledWith(2, "discord inbound reply outcome", {
      phase: "reply_outcome",
      accountId: "default",
      channelId: "channel-1",
      messageId: "message-1",
      sessionKey: "agent:main:discord:channel:channel-1",
      createdThreadId: "thread-1",
      outcome: "delivered",
    });
  });
});
