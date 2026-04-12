import type { StreamFn } from "@mariozechner/pi-agent-core";
import { log } from "./logger.js";

function summarizeProviderPayload(payload: Record<string, unknown>): {
  topLevelKeys: string[];
  messageCount?: number;
  inputCount?: number;
  toolCount?: number;
} {
  const topLevelKeys = Object.keys(payload).toSorted().slice(0, 24);
  const messages = Array.isArray(payload.messages) ? payload.messages : undefined;
  const input = Array.isArray(payload.input) ? payload.input : undefined;
  const tools = Array.isArray(payload.tools) ? payload.tools : undefined;
  return {
    topLevelKeys,
    messageCount: messages?.length,
    inputCount: input?.length,
    toolCount: tools?.length,
  };
}

export function streamWithPayloadPatch(
  underlying: StreamFn,
  model: Parameters<StreamFn>[0],
  context: Parameters<StreamFn>[1],
  options: Parameters<StreamFn>[2],
  patchPayload: (payload: Record<string, unknown>) => void,
): ReturnType<StreamFn> {
  const originalOnPayload = options?.onPayload;
  return underlying(model, context, {
    ...options,
    onPayload: (payload) => {
      if (payload && typeof payload === "object") {
        const payloadObj = payload as Record<string, unknown>;
        patchPayload(payloadObj);
        if (log.isEnabled("debug")) {
          const summary = summarizeProviderPayload(payloadObj);
          log.debug(
            "[overflow-diag] " +
              JSON.stringify({
                event: "provider_payload_prepared",
                provider: (model as { provider?: unknown }).provider,
                model: (model as { id?: unknown }).id,
                modelApi: (model as { api?: unknown }).api,
                ...summary,
              }),
          );
        }
      }
      return originalOnPayload?.(payload, model);
    },
  });
}
