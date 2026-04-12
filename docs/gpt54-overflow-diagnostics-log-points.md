# GPT-5.4 Overflow Diagnostics Log Points

1. `pre_prompt_context_check` (`run/attempt.ts`): captures pre-prompt context estimate, context budget, and tool-result contribution before submitting the turn.
2. `pre_prompt_overflow_precheck` (`run/attempt.ts`): captures preemptive overflow checks and decision path (`truncate_tool_results_only`, `compact_only`, `compact_then_truncate`) plus trigger reason.
3. `tool_result_context_growth` (`tool-result-context-guard.ts`): captures before/after tool-result and context-size estimates when truncation is applied in `transformContext`.
4. `tool_result_preemptive_overflow` (`tool-result-context-guard.ts`): captures threshold breach details when context guard throws preemptive overflow.
5. `replay_sanitization` (`replay-history.ts`): captures replay/sanitization deltas before and after OpenAI/Codex-compatible cleanup.
6. `compaction_attempt` (`compact.ts`): captures compaction start/end/error attempt records including decision path and token/message deltas.
7. `provider_payload_prepared` (`stream-payload-utils.ts`): captures final provider payload shape metadata (keys/counts only, no raw content).
