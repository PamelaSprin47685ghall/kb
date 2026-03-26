import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock @hai/core before importing the module under test
vi.mock("@hai/core", () => {
  const COLUMNS = ["triage", "specified", "in-progress", "review", "done"];
  const COLUMN_LABELS: Record<string, string> = {
    triage: "Triage",
    specified: "Specified",
    "in-progress": "In Progress",
    review: "Review",
    done: "Done",
  };

  return {
    TaskStore: vi.fn(),
    COLUMNS,
    COLUMN_LABELS,
  };
});

// Mock @hai/engine
vi.mock("@hai/engine", () => ({ aiMergeTask: vi.fn() }));

import { TaskStore } from "@hai/core";
import { runTaskShow } from "./task.js";

function makeTask(overrides: Record<string, unknown> = {}) {
  return {
    id: "HAI-001",
    description: "A short description",
    column: "triage",
    dependencies: [],
    steps: [],
    currentStep: 0,
    log: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe("runTaskShow", () => {
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("displays the full description without truncation when no title", async () => {
    const longDesc = "A".repeat(120); // well over 60 chars
    const task = makeTask({ description: longDesc });

    (TaskStore as unknown as ReturnType<typeof vi.fn>).mockImplementation(() => ({
      init: vi.fn(),
      getTask: vi.fn().mockResolvedValue(task),
    }));

    await runTaskShow("HAI-001");

    const headerLine = logSpy.mock.calls.find(
      (call) => typeof call[0] === "string" && call[0].includes("HAI-001:")
    );
    expect(headerLine).toBeDefined();
    expect(headerLine![0]).toContain(longDesc);
    // Ensure no truncation happened
    expect(headerLine![0]).not.toContain(longDesc.slice(0, 60) + "…");
    expect(headerLine![0].length).toBeGreaterThan(60 + "  HAI-001: ".length);
  });

  it("displays the title when present instead of description", async () => {
    const task = makeTask({
      title: "My Task Title",
      description: "This is the full description that should not appear in the header",
    });

    (TaskStore as unknown as ReturnType<typeof vi.fn>).mockImplementation(() => ({
      init: vi.fn(),
      getTask: vi.fn().mockResolvedValue(task),
    }));

    await runTaskShow("HAI-001");

    const headerLine = logSpy.mock.calls.find(
      (call) => typeof call[0] === "string" && call[0].includes("HAI-001:")
    );
    expect(headerLine).toBeDefined();
    expect(headerLine![0]).toContain("My Task Title");
    expect(headerLine![0]).not.toContain("This is the full description");
  });
});
