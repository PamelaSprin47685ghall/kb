import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createAgentSession: vi.fn(),
  createCodingTools: vi.fn(() => []),
  createReadOnlyTools: vi.fn(() => []),
  authStorageCreate: vi.fn(() => ({ kind: "auth" })),
  existsSync: vi.fn(() => false),
  getAgentDir: vi.fn(() => "/home/test/.pi/agent"),
  modelRegistryCtor: vi.fn(),
  sessionManagerInMemory: vi.fn(() => ({ kind: "session-manager" })),
  settingsManagerCreate: vi.fn(() => ({ applyOverrides: vi.fn() })),
  settingsManagerInMemory: vi.fn(() => ({ applyOverrides: vi.fn() })),
  resourceReload: vi.fn(async () => undefined),
  modelFind: vi.fn((provider: string, id: string) => ({ provider, id })),
}));

vi.mock("@mariozechner/pi-coding-agent", () => ({
  AuthStorage: { create: mocks.authStorageCreate },
  createAgentSession: mocks.createAgentSession,
  createCodingTools: mocks.createCodingTools,
  createReadOnlyTools: mocks.createReadOnlyTools,
  getAgentDir: mocks.getAgentDir,
  DefaultResourceLoader: vi.fn(function MockDefaultResourceLoader() {
    return { reload: mocks.resourceReload };
  }),
  ModelRegistry: mocks.modelRegistryCtor,
  SessionManager: { inMemory: mocks.sessionManagerInMemory },
  SettingsManager: { create: mocks.settingsManagerCreate, inMemory: mocks.settingsManagerInMemory },
}));
vi.mock("node:fs", () => ({
  existsSync: mocks.existsSync,
}));

import { createKbAgent } from "./pi.js";

function mockAgentSession() {
  return {
    setThinkingLevel: vi.fn(),
    subscribe: vi.fn(),
    prompt: vi.fn(),
    dispose: vi.fn(),
  };
}

describe("createKbAgent", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    mocks.existsSync.mockImplementation(() => false);
    mocks.modelRegistryCtor.mockImplementation(function MockModelRegistry() {
      return { find: mocks.modelFind };
    });
    mocks.createAgentSession.mockResolvedValue({ session: mockAgentSession() });
    mocks.resourceReload.mockResolvedValue(undefined);
    mocks.modelFind.mockImplementation((provider: string, id: string) => ({ provider, id }));
  });

  it("uses SettingsManager.create so user plugins/extensions settings are preserved", async () => {
    await createKbAgent({ cwd: "/tmp/worktree", systemPrompt: "system" });

    expect(mocks.authStorageCreate).toHaveBeenCalledWith("/home/test/.pi/agent/auth.json");
    expect(mocks.modelRegistryCtor).toHaveBeenCalledWith(
      mocks.authStorageCreate.mock.results[0]?.value,
      "/home/test/.pi/agent/models.json",
    );
    expect(mocks.settingsManagerCreate).toHaveBeenCalledWith("/tmp/worktree", "/home/test/.pi/agent");
    expect(mocks.settingsManagerInMemory).not.toHaveBeenCalled();
    const settingsManager = mocks.settingsManagerCreate.mock.results[0]?.value as { applyOverrides: ReturnType<typeof vi.fn> };
    expect(settingsManager.applyOverrides).toHaveBeenCalledWith({
      compaction: { enabled: true },
      retry: { enabled: true, maxRetries: 3 },
    });
    const options = mocks.createAgentSession.mock.calls[0]?.[0];
    expect(options.settingsManager).toBe(settingsManager);
  });

  it("supports colon-delimited model IDs and picks one model at random", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0.9);

    await createKbAgent({
      cwd: "/tmp/worktree",
      systemPrompt: "system",
      defaultProvider: "anthropic",
      defaultModelId: "claude-sonnet-4-5:claude-opus-4-1",
    });

    expect(mocks.modelFind).toHaveBeenCalledWith("anthropic", "claude-sonnet-4-5");
    expect(mocks.modelFind).toHaveBeenCalledWith("anthropic", "claude-opus-4-1");
    const options = mocks.createAgentSession.mock.calls[0]?.[0];
    expect(options.model).toEqual({ provider: "anthropic", id: "claude-opus-4-1" });
  });

  it("supports provider/model entries without requiring defaultProvider", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0.1);

    await createKbAgent({
      cwd: "/tmp/worktree",
      systemPrompt: "system",
      defaultModelId: "anthropic/claude-sonnet-4-5:openai/gpt-4o",
    });

    expect(mocks.modelFind).toHaveBeenCalledWith("anthropic", "claude-sonnet-4-5");
    expect(mocks.modelFind).toHaveBeenCalledWith("openai", "gpt-4o");
    const options = mocks.createAgentSession.mock.calls[0]?.[0];
    expect(options.model).toEqual({ provider: "anthropic", id: "claude-sonnet-4-5" });
  });

  it("falls back to legacy ~/.pi paths when only legacy files exist", async () => {
    const legacyPaths = new Set([
      "/home/test/.pi/auth.json",
      "/home/test/.pi/models.json",
      "/home/test/.pi/settings.json",
    ]);
    mocks.existsSync.mockImplementation((path: unknown) => typeof path === "string" && legacyPaths.has(path));

    await createKbAgent({ cwd: "/tmp/worktree", systemPrompt: "system" });

    expect(mocks.authStorageCreate).toHaveBeenCalledWith("/home/test/.pi/auth.json");
    expect(mocks.modelRegistryCtor).toHaveBeenCalledWith(
      mocks.authStorageCreate.mock.results[0]?.value,
      "/home/test/.pi/models.json",
    );
    expect(mocks.settingsManagerCreate).toHaveBeenCalledWith("/tmp/worktree", "/home/test/.pi");
  });
});
