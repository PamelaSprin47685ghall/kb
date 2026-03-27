import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createLogger, schedulerLog, executorLog, triageLog, mergerLog, worktreePoolLog, reviewerLog } from "./logger.js";

describe("createLogger", () => {
  let logSpy: ReturnType<typeof vi.spyOn>;
  let warnSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy.mockRestore();
    warnSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it("formats log output as [prefix] message", () => {
    const logger = createLogger("test");
    logger.log("hello world");
    expect(logSpy).toHaveBeenCalledWith("[test] hello world");
  });

  it("formats warn output as [prefix] message", () => {
    const logger = createLogger("test");
    logger.warn("something happened");
    expect(warnSpy).toHaveBeenCalledWith("[test] something happened");
  });

  it("formats error output as [prefix] message", () => {
    const logger = createLogger("test");
    logger.error("failure");
    expect(errorSpy).toHaveBeenCalledWith("[test] failure");
  });

  it("passes extra arguments through", () => {
    const logger = createLogger("test");
    const err = new Error("boom");
    logger.error("failed:", err);
    expect(errorSpy).toHaveBeenCalledWith("[test] failed:", err);
  });

  it("delegates log to console.log, warn to console.warn, error to console.error", () => {
    const logger = createLogger("x");
    logger.log("a");
    logger.warn("b");
    logger.error("c");
    expect(logSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy).toHaveBeenCalledTimes(1);
  });

  it("pre-built instances use correct prefixes", () => {
    schedulerLog.log("tick");
    expect(logSpy).toHaveBeenCalledWith("[scheduler] tick");

    executorLog.log("run");
    expect(logSpy).toHaveBeenCalledWith("[executor] run");

    triageLog.log("spec");
    expect(logSpy).toHaveBeenCalledWith("[triage] spec");

    mergerLog.log("merge");
    expect(logSpy).toHaveBeenCalledWith("[merger] merge");

    worktreePoolLog.log("prune");
    expect(logSpy).toHaveBeenCalledWith("[worktree-pool] prune");

    reviewerLog.log("review");
    expect(logSpy).toHaveBeenCalledWith("[reviewer] review");
  });
});
