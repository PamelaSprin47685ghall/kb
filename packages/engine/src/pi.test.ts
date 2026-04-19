import { beforeEach, describe, expect, it, vi } from "vitest";

const mockCreateAgentSession = vi.fn();
const mockCreateCodingTools = vi.fn(() => []);
const mockCreateReadOnlyTools = vi.fn(() => []);
const mockAuthStorageCreate = vi.fn(() => ({ kind: "auth" }));
const mockSessionManagerInMemory = vi.fn(() => ({ kind: "session-manager" }));
const mockSettingsManagerCreate = vi.fn(() => ({ applyOverrides: vi.fn() }));
const mockSettingsManagerInMemory = vi.fn(() => ({ applyOverrides: vi.fn() }));
const mockResourceReload = vi.fn(async () => undefined);
const mockDefaultResourceLoader = vi.fn(() => ({ reload: mockResourceReload }));
const mockModelFind = vi.fn((provider: string, id: string) => ({ provider, id }));
const mockModelRegistry = vi.fn(() => ({ find: mockModelFind }));

vi.mock("@mariozechner/pi-coding-agent", () => ({
  AuthStorage: { create: mockAuthStorageCreate },
  createAgentSession: mockCreateAgentSession,
  createCodingTools: mockCreateCodingTools,
  createReadOnlyTools: mockCreateReadOnlyTools,
  DefaultResourceLoader: mockDefaultResourceLoader,
  ModelRegistry: mockModelRegistry,
  SessionManager: { inMemory: mockSessionManagerInMemory },
  SettingsManager: { create: mockSettingsManagerCreate, inMemory: mockSettingsManagerInMemory },
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
    mockCreateAgentSession.mockResolvedValue({ session: mockAgentSession() });
    mockResourceReload.mockResolvedValue(undefined);
    mockModelFind.mockImplementation((provider: string, id: string) => ({ provider, id }));
  });

  it("uses SettingsManager.create so user plugin/extension settings are preserved", async () => {
    await createKbAgent({ cwd: "/tmp/worktree", systemPrompt: "system" });

    expect(mockSettingsManagerCreate).toHaveBeenCalledWith("/tmp/worktree");
    expect(mockSettingsManagerInMemory).not.toHaveBeenCalled();
    const settingsManager = mockSettingsManagerCreate.mock.results[0]?.value as { applyOverrides: ReturnType<typeof vi.fn> };
    expect(settingsManager.applyOverrides).toHaveBeenCalledWith({
      compaction: { enabled: true },
      retry: { enabled: true, maxRetries: 3 },
    });
  });

  it("supports colon-delimited model IDs and picks one model at random", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0.9);

    await createKbAgent({
      cwd: "/tmp/worktree",
      systemPrompt: "system",
      defaultProvider: "anthropic",
      defaultModelId: "claude-sonnet-4-5:claude-opus-4-1",
    });

    expect(mockModelFind).toHaveBeenCalledWith("anthropic", "claude-sonnet-4-5");
    expect(mockModelFind).toHaveBeenCalledWith("anthropic", "claude-opus-4-1");
    const options = mockCreateAgentSession.mock.calls[0]?.[0];
    expect(options.model).toEqual({ provider: "anthropic", id: "claude-opus-4-1" });
  });

  it("supports provider/model entries without requiring defaultProvider", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0.1);

    await createKbAgent({
      cwd: "/tmp/worktree",
      systemPrompt: "system",
      defaultModelId: "anthropic/claude-sonnet-4-5:openai/gpt-4o",
    });

    expect(mockModelFind).toHaveBeenCalledWith("anthropic", "claude-sonnet-4-5");
    expect(mockModelFind).toHaveBeenCalledWith("openai", "gpt-4o");
    const options = mockCreateAgentSession.mock.calls[0]?.[0];
    expect(options.model).toEqual({ provider: "anthropic", id: "claude-sonnet-4-5" });
  });
});
