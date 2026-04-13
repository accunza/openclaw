/**
 * Maximum share of the context window a single tool result should occupy.
 * Keep this policy centralized so preflight/recovery paths stay aligned.
 */
export const MAX_TOOL_RESULT_CONTEXT_SHARE = 0.3;

/**
 * Default hard cap for a single live tool result text block.
 */
export const DEFAULT_MAX_LIVE_TOOL_RESULT_CHARS = 40_000;

/**
 * Calculate the maximum allowed characters for a single tool result
 * based on model context window tokens.
 */
export function calculateMaxToolResultChars(contextWindowTokens: number): number {
  const maxTokens = Math.floor(contextWindowTokens * MAX_TOOL_RESULT_CONTEXT_SHARE);
  // Rough conversion: ~4 chars per token on average
  const maxChars = maxTokens * 4;
  return Math.min(maxChars, DEFAULT_MAX_LIVE_TOOL_RESULT_CHARS);
}
