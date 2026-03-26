import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Scheduler, pathsOverlap } from "./scheduler.js";
import type { Task, Column } from "@hai/core";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTask(
  overrides: Partial<Task> & { id: string; column: Column },
): Task {
  return {
    title: overrides.id,
    description: "",
    dependencies: [],
    steps: [],
    currentStep: 0,
    log: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

/** Map of taskId → file scope paths, used by the mock store. */
type ScopeMap = Record<string, string[]>;

function createMockStore(tasks: Task[], scopes: ScopeMap = {}) {
  return {
    listTasks: vi.fn().mockResolvedValue(tasks),
    getSettings: vi.fn().mockResolvedValue({
      maxConcurrent: 2,
      maxWorktrees: 4,
      pollIntervalMs: 15_000,
      groupOverlappingFiles: true,
      autoMerge: false,
    }),
    updateTask: vi.fn().mockResolvedValue({}),
    moveTask: vi.fn().mockResolvedValue({}),
    parseFileScopeFromPrompt: vi.fn().mockImplementation(async (id: string) => {
      return scopes[id] ?? [];
    }),
  } as any;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Scheduler", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // -----------------------------------------------------------------------
  // Basic scheduling
  // -----------------------------------------------------------------------

  it("starts a single todo task with met dependencies", async () => {
    const task = makeTask({ id: "HAI-001", column: "todo" });
    const store = createMockStore([task]);
    const onSchedule = vi.fn();
    const scheduler = new Scheduler(store, { onSchedule });

    scheduler.start();
    // schedule() is called synchronously in start() — await the microtask
    await vi.advanceTimersByTimeAsync(0);
    scheduler.stop();

    expect(store.moveTask).toHaveBeenCalledWith("HAI-001", "in-progress");
    expect(onSchedule).toHaveBeenCalledWith(task);
  });

  // -----------------------------------------------------------------------
  // Dependency blocking
  // -----------------------------------------------------------------------

  it("does NOT start a todo task with unmet dependencies", async () => {
    const depTask = makeTask({ id: "HAI-001", column: "in-progress" });
    const blocked = makeTask({
      id: "HAI-002",
      column: "todo",
      dependencies: ["HAI-001"],
    });
    const store = createMockStore([depTask, blocked]);
    const onBlocked = vi.fn();
    const scheduler = new Scheduler(store, { onBlocked });

    scheduler.start();
    await vi.advanceTimersByTimeAsync(0);
    scheduler.stop();

    expect(store.moveTask).not.toHaveBeenCalled();
    expect(onBlocked).toHaveBeenCalledWith(blocked, ["HAI-001"]);
  });

  it("starts a todo task whose dependency is done", async () => {
    const depTask = makeTask({ id: "HAI-001", column: "done" });
    const ready = makeTask({
      id: "HAI-002",
      column: "todo",
      dependencies: ["HAI-001"],
    });
    const store = createMockStore([depTask, ready]);
    const scheduler = new Scheduler(store);

    scheduler.start();
    await vi.advanceTimersByTimeAsync(0);
    scheduler.stop();

    expect(store.moveTask).toHaveBeenCalledWith("HAI-002", "in-progress");
  });

  // -----------------------------------------------------------------------
  // Concurrency limit
  // -----------------------------------------------------------------------

  it("does NOT start new tasks when maxConcurrent is reached", async () => {
    const ip1 = makeTask({ id: "HAI-001", column: "in-progress" });
    const ip2 = makeTask({ id: "HAI-002", column: "in-progress" });
    const todo = makeTask({ id: "HAI-003", column: "todo" });
    const store = createMockStore([ip1, ip2, todo]);
    const scheduler = new Scheduler(store, { maxConcurrent: 2 });

    scheduler.start();
    await vi.advanceTimersByTimeAsync(0);
    scheduler.stop();

    expect(store.moveTask).not.toHaveBeenCalled();
  });

  // -----------------------------------------------------------------------
  // File scope overlap — todo vs in-progress (PRIMARY REGRESSION TEST)
  // -----------------------------------------------------------------------

  it("defers a todo task whose file scope overlaps an in-progress task", async () => {
    const ipTask = makeTask({ id: "HAI-001", column: "in-progress" });
    const todoTask = makeTask({ id: "HAI-002", column: "todo" });
    const scopes: ScopeMap = {
      "HAI-001": ["src/foo.ts"],
      "HAI-002": ["src/foo.ts"],
    };
    const store = createMockStore([ipTask, todoTask], scopes);
    const scheduler = new Scheduler(store);

    scheduler.start();
    await vi.advanceTimersByTimeAsync(0);
    scheduler.stop();

    // HAI-002 must NOT be started because it overlaps with HAI-001
    expect(store.moveTask).not.toHaveBeenCalled();
  });

  // -----------------------------------------------------------------------
  // File scope overlap — directory glob
  // -----------------------------------------------------------------------

  it("defers a todo task whose file is under an in-progress glob scope", async () => {
    const ipTask = makeTask({ id: "HAI-001", column: "in-progress" });
    const todoTask = makeTask({ id: "HAI-002", column: "todo" });
    const scopes: ScopeMap = {
      "HAI-001": ["src/utils/*"],
      "HAI-002": ["src/utils/helper.ts"],
    };
    const store = createMockStore([ipTask, todoTask], scopes);
    const scheduler = new Scheduler(store);

    scheduler.start();
    await vi.advanceTimersByTimeAsync(0);
    scheduler.stop();

    expect(store.moveTask).not.toHaveBeenCalled();
  });

  // -----------------------------------------------------------------------
  // File scope overlap — newly started todo vs remaining todo
  // -----------------------------------------------------------------------

  it("starts only the first of two todo tasks with overlapping scopes", async () => {
    const taskA = makeTask({ id: "HAI-001", column: "todo" });
    const taskB = makeTask({ id: "HAI-002", column: "todo" });
    const scopes: ScopeMap = {
      "HAI-001": ["src/shared.ts"],
      "HAI-002": ["src/shared.ts"],
    };
    const store = createMockStore([taskA, taskB], scopes);
    const onSchedule = vi.fn();
    const scheduler = new Scheduler(store, { onSchedule });

    scheduler.start();
    await vi.advanceTimersByTimeAsync(0);
    scheduler.stop();

    // Only one should have been started
    expect(store.moveTask).toHaveBeenCalledTimes(1);
    expect(store.moveTask).toHaveBeenCalledWith("HAI-001", "in-progress");
  });

  // -----------------------------------------------------------------------
  // No overlap — disjoint scopes
  // -----------------------------------------------------------------------

  it("starts a todo task when its scope is disjoint from in-progress", async () => {
    const ipTask = makeTask({ id: "HAI-001", column: "in-progress" });
    const todoTask = makeTask({ id: "HAI-002", column: "todo" });
    const scopes: ScopeMap = {
      "HAI-001": ["src/foo.ts"],
      "HAI-002": ["src/bar.ts"],
    };
    const store = createMockStore([ipTask, todoTask], scopes);
    const scheduler = new Scheduler(store);

    scheduler.start();
    await vi.advanceTimersByTimeAsync(0);
    scheduler.stop();

    expect(store.moveTask).toHaveBeenCalledWith("HAI-002", "in-progress");
  });

  // -----------------------------------------------------------------------
  // groupOverlappingFiles disabled
  // -----------------------------------------------------------------------

  it("skips overlap check when groupOverlappingFiles is false", async () => {
    const ipTask = makeTask({ id: "HAI-001", column: "in-progress" });
    const todoTask = makeTask({ id: "HAI-002", column: "todo" });
    const scopes: ScopeMap = {
      "HAI-001": ["src/foo.ts"],
      "HAI-002": ["src/foo.ts"],
    };
    const store = createMockStore([ipTask, todoTask], scopes);
    // Override settings to disable overlap detection
    store.getSettings.mockResolvedValue({
      maxConcurrent: 2,
      maxWorktrees: 4,
      pollIntervalMs: 15_000,
      groupOverlappingFiles: false,
      autoMerge: false,
    });
    const scheduler = new Scheduler(store);

    scheduler.start();
    await vi.advanceTimersByTimeAsync(0);
    scheduler.stop();

    // Should start even though scopes overlap, because the check is disabled
    expect(store.moveTask).toHaveBeenCalledWith("HAI-002", "in-progress");
  });

  // -----------------------------------------------------------------------
  // Re-entrance guard
  // -----------------------------------------------------------------------

  it("prevents concurrent schedule() passes via re-entrance guard", async () => {
    const todoTask = makeTask({ id: "HAI-001", column: "todo" });
    const store = createMockStore([todoTask]);

    // Make listTasks slow so two passes overlap
    let resolveFirst: () => void;
    const firstCall = new Promise<Task[]>((resolve) => {
      resolveFirst = () => resolve([todoTask]);
    });
    let callCount = 0;
    store.listTasks.mockImplementation(() => {
      callCount++;
      if (callCount === 1) return firstCall;
      return Promise.resolve([todoTask]);
    });

    const scheduler = new Scheduler(store, { pollIntervalMs: 10 });
    scheduler.start();

    // First schedule() call is pending (waiting for listTasks)
    // Advance timer to trigger second call
    await vi.advanceTimersByTimeAsync(10);

    // Second call should have been skipped due to guard
    // listTasks should only have been called once (the first, pending call)
    expect(store.listTasks).toHaveBeenCalledTimes(1);

    // Resolve the first call
    resolveFirst!();
    await vi.advanceTimersByTimeAsync(0);

    scheduler.stop();
  });
});

// ---------------------------------------------------------------------------
// pathsOverlap unit tests
// ---------------------------------------------------------------------------

describe("pathsOverlap", () => {
  it("returns true for exact file match", () => {
    expect(pathsOverlap(["src/foo.ts"], ["src/foo.ts"])).toBe(true);
  });

  it("returns true for glob prefix match", () => {
    expect(pathsOverlap(["src/utils/*"], ["src/utils/helper.ts"])).toBe(true);
  });

  it("returns true for reverse glob prefix match", () => {
    expect(pathsOverlap(["src/utils/helper.ts"], ["src/utils/*"])).toBe(true);
  });

  it("returns true for nested directory overlap via globs", () => {
    expect(pathsOverlap(["src/*"], ["src/utils/*"])).toBe(true);
  });

  it("returns true when both sides have matching globs", () => {
    expect(pathsOverlap(["src/utils/*"], ["src/utils/*"])).toBe(true);
  });

  it("returns false for disjoint paths", () => {
    expect(pathsOverlap(["src/foo.ts"], ["src/bar.ts"])).toBe(false);
  });

  it("returns false for disjoint directories", () => {
    expect(pathsOverlap(["src/utils/*"], ["src/models/*"])).toBe(false);
  });

  it("returns false for empty first array", () => {
    expect(pathsOverlap([], ["src/foo.ts"])).toBe(false);
  });

  it("returns false for empty second array", () => {
    expect(pathsOverlap(["src/foo.ts"], [])).toBe(false);
  });

  it("returns false for both empty arrays", () => {
    expect(pathsOverlap([], [])).toBe(false);
  });

  it("handles multiple paths with one overlap", () => {
    expect(
      pathsOverlap(["src/a.ts", "src/b.ts"], ["src/c.ts", "src/b.ts"]),
    ).toBe(true);
  });

  it("handles multiple paths with no overlap", () => {
    expect(
      pathsOverlap(["src/a.ts", "src/b.ts"], ["src/c.ts", "src/d.ts"]),
    ).toBe(false);
  });
});
