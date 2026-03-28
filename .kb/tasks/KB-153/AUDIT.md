# KB-153 Audit: Auto-Pause on Rate Limit When pi-coding-agent Exhausts Retries

**Date:** 2026-03-28
**Author:** KB Engine (automated audit)

## 1. pi-coding-agent Retry Flow

### How Retries Work

When `session.prompt()` is called, it ultimately calls `this.agent.prompt(messages)` followed by `await this.waitForRetry()`. The retry mechanism works as follows:

1. **Error Detection (`_isRetryableError`):** On `agent_end`, the session checks the last assistant message. If `stopReason === "error"` and `errorMessage` matches retryable patterns (overloaded, rate limit, 429, 500, 502, 503, 504, etc.), it's considered retryable.

2. **Retry Handling (`_handleRetryableError`):** Increments `_retryAttempt` counter. If `_retryAttempt > settings.maxRetries` (currently 3), it:
   - Emits `auto_retry_end` with `{ success: false, finalError: message.errorMessage }`
   - Resets `_retryAttempt = 0`
   - Calls `_resolveRetry()` to resolve the pending promise
   - Returns `false` (did not retry)

3. **Resolution (`_resolveRetry`):** Resolves the `_retryPromise` that `waitForRetry()` is awaiting.

4. **State Propagation:** At `turn_end`, the agent core sets `this._state.error = event.message.errorMessage` when the assistant message has an error. This persists on `session.state.error`.

### Key Behavior: `prompt()` Resolves Without Throwing

After retries are exhausted:
```
session.prompt(message)
  → this.agent.prompt(messages)         // LLM call fails
  → agent_end event fires
  → _handleRetryableError() returns false (max retries exceeded)
  → _resolveRetry() resolves the retry promise
  → await this.waitForRetry() completes
  → prompt() returns normally (no exception)
```

The error is available on `session.state.error` (e.g., `"rate_limit_error: Rate limit exceeded"`), but **no exception is thrown**.

### `auto_retry_end` Event

pi-coding-agent emits `auto_retry_end` with `{ success: false, attempt: N, finalError: "..." }` when retries are exhausted. **No kb engine component subscribes to this event.**

## 2. Gap Analysis by Agent Type

### 2.1 Executor (`packages/engine/src/executor.ts`)

**Current flow:**
```typescript
// In agentWork closure:
await session.prompt(agentPrompt);  // ← resolves normally after exhausted retries

// These checks run, but session.state.error is set:
if (this.depAborted.has(task.id)) { ... }  // false
if (this.pausedAborted.has(task.id)) { ... }  // false
if (taskDone) { ... }  // false (agent didn't call task_done)
else { ... }  // moves to in-review with incomplete work!
```

**Consequence:** Task is moved to `in-review` with incomplete work, or with a log message "Agent finished without calling task_done — moved to in-review for inspection". The `catch` block containing `isUsageLimitError` never fires, so `UsageLimitPauser.onUsageLimitHit()` is never called.

### 2.2 Triage (`packages/engine/src/triage.ts`)

**Current flow:**
```typescript
// In specifyTask():
await session.prompt(agentPrompt, ...);  // ← resolves normally after exhausted retries

// Duplicate check runs on possibly empty/incomplete PROMPT.md
const written = await readFile(join(this.rootDir, promptPath), "utf-8").catch(() => "");
// ... proceeds to moveTask(task.id, "todo") with broken spec
```

**Consequence:** A partially-written or empty PROMPT.md is treated as a valid specification. The task is moved from `triage` to `todo` with an incomplete/broken spec. The `catch` block containing `isUsageLimitError` never fires.

### 2.3 Merger (`packages/engine/src/merger.ts`)

**Current flow:**
```typescript
// In aiMergeTask():
await session.prompt(prompt);  // ← resolves normally after exhausted retries

// Staged-changes check runs:
const staged = execSync("git diff --cached --quiet 2>&1; echo $?", ...);
if (staged !== "0") {
  // Fallback commit with possibly dirty/incomplete state!
  execSync(`git commit -m "feat(${taskId}): merge ${branch}" -m "${escapedLog}"`, ...);
}
result.merged = true;  // Reports success even though the merge was incomplete
```

**Consequence:** If the merge had conflicts and the agent hit a rate limit mid-resolution, the merge proceeds with a fallback commit that may contain conflict markers or incomplete resolution. The `catch` block containing `isUsageLimitError` never fires.

### 2.4 Reviewer (`packages/engine/src/reviewer.ts`)

**Current flow:**
```typescript
// In reviewStep():
await session.prompt(request);  // ← resolves normally after exhausted retries

// reviewText is empty (agent didn't produce output)
const verdict = extractVerdict(reviewText);  // Returns "UNAVAILABLE"
```

**Consequence:** The reviewer returns an `UNAVAILABLE` verdict from empty review text. The executor's `createReviewStepTool` catch block would handle a thrown error, but since no error is thrown, the review silently fails. **Additionally, the reviewer has NO usage-limit handling at all** — even if an error were thrown, there's no `isUsageLimitError` check in `reviewStep()`.

## 3. Systemic Impact

When any agent hits a rate limit and retries are exhausted:

1. **No global pause triggered** — `UsageLimitPauser.onUsageLimitHit()` is never called
2. **Engine keeps launching new agents** — The scheduler continues dispatching tasks to agents that will also hit the same rate limit
3. **API credits wasted** — Each new agent makes 1 + maxRetries = 4 API calls before silently failing
4. **Tasks in wrong columns** — Executor moves incomplete tasks to `in-review`, triage moves broken specs to `todo`, merger may commit conflict markers

## 4. Fix Approach

### Strategy: Post-Prompt Error Check

Add a utility function `checkSessionError(session)` that:
1. Reads `session.state.error`
2. If set and non-empty, throws `new Error(session.state.error)`

Call this function immediately after every `await session.prompt(...)` in all four agent types. This re-raises the error that pi-coding-agent swallowed, routing it into the existing `catch` blocks where `isUsageLimitError` already triggers `UsageLimitPauser`.

### Why This Approach

- **Minimal change** — One new helper function, one line added per agent
- **Leverages existing patterns** — All four agents already have catch blocks with `isUsageLimitError` checks (except reviewer, which needs one added)
- **No pi-coding-agent modifications** — Works with the library's current behavior
- **Forward-compatible** — If pi-coding-agent later changes to throw on exhausted retries, the check becomes a no-op (session.state.error would be undefined since the error was thrown)

### Per-Agent Fix Details

| Agent    | Location                                    | Fix                                                        |
|----------|---------------------------------------------|------------------------------------------------------------|
| Executor | `agentWork` closure after `session.prompt()` | `checkSessionError(session)` before dep/pause/done checks  |
| Triage   | `specifyTask()` after `session.prompt()`     | `checkSessionError(session)` before duplicate check         |
| Merger   | `aiMergeTask()` after `session.prompt()`     | `checkSessionError(session)` before staged-changes check    |
| Reviewer | `reviewStep()` after `session.prompt()`      | `checkSessionError(session)` inside try block; caller handles |
