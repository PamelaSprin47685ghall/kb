/**
 * Shared pi SDK setup for kb engine agents.
 *
 * Uses the user's existing pi auth (API keys / OAuth from ~/.pi/agent/auth.json).
 * Provides factory functions for creating triage and executor agent sessions.
 */

import {
  AuthStorage,
  createAgentSession,
  createCodingTools,
  createReadOnlyTools,
  DefaultResourceLoader,
  getAgentDir,
  ModelRegistry,
  SessionManager,
  SettingsManager,
  type AgentSession,
  type ToolDefinition,
} from "@mariozechner/pi-coding-agent";
import { join } from "node:path";

export interface AgentResult {
  session: AgentSession;
}

export interface AgentOptions {
  cwd: string;
  systemPrompt: string;
  tools?: "coding" | "readonly";
  customTools?: ToolDefinition[];
  onText?: (delta: string) => void;
  onThinking?: (delta: string) => void;
  onToolStart?: (name: string, args?: Record<string, unknown>) => void;
  onToolEnd?: (name: string, isError: boolean, result?: unknown) => void;
  /** Default model provider (e.g. "anthropic"). Used with `defaultModelId` to select a specific model. */
  defaultProvider?: string;
  /** Default model ID(s). Supports colon-delimited IDs and provider/model entries for random model selection. */
  defaultModelId?: string;
  /** Default thinking effort level (e.g. "medium", "high"). When provided, sets the session's thinking level after creation. */
  defaultThinkingLevel?: string;
}

function parseModelSelections(defaultProvider?: string, defaultModelId?: string): Array<{ provider: string; modelId: string }> {
  if (!defaultModelId) return [];

  return defaultModelId
    .split(":")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      if (entry.includes("/")) {
        const slashIdx = entry.indexOf("/");
        const provider = entry.slice(0, slashIdx).trim();
        const modelId = entry.slice(slashIdx + 1).trim();
        if (!provider || !modelId) return undefined;
        return { provider, modelId };
      }
      if (!defaultProvider) return undefined;
      return { provider: defaultProvider, modelId: entry };
    })
    .filter((selection): selection is { provider: string; modelId: string } => !!selection);
}

/**
 * Create a pi agent session configured for kb.
 * Reuses the user's existing pi auth and model configuration.
 */
export async function createKbAgent(options: AgentOptions): Promise<AgentResult> {
  const agentDir = getAgentDir();
  const authStorage = AuthStorage.create(join(agentDir, "auth.json"));
  const modelRegistry = new ModelRegistry(authStorage, join(agentDir, "models.json"));

  const tools =
    options.tools === "readonly"
      ? createReadOnlyTools(options.cwd)
      : createCodingTools(options.cwd);

  // Load user's existing pi settings so configured plugins/extensions are preserved.
  const settingsManager = SettingsManager.create(options.cwd, agentDir);
  settingsManager.applyOverrides({
    compaction: { enabled: true },
    retry: { enabled: true, maxRetries: 3 },
  });

  const modelSelections = parseModelSelections(options.defaultProvider, options.defaultModelId);
  const candidateModels = modelSelections
    .map((selection) => modelRegistry.find(selection.provider, selection.modelId))
    .filter((model): model is NonNullable<typeof model> => !!model);
  const selectedModel = candidateModels.length > 0
    ? candidateModels[Math.floor(Math.random() * candidateModels.length)]
    : undefined;

  const resourceLoader = new DefaultResourceLoader({
    cwd: options.cwd,
    settingsManager,
    systemPromptOverride: () => options.systemPrompt,
    appendSystemPromptOverride: () => [],
  });
  await resourceLoader.reload();

  const { session } = await createAgentSession({
    cwd: options.cwd,
    authStorage,
    modelRegistry,
    resourceLoader,
    tools,
    customTools: options.customTools,
    sessionManager: SessionManager.inMemory(),
    settingsManager,
    ...(selectedModel ? { model: selectedModel } : {}),
  });

  // Apply thinking level if specified
  if (options.defaultThinkingLevel) {
    session.setThinkingLevel(options.defaultThinkingLevel as any);
  }

  // Wire up event listeners
  session.subscribe((event) => {
    if (event.type === "message_update") {
      const msgEvent = event.assistantMessageEvent;
      if (msgEvent.type === "text_delta") {
        options.onText?.(msgEvent.delta);
      } else if (msgEvent.type === "thinking_delta") {
        options.onThinking?.(msgEvent.delta);
      }
    }
    if (event.type === "tool_execution_start") {
      options.onToolStart?.(event.toolName, event.args as Record<string, unknown> | undefined);
    }
    if (event.type === "tool_execution_end") {
      options.onToolEnd?.(event.toolName, event.isError, event.result);
    }
  });

  return { session };
}
