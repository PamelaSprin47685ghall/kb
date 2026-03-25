import express from "express";
import { join, dirname } from "node:path";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { TaskStore, MergeResult } from "@hai/core";
import { createApiRoutes } from "./routes.js";
import { createSSE } from "./sse.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

export interface ServerOptions {
  /** Custom merge handler — when provided, used instead of store.mergeTask */
  onMerge?: (taskId: string) => Promise<MergeResult>;
  /** Maximum concurrent worktrees / execution slots (default 2) */
  maxConcurrent?: number;
}

export function createServer(store: TaskStore, options?: ServerOptions) {
  const app = express();
  app.use(express.json());

  // Serve built React app
  const clientDir = existsSync(join(__dirname, "..", "dist", "client"))
    ? join(__dirname, "..", "dist", "client")
    : existsSync(join(__dirname, "..", "client"))
      ? join(__dirname, "..", "client")
      : join(__dirname, "..", "public");

  app.use(express.static(clientDir));

  // SSE endpoint
  app.get("/api/events", createSSE(store));

  // REST API
  app.use("/api", createApiRoutes(store, options));

  // SPA fallback
  app.get("/{*splat}", (_req, res) => {
    res.sendFile(join(clientDir, "index.html"));
  });

  return app;
}
