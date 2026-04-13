import type { AgentMessage } from "@mariozechner/pi-agent-core";
import { log } from "./logger.js";
import { calculateMaxToolResultChars } from "./tool-result-budget-policy.js";
import {
  CHARS_PER_TOKEN_ESTIMATE,
  type MessageCharEstimateCache,
  createMessageCharEstimateCache,
  estimateContextChars,
  estimateMessageCharsCached,
  getToolResultText,
  invalidateMessageCharsCacheEntry,
  isToolResultMessage,
} from "./tool-result-char-estimator.js";

const PREEMPTIVE_OVERFLOW_RATIO = 0.9;

export const CONTEXT_LIMIT_TRUNCATION_NOTICE = "more characters truncated";
export const PREEMPTIVE_CONTEXT_OVERFLOW_MESSAGE =
  "Context overflow: estimated context size exceeds safe threshold during tool loop.";
const TOOL_RESULT_ESTIMATE_TO_TEXT_RATIO = 1;

type GuardableTransformContext = (
  messages: AgentMessage[],
  signal: AbortSignal,
) => AgentMessage[] | Promise<AgentMessage[]>;

type GuardableAgent = object;

type GuardableAgentRecord = {
  transformContext?: GuardableTransformContext;
};

export function formatContextLimitTruncationNotice(truncatedChars: number): string {
  return `[... ${Math.max(1, Math.floor(truncatedChars))} ${CONTEXT_LIMIT_TRUNCATION_NOTICE}]`;
}

function truncateTextToBudget(text: string, maxChars: number): string {
  if (text.length <= maxChars) {
    return text;
  }

  if (maxChars <= 0) {
    return formatContextLimitTruncationNotice(text.length);
  }

  let bodyBudget = maxChars;
  for (let i = 0; i < 4; i += 1) {
    const estimatedSuffix = formatContextLimitTruncationNotice(
      Math.max(1, text.length - bodyBudget),
    );
    bodyBudget = Math.max(0, maxChars - estimatedSuffix.length);
  }

  let cutPoint = bodyBudget;
  const newline = text.lastIndexOf("\n", cutPoint);
  if (newline > bodyBudget * 0.7) {
    cutPoint = newline;
  }

  const omittedChars = text.length - cutPoint;
  return text.slice(0, cutPoint) + formatContextLimitTruncationNotice(omittedChars);
}

function replaceToolResultText(msg: AgentMessage, text: string): AgentMessage {
  const content = (msg as { content?: unknown }).content;
  const replacementContent =
    typeof content === "string" || content === undefined ? text : [{ type: "text", text }];

  const sourceRecord = msg as unknown as Record<string, unknown>;
  const { details: _details, ...rest } = sourceRecord;
  return {
    ...rest,
    content: replacementContent,
  } as AgentMessage;
}

function estimateBudgetToTextBudget(maxChars: number): number {
  return Math.max(0, Math.floor(maxChars / TOOL_RESULT_ESTIMATE_TO_TEXT_RATIO));
}

function truncateToolResultToChars(
  msg: AgentMessage,
  maxChars: number,
  cache: MessageCharEstimateCache,
): AgentMessage {
  if (!isToolResultMessage(msg)) {
    return msg;
  }

  const rawText = getToolResultText(msg);
  const estimatedChars = estimateMessageCharsCached(msg, cache);

  if (rawText && rawText.length <= maxChars && estimatedChars <= maxChars) {
    return msg;
  }

  if (rawText && rawText.length <= maxChars) {
    const omittedChars = Math.max(
      1,
      estimateBudgetToTextBudget(Math.max(estimatedChars - maxChars, 1)),
    );
    return replaceToolResultText(
      msg,
      `${rawText}${formatContextLimitTruncationNotice(omittedChars)}`,
    );
  }

  if (!rawText && estimatedChars <= maxChars) {
    return msg;
  }

  if (!rawText) {
    const omittedChars = Math.max(
      1,
      estimateBudgetToTextBudget(Math.max(estimatedChars - maxChars, 1)),
    );
    return replaceToolResultText(msg, formatContextLimitTruncationNotice(omittedChars));
  }

  const textBudget = estimateBudgetToTextBudget(maxChars);
  if (textBudget <= 0) {
    return replaceToolResultText(msg, formatContextLimitTruncationNotice(rawText.length));
  }

  if (rawText.length <= textBudget) {
    return replaceToolResultText(msg, rawText);
  }

  const truncatedText = truncateTextToBudget(rawText, textBudget);
  return replaceToolResultText(msg, truncatedText);
}

function cloneMessagesForGuard(messages: AgentMessage[]): AgentMessage[] {
  return messages.map(
    (msg) => ({ ...(msg as unknown as Record<string, unknown>) }) as unknown as AgentMessage,
  );
}

function getMinAggregateToolResultChars(): number {
  return formatContextLimitTruncationNotice(1).length;
}

function toolResultsNeedTruncation(params: {
  messages: AgentMessage[];
  maxSingleToolResultChars: number;
  aggregateToolResultChars: number;
}): boolean {
  const { messages, maxSingleToolResultChars, aggregateToolResultChars } = params;
  const estimateCache = createMessageCharEstimateCache();
  let totalToolResultChars = 0;

  for (const message of messages) {
    if (!isToolResultMessage(message)) {
      continue;
    }
    const rawText = getToolResultText(message);
    const rawTextLength = rawText?.length ?? 0;
    totalToolResultChars += rawTextLength;
    if (rawTextLength > maxSingleToolResultChars) {
      return true;
    }
    if (estimateMessageCharsCached(message, estimateCache) > maxSingleToolResultChars) {
      return true;
    }
  }

  return totalToolResultChars > aggregateToolResultChars;
}

function exceedsPreemptiveOverflowThreshold(params: {
  messages: AgentMessage[];
  maxContextChars: number;
}): boolean {
  const estimateCache = createMessageCharEstimateCache();
  return estimateContextChars(params.messages, estimateCache) > params.maxContextChars;
}

function applyMessageMutationInPlace(
  target: AgentMessage,
  source: AgentMessage,
  cache?: MessageCharEstimateCache,
): void {
  if (target === source) {
    return;
  }

  const targetRecord = target as unknown as Record<string, unknown>;
  const sourceRecord = source as unknown as Record<string, unknown>;
  for (const key of Object.keys(targetRecord)) {
    if (!(key in sourceRecord)) {
      delete targetRecord[key];
    }
  }
  Object.assign(targetRecord, sourceRecord);
  if (cache) {
    invalidateMessageCharsCacheEntry(cache, target);
  }
}

function enforceToolResultLimitInPlace(params: {
  messages: AgentMessage[];
  maxSingleToolResultChars: number;
  aggregateToolResultChars: number;
}): void {
  const { messages, maxSingleToolResultChars, aggregateToolResultChars } = params;
  const estimateCache = createMessageCharEstimateCache();
  const toolResults: Array<{ index: number; message: AgentMessage; textLength: number }> = [];
  let totalToolResultChars = 0;

  for (const [index, message] of messages.entries()) {
    if (!isToolResultMessage(message)) {
      continue;
    }
    const truncated = truncateToolResultToChars(message, maxSingleToolResultChars, estimateCache);
    applyMessageMutationInPlace(message, truncated, estimateCache);
    const textLength = getToolResultText(message)?.length ?? 0;
    totalToolResultChars += textLength;
    toolResults.push({ index, message, textLength });
  }

  if (toolResults.length < 2 || totalToolResultChars <= aggregateToolResultChars) {
    return;
  }

  let remainingReduction = totalToolResultChars - aggregateToolResultChars;
  const minAggregateToolResultChars = getMinAggregateToolResultChars();

  for (const candidate of toolResults.toSorted((a, b) => b.index - a.index)) {
    if (remainingReduction <= 0) {
      break;
    }

    const currentLength = getToolResultText(candidate.message)?.length ?? 0;
    const reducibleChars = Math.max(0, currentLength - minAggregateToolResultChars);
    if (reducibleChars <= 0) {
      continue;
    }

    const requestedReduction = Math.min(reducibleChars, remainingReduction);
    const targetChars = Math.max(minAggregateToolResultChars, currentLength - requestedReduction);
    const truncated = truncateToolResultToChars(candidate.message, targetChars, estimateCache);
    const newLength = getToolResultText(truncated)?.length ?? 0;
    const actualReduction = Math.max(0, currentLength - newLength);
    if (actualReduction <= 0) {
      continue;
    }

    applyMessageMutationInPlace(candidate.message, truncated, estimateCache);
    remainingReduction -= actualReduction;
  }
}

function summarizeToolResultGrowth(messages: AgentMessage[]): {
  toolResultCount: number;
  toolResultChars: number;
  largestToolResultChars: number;
  estimatedContextChars: number;
} {
  const estimateCache = createMessageCharEstimateCache();
  let toolResultCount = 0;
  let toolResultChars = 0;
  let largestToolResultChars = 0;
  for (const msg of messages) {
    if (!isToolResultMessage(msg)) {
      continue;
    }
    toolResultCount += 1;
    const size = getToolResultText(msg)?.length ?? 0;
    toolResultChars += size;
    if (size > largestToolResultChars) {
      largestToolResultChars = size;
    }
  }
  return {
    toolResultCount,
    toolResultChars,
    largestToolResultChars,
    estimatedContextChars: estimateContextChars(messages, estimateCache),
  };
}

export function installToolResultContextGuard(params: {
  agent: GuardableAgent;
  contextWindowTokens: number;
}): () => void {
  const contextWindowTokens = Math.max(1, Math.floor(params.contextWindowTokens));
  const maxContextChars = Math.max(
    1_024,
    Math.floor(contextWindowTokens * CHARS_PER_TOKEN_ESTIMATE * PREEMPTIVE_OVERFLOW_RATIO),
  );
  const maxSingleToolResultChars = calculateMaxToolResultChars(contextWindowTokens);
  const aggregateToolResultChars = maxSingleToolResultChars;

  // Agent.transformContext is private in pi-coding-agent, so access it via a
  // narrow runtime view to keep callsites type-safe while preserving behavior.
  const mutableAgent = params.agent as GuardableAgentRecord;
  const originalTransformContext = mutableAgent.transformContext;

  mutableAgent.transformContext = (async (messages: AgentMessage[], signal: AbortSignal) => {
    const transformed = originalTransformContext
      ? await originalTransformContext.call(mutableAgent, messages, signal)
      : messages;

    const sourceMessages = Array.isArray(transformed) ? transformed : messages;
    const preSummary = summarizeToolResultGrowth(sourceMessages);
    const contextMessages = toolResultsNeedTruncation({
      messages: sourceMessages,
      maxSingleToolResultChars,
      aggregateToolResultChars,
    })
      ? cloneMessagesForGuard(sourceMessages)
      : sourceMessages;
    if (contextMessages !== sourceMessages) {
      enforceToolResultLimitInPlace({
        messages: contextMessages,
        maxSingleToolResultChars,
        aggregateToolResultChars,
      });
      {
        const postSummary = summarizeToolResultGrowth(contextMessages);
        log.info(
          `[overflow-diag] ${JSON.stringify({
            event: "tool_result_context_growth",
            toolResultCountBefore: preSummary.toolResultCount,
            toolResultCountAfter: postSummary.toolResultCount,
            toolResultCharsBefore: preSummary.toolResultChars,
            toolResultCharsAfter: postSummary.toolResultChars,
            largestToolResultCharsBefore: preSummary.largestToolResultChars,
            largestToolResultCharsAfter: postSummary.largestToolResultChars,
            estimatedContextCharsBefore: preSummary.estimatedContextChars,
            estimatedContextCharsAfter: postSummary.estimatedContextChars,
            maxSingleToolResultChars,
            aggregateToolResultChars,
            maxContextChars,
          })}`,
        );
      }
    }
    if (
      exceedsPreemptiveOverflowThreshold({
        messages: contextMessages,
        maxContextChars,
      })
    ) {
      {
        const thresholdSummary = summarizeToolResultGrowth(contextMessages);
        log.warn(
          `[overflow-diag] ${JSON.stringify({
            event: "tool_result_preemptive_overflow",
            overflowTriggerReason: "preemptive_context_threshold_exceeded",
            estimatedContextChars: thresholdSummary.estimatedContextChars,
            maxContextChars,
            toolResultCount: thresholdSummary.toolResultCount,
            toolResultChars: thresholdSummary.toolResultChars,
            largestToolResultChars: thresholdSummary.largestToolResultChars,
            maxSingleToolResultChars,
            aggregateToolResultChars,
          })}`,
        );
      }
      throw new Error(PREEMPTIVE_CONTEXT_OVERFLOW_MESSAGE);
    }

    return contextMessages;
  }) as GuardableTransformContext;

  return () => {
    mutableAgent.transformContext = originalTransformContext;
  };
}
