import { watch, type FSWatcher } from "node:fs";

import type { WorkspaceRoot } from "./workspace-root.js";

export interface WorkspaceWatchEvent {
  readonly type: "change" | "rename" | "overflow";
  readonly relativePath?: string;
}

export interface WorkspaceWatcherOptions {
  readonly debounceMs?: number;
  readonly maxPending?: number;
}

export class SafeWorkspaceWatcher {
  readonly #root: WorkspaceRoot;
  readonly #listener: (events: readonly WorkspaceWatchEvent[]) => void;
  readonly #debounceMs: number;
  readonly #maxPending: number;
  readonly #pending = new Map<string, WorkspaceWatchEvent>();
  #watcher: FSWatcher | undefined;
  #timer: NodeJS.Timeout | undefined;

  constructor(
    root: WorkspaceRoot,
    listener: (events: readonly WorkspaceWatchEvent[]) => void,
    options: WorkspaceWatcherOptions = {},
  ) {
    this.#root = root;
    this.#listener = listener;
    this.#debounceMs = options.debounceMs ?? 75;
    this.#maxPending = options.maxPending ?? 256;
  }

  start(): void {
    if (this.#watcher) return;
    this.#root.assertIdentity();
    this.#watcher = watch(
      this.#root.path,
      { recursive: process.platform === "win32" },
      (type, filename) => {
        if (!filename) return this.#enqueue({ type: "overflow" });
        try {
          this.#root.assertIdentity();
          const relativePath = this.#root.normalizeRelative(
            filename.toString(),
          );
          if (this.#root.isExcluded(relativePath)) return;
          this.#enqueue({ type, relativePath });
        } catch {
          this.#enqueue({ type: "overflow" });
        }
      },
    );
    this.#watcher.on("error", () => this.#enqueue({ type: "overflow" }));
  }

  close(): void {
    this.#watcher?.close();
    this.#watcher = undefined;
    if (this.#timer) clearTimeout(this.#timer);
    this.#timer = undefined;
    this.#pending.clear();
  }

  #enqueue(event: WorkspaceWatchEvent): void {
    if (this.#pending.size >= this.#maxPending || event.type === "overflow") {
      this.#pending.clear();
      this.#pending.set("overflow", { type: "overflow" });
    } else if (event.relativePath) {
      this.#pending.set(event.relativePath, event);
    }
    if (this.#timer) clearTimeout(this.#timer);
    this.#timer = setTimeout(() => {
      this.#timer = undefined;
      const events = [...this.#pending.values()];
      this.#pending.clear();
      if (events.length) {
        try {
          this.#listener(events);
        } catch {
          /* listener failures cannot break the watcher */
        }
      }
    }, this.#debounceMs);
  }
}
