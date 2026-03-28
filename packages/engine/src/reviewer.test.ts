import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./pi.js", () => ({
  createKbAgent: vi.fn(),
}));

import { reviewStep } from "./reviewer.js";
import { createKbAgent } from "./pi.js";

const mockedCreateHaiAgent = vi.mocked(createKbAgent);

function createMockSession(reviewText: string) {
  return {
    session: {
      prompt: vi.fn().mockResolvedValue(undefined),
      subscribe: vi.fn().mockImplementation((cb: any) => {
        // Simulate the reviewer producing text
        cb({
          type: "message_update",
          assistantMessageEvent: { type: "text_delta", delta: reviewText },
        });
      }),
      dispose: vi.fn(),
    },
  } as any;
}

describe("reviewStep — model settings threading", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("passes defaultProvider and defaultModelId to createKbAgent when provided", async () => {
    mockedCreateHaiAgent.mockResolvedValue(
      createMockSession("### Verdict: APPROVE\n### Summary\nLooks good."),
    );

    await reviewStep(
      "/tmp/worktree", "KB-100", 1, "Test Step", "plan", "# prompt",
      undefined,
      {
        defaultProvider: "anthropic",
        defaultModelId: "claude-sonnet-4-5",
      },
    );

    expect(mockedCreateHaiAgent).toHaveBeenCalledTimes(1);
    const opts = mockedCreateHaiAgent.mock.calls[0][0];
    expect(opts.defaultProvider).toBe("anthropic");
    expect(opts.defaultModelId).toBe("claude-sonnet-4-5");
  });

  it("does not set model fields when ReviewOptions omits them", async () => {
    mockedCreateHaiAgent.mockResolvedValue(
      createMockSession("### Verdict: APPROVE\n### Summary\nAll good."),
    );

    await reviewStep(
      "/tmp/worktree", "KB-100", 1, "Test Step", "plan", "# prompt",
      undefined,
      {},
    );

    expect(mockedCreateHaiAgent).toHaveBeenCalledTimes(1);
    const opts = mockedCreateHaiAgent.mock.calls[0][0];
    expect(opts.defaultProvider).toBeUndefined();
    expect(opts.defaultModelId).toBeUndefined();
  });

  it("extracts APPROVE verdict correctly", async () => {
    mockedCreateHaiAgent.mockResolvedValue(
      createMockSession("### Verdict: APPROVE\n### Summary\nLooks good."),
    );

    const result = await reviewStep(
      "/tmp/worktree", "KB-100", 1, "Test Step", "plan", "# prompt",
    );

    expect(result.verdict).toBe("APPROVE");
  });
});

describe("reviewStep — exhausted-retry error detection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("throws when session.prompt() resolves with exhausted-retry error on state.error", async () => {
    // session.prompt() resolves normally, but session.state.error is set
    const mockSession = {
      prompt: vi.fn().mockResolvedValue(undefined),
      subscribe: vi.fn(),
      dispose: vi.fn(),
      state: { error: "rate_limit_error: Rate limit exceeded" },
    };
    mockedCreateHaiAgent.mockResolvedValue({ session: mockSession } as any);

    await expect(
      reviewStep("/tmp/worktree", "KB-100", 1, "Test Step", "code", "# prompt"),
    ).rejects.toThrow("rate_limit_error: Rate limit exceeded");
  });

  it("disposes session in finally block despite the error", async () => {
    const disposeFn = vi.fn();
    const mockSession = {
      prompt: vi.fn().mockResolvedValue(undefined),
      subscribe: vi.fn(),
      dispose: disposeFn,
      state: { error: "rate_limit_error: Rate limit exceeded" },
    };
    mockedCreateHaiAgent.mockResolvedValue({ session: mockSession } as any);

    await expect(
      reviewStep("/tmp/worktree", "KB-100", 1, "Test Step", "code", "# prompt"),
    ).rejects.toThrow();

    // Session should be disposed in the finally block
    expect(disposeFn).toHaveBeenCalled();
  });

  it("does not throw when session completes without error", async () => {
    mockedCreateHaiAgent.mockResolvedValue(
      createMockSession("### Verdict: APPROVE\n### Summary\nLooks good."),
    );

    const result = await reviewStep(
      "/tmp/worktree", "KB-100", 1, "Test Step", "plan", "# prompt",
    );

    expect(result.verdict).toBe("APPROVE");
  });
});
