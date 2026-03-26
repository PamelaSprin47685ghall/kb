import { describe, it, expect } from "vitest";

/**
 * Tests for the agent-active class logic in TaskCard.
 *
 * Since no DOM environment (jsdom/happy-dom) or @testing-library/react is available,
 * we extract and test the class computation logic directly.
 */

const ACTIVE_STATUSES = new Set(["planning", "researching", "executing", "finalizing", "merging", "specifying"]);

/** Mirrors the cardClass computation from TaskCard.tsx */
function computeCardClass(opts: { dragging?: boolean; queued?: boolean; status?: string }): string {
  const { dragging = false, queued = false, status } = opts;
  const isAgentActive = !queued && ACTIVE_STATUSES.has(status as string);
  return `card${dragging ? " dragging" : ""}${queued ? " queued" : ""}${isAgentActive ? " agent-active" : ""}`;
}

describe("TaskCard agent-active class", () => {
  it("applies agent-active for an active status (executing)", () => {
    const cls = computeCardClass({ status: "executing" });
    expect(cls).toContain("agent-active");
  });

  it("applies agent-active for all active statuses", () => {
    for (const status of ["planning", "researching", "executing", "finalizing", "merging", "specifying"]) {
      const cls = computeCardClass({ status });
      expect(cls).toContain("agent-active");
    }
  });

  it("does NOT apply agent-active when status is undefined", () => {
    const cls = computeCardClass({});
    expect(cls).not.toContain("agent-active");
  });

  it("does NOT apply agent-active for non-active status (idle)", () => {
    const cls = computeCardClass({ status: "idle" });
    expect(cls).not.toContain("agent-active");
  });

  it("does NOT apply agent-active for queued card even with active status", () => {
    const cls = computeCardClass({ status: "executing", queued: true });
    expect(cls).not.toContain("agent-active");
    expect(cls).toContain("queued");
  });

  it("does NOT apply agent-active for queued card with no status", () => {
    const cls = computeCardClass({ queued: true });
    expect(cls).not.toContain("agent-active");
  });

  it("combines dragging and agent-active correctly", () => {
    const cls = computeCardClass({ status: "executing", dragging: true });
    expect(cls).toContain("agent-active");
    expect(cls).toContain("dragging");
  });

  it("base card class is always present", () => {
    expect(computeCardClass({})).toBe("card");
    expect(computeCardClass({ status: "executing" })).toMatch(/^card /);
  });
});
