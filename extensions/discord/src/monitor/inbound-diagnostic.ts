import type { ResolvedAgentRoute } from "openclaw/plugin-sdk/routing";
import { createSubsystemLogger } from "openclaw/plugin-sdk/runtime-env";
import { normalizeOptionalString } from "openclaw/plugin-sdk/text-runtime";

const log = createSubsystemLogger("discord/inbound-diagnostic");

type DiscordInboundRouteKind = "channel" | "direct" | "group";
type DiscordInboundReplyOutcome =
  | "delivered"
  | "started_only"
  | "none"
  | "timeout"
  | "timeout_after_start"
  | "error";

function optional(value: string | null | undefined): string | undefined {
  return normalizeOptionalString(value) ?? undefined;
}

export function logDiscordInboundIngress(params: {
  accountId?: string | null;
  channelId?: string | null;
  messageId?: string | null;
  guildId?: string | null;
  authorId?: string | null;
  isBotAuthor?: boolean;
}) {
  log.info("discord inbound ingress", {
    phase: "ingress",
    accountId: optional(params.accountId),
    channelId: optional(params.channelId),
    messageId: optional(params.messageId),
    guildId: optional(params.guildId),
    authorId: optional(params.authorId),
    isBotAuthor: params.isBotAuthor === true,
  });
}

export function logDiscordRouteResolved(params: {
  accountId?: string | null;
  channelId?: string | null;
  messageId?: string | null;
  route: Pick<
    ResolvedAgentRoute,
    "agentId" | "sessionKey" | "matchedBy" | "lastRoutePolicy"
  >;
  routeKind: DiscordInboundRouteKind;
  boundSessionKey?: string | null;
}) {
  log.info("discord inbound route resolved", {
    phase: "route_resolved",
    accountId: optional(params.accountId),
    channelId: optional(params.channelId),
    messageId: optional(params.messageId),
    routeKind: params.routeKind,
    agentId: optional(params.route.agentId),
    sessionKey: optional(params.route.sessionKey),
    matchedBy: params.route.matchedBy,
    lastRoutePolicy: params.route.lastRoutePolicy,
    boundSessionKey: optional(params.boundSessionKey),
  });
}

export function logDiscordInboundWorkerStart(params: {
  accountId?: string | null;
  channelId?: string | null;
  messageId?: string | null;
  queueKey?: string | null;
  sessionKey?: string | null;
}) {
  log.info("discord inbound worker start", {
    phase: "worker_execution",
    status: "start",
    accountId: optional(params.accountId),
    channelId: optional(params.channelId),
    messageId: optional(params.messageId),
    queueKey: optional(params.queueKey),
    sessionKey: optional(params.sessionKey),
  });
}

export function logDiscordReplyOutcome(params: {
  accountId?: string | null;
  channelId?: string | null;
  messageId?: string | null;
  sessionKey?: string | null;
  createdThreadId?: string | null;
  outcome: DiscordInboundReplyOutcome;
}) {
  log.info("discord inbound reply outcome", {
    phase: "reply_outcome",
    accountId: optional(params.accountId),
    channelId: optional(params.channelId),
    messageId: optional(params.messageId),
    sessionKey: optional(params.sessionKey),
    createdThreadId: optional(params.createdThreadId),
    outcome: params.outcome,
  });
}
