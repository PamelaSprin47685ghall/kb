import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { EventEmitter } from "node:events";

// ── Capture instances & arguments ───────────────────────────────────

let capturedExecutorOpts: Record<string, unknown> | undefined;

// Minimal mock store backed by EventEmitter so `store.on` works
function makeMockStore() {
  const emitter = new EventEmitter();
  return {
    init: vi.fn().mockResolvedValue(undefined),
    watch: vi.fn().mockResolvedValue(undefined),
    stopWatching: vi.fn(),
    getSettings: vi.fn().mockResolvedValue({
      maxConcurrent: 1,
      maxWorktrees: 2,
      autoMerge: false,
      pollIntervalMs: 60_000,
    }),
    listTasks: vi.fn().mockResolvedValue([]),
    on: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
      emitter.on(event, handler);
    }),
    emit: emitter.emit.bind(emitter),
  };
}

// ── Mock @hai/core ──────────────────────────────────────────────────

vi.mock("@hai/core", () => ({
  TaskStore: vi.fn().mockImplementation(() => makeMockStore()),
}));

// ── Mock @hai/dashboard ─────────────────────────────────────────────

const mockListen = vi.fn();
vi.mock("@hai/dashboard", () => ({
  createServer: vi.fn(() => ({ listen: mockListen })),
}));

// ── Mock @hai/engine ────────────────────────────────────────────────

// We need the real WorktreePool class so we can assert `instanceof`.
const { WorktreePool } = await import("@hai/engine");

vi.mock("@hai/engine", async (importOriginal) => {
  const original = await importOriginal<typeof import("@hai/engine")>();
  return {
    ...original,
    // Keep real WorktreePool & AgentSemaphore
    WorktreePool: original.WorktreePool,
    AgentSemaphore: original.AgentSemaphore,
    // Stub heavy classes/functions
    TriageProcessor: vi.fn().mockImplementation(() => ({
      start: vi.fn(),
      stop: vi.fn(),
    })),
    TaskExecutor: vi.fn().mockImplementation((_store: unknown, _cwd: unknown, opts: unknown) => {
      capturedExecutorOpts = opts as Record<string, unknown>;
      return {
        resumeOrphaned: vi.fn().mockResolvedValue(undefined),
      };
    }),
    Scheduler: vi.fn().mockImplementation(() => ({
      start: vi.fn(),
      stop: vi.fn(),
    })),
    aiMergeTask: vi.fn().mockImplementation(() => Promise.resolve({ merged: true })),
  };
});

// ── Import module under test (after mocks) ──────────────────────────

const { runDashboard } = await import("./dashboard.js");

// ── Tests ───────────────────────────────────────────────────────────

describe("runDashboard — WorktreePool wiring", () => {
  beforeEach(async () => {
    capturedExecutorOpts = undefined;
    vi.clearAllMocks();
    // Re-set TaskStore mock (clearAllMocks wipes implementations)
    const { TaskStore } = await import("@hai/core");
    (TaskStore as ReturnType<typeof vi.fn>).mockImplementation(() => makeMockStore());
    // Re-set engine mocks
    const engine = await import("@hai/engine");
    (engine.aiMergeTask as ReturnType<typeof vi.fn>).mockImplementation(() =>
      Promise.resolve({ merged: true }),
    );
    (engine.TaskExecutor as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      (_store: unknown, _cwd: unknown, opts: unknown) => {
        capturedExecutorOpts = opts as Record<string, unknown>;
        return { resumeOrphaned: vi.fn().mockResolvedValue(undefined) };
      },
    );
  });

  it("passes a WorktreePool instance to TaskExecutor", async () => {
    await runDashboard(0, { engine: true, open: false });

    expect(capturedExecutorOpts).toBeDefined();
    expect(capturedExecutorOpts!.pool).toBeInstanceOf(WorktreePool);
  });

  it("passes a WorktreePool instance to aiMergeTask via rawMerge", async () => {
    const { aiMergeTask } = await import("@hai/engine");
    const { createServer } = await import("@hai/dashboard");

    await runDashboard(0, { engine: false, open: false });

    // rawMerge is exposed as the onMerge callback wired into createServer.
    const createServerCall = (createServer as ReturnType<typeof vi.fn>).mock.calls[0];
    const serverOpts = createServerCall[1] as { onMerge: (taskId: string) => Promise<unknown> };

    // Invoke the merge handler
    await serverOpts.onMerge("HAI-TEST");

    expect(aiMergeTask).toHaveBeenCalled();
    const mergeCallOpts = (aiMergeTask as ReturnType<typeof vi.fn>).mock.calls[0][3];
    expect(mergeCallOpts.pool).toBeInstanceOf(WorktreePool);
  });

  it("shares the same WorktreePool instance between executor and merger", async () => {
    const { aiMergeTask } = await import("@hai/engine");
    const { createServer } = await import("@hai/dashboard");

    await runDashboard(0, { engine: true, open: false });

    // Trigger merger via onMerge
    const createServerCall = (createServer as ReturnType<typeof vi.fn>).mock.calls[0];
    const serverOpts = createServerCall[1] as { onMerge: (taskId: string) => Promise<unknown> };
    await serverOpts.onMerge("HAI-TEST");

    const executorPool = capturedExecutorOpts!.pool;
    const mergerPool = (aiMergeTask as ReturnType<typeof vi.fn>).mock.calls[0][3].pool;

    expect(executorPool).toBeInstanceOf(WorktreePool);
    expect(mergerPool).toBeInstanceOf(WorktreePool);
    expect(executorPool).toBe(mergerPool);
  });
});
