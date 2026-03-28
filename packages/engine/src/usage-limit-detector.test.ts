import { describe, it, expect, vi, beforeEach } from "vitest";
import { isUsageLimitError, UsageLimitPauser } from "./usage-limit-detector.js";

// ── isUsageLimitError classification tests ───────────────────────────

describe("isUsageLimitError", () => {
  describe("should match usage-limit errors", () => {
    const usageLimitMessages = [
      // Anthropic overloaded
      "overloaded_error: Overloaded",
      "API is overloaded",
      // Rate limiting
      "rate_limit_error: Rate limit exceeded",
      "rate limit exceeded",
      "Rate Limit Reached",
      "Too many requests",
      "too many requests, please retry after 60s",
      // HTTP status codes
      "Request failed with status 429",
      "HTTP 429: Too Many Requests",
      "529 overloaded",
      "Status 529",
      // Quota / billing
      "quota exceeded for this billing period",
      "Quota limit reached",
      "billing account is inactive",
      "Billing issue detected",
      "insufficient credit balance",
      "Insufficient credits",
      "credit balance too low",
    ];

    for (const msg of usageLimitMessages) {
      it(`matches: "${msg}"`, () => {
        expect(isUsageLimitError(msg)).toBe(true);
      });
    }
  });

  describe("should NOT match transient server errors", () => {
    const transientMessages = [
      "Internal Server Error",
      "Request failed with status 500",
      "HTTP 502: Bad Gateway",
      "503 Service Unavailable",
      "504 Gateway Timeout",
      "connection refused",
      "Connection reset by peer",
      "ECONNREFUSED",
      "timeout exceeded",
      "request timed out",
      "socket hang up",
      "network error",
      "ETIMEDOUT",
      "DNS lookup failed",
      "getaddrinfo ENOTFOUND",
    ];

    for (const msg of transientMessages) {
      it(`does not match: "${msg}"`, () => {
        expect(isUsageLimitError(msg)).toBe(false);
      });
    }
  });

  it("returns false for empty string", () => {
    expect(isUsageLimitError("")).toBe(false);
  });

  it("returns false for generic error messages", () => {
    expect(isUsageLimitError("Something went wrong")).toBe(false);
    expect(isUsageLimitError("Unexpected token in JSON")).toBe(false);
  });
});

// ── UsageLimitPauser tests ───────────────────────────────────────────

function createMockStore(globalPause = false) {
  return {
    getSettings: vi.fn().mockResolvedValue({ globalPause }),
    updateSettings: vi.fn().mockResolvedValue({ globalPause: true }),
    logEntry: vi.fn().mockResolvedValue(undefined),
  } as any;
}

describe("UsageLimitPauser", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls store.updateSettings({ globalPause: true }) on usage limit hit", async () => {
    const store = createMockStore();
    const pauser = new UsageLimitPauser(store);

    await pauser.onUsageLimitHit("executor", "KB-001", "rate_limit_error: Rate limit exceeded");

    expect(store.updateSettings).toHaveBeenCalledWith({ globalPause: true });
  });

  it("logs the triggering error on the task via store.logEntry", async () => {
    const store = createMockStore();
    const pauser = new UsageLimitPauser(store);

    await pauser.onUsageLimitHit("triage", "KB-002", "overloaded_error");

    expect(store.logEntry).toHaveBeenCalledWith(
      "KB-002",
      "Usage limit detected (triage): overloaded_error",
    );
  });

  it("is idempotent — calling multiple times only triggers one pause", async () => {
    const store = createMockStore();
    // After first call, globalPause will be true
    store.getSettings.mockResolvedValue({ globalPause: true });

    const pauser = new UsageLimitPauser(store);

    await pauser.onUsageLimitHit("executor", "KB-001", "rate limit");
    await pauser.onUsageLimitHit("triage", "KB-002", "rate limit");
    await pauser.onUsageLimitHit("merger", "KB-003", "rate limit");

    // updateSettings should only be called once
    expect(store.updateSettings).toHaveBeenCalledTimes(1);
  });

  it("re-triggers pause if globalPause was externally reset to false", async () => {
    const store = createMockStore();
    const pauser = new UsageLimitPauser(store);

    // First hit — triggers pause
    store.getSettings.mockResolvedValue({ globalPause: true });
    await pauser.onUsageLimitHit("executor", "KB-001", "rate limit");
    expect(store.updateSettings).toHaveBeenCalledTimes(1);

    // External reset: globalPause set to false
    store.getSettings.mockResolvedValue({ globalPause: false });

    // Second hit — should trigger again since it was reset
    await pauser.onUsageLimitHit("executor", "KB-004", "rate limit again");
    expect(store.updateSettings).toHaveBeenCalledTimes(2);
  });

  it("includes agent type in the log entry", async () => {
    const store = createMockStore();
    const pauser = new UsageLimitPauser(store);

    await pauser.onUsageLimitHit("merger", "KB-005", "quota exceeded");

    expect(store.logEntry).toHaveBeenCalledWith(
      "KB-005",
      expect.stringContaining("merger"),
    );
  });
});
