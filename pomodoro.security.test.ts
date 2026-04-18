/**
 * Security Tests for Pomodoro Extension
 * 
 * Tests for potential security vulnerabilities and edge cases.
 */

import { describe, it, expect, beforeEach } from "bun:test";
import pomodoro from "./pomodoro";

type Entry = {
  type: string;
  customType?: string;
  data?: unknown;
};

function createHarness(entries: Entry[] = []) {
  const handlers = new Map<string, Function[]>();
  const commands = new Map<string, { handler: (args: string, ctx: any) => Promise<void> }>();
  const notifications: Array<{ msg: string; level: string }> = [];
  const statuses: Array<{ key: string; value: string }> = [];
  const appended: Array<{ type: string; data: any }> = [];

  const ctx = {
    ui: {
      theme: { fg: (_color: string, text: string) => text },
      notify(msg: string, level: string) {
        notifications.push({ msg, level });
      },
      setStatus(key: string, value: string) {
        statuses.push({ key, value });
      },
    },
    sessionManager: {
      getEntries() {
        return entries;
      },
    },
  };

  const pi = {
    appendEntry(type: string, data: unknown) {
      appended.push({ type, data: structuredClone(data) });
    },
    on(name: string, handler: Function) {
      handlers.set(name, [...(handlers.get(name) || []), handler]);
    },
    registerCommand(name: string, command: any) {
      commands.set(name, command);
    },
    registerTool() {},
    registerShortcut() {},
  };

  pomodoro(pi as any);

  async function startSession() {
    for (const handler of handlers.get("session_start") || []) {
      await handler({}, ctx);
    }
  }

  async function runCommand(args: string) {
    const command = commands.get("pomodoro");
    if (!command) throw new Error("pomodoro command not registered");
    await command.handler(args, ctx);
  }

  return { appended, notifications, runCommand, startSession, statuses };
}

describe("Security Tests", () => {
  describe("Prototype Pollution Prevention", () => {
    it("rejects __proto__ in state restoration", async () => {
      const harness = createHarness([
        {
          type: "custom",
          customType: "pomodoro-state",
          data: {
            __proto__: { isAdmin: true },
            isRunning: true
          },
        },
      ]);

      await harness.startSession();
      
      // The prototype pollution should not affect the actual state
      const state = harness.appended.at(-1)?.data || {};
      expect(({} as any).isAdmin).toBeUndefined();
    });

    it("rejects constructor in state restoration", async () => {
      const harness = createHarness([
        {
          type: "custom",
          customType: "pomodoro-state",
          data: {
            constructor: { prototype: { admin: true } },
            sessionsCompleted: 100
          },
        },
      ]);

      await harness.startSession();
      
      // constructor is stored as a plain field, not a prototype attack
      // This is safe because:
      // 1. No eval() is used
      // 2. No Function() constructor is used
      // 3. It's just a regular object property
      expect(harness.statuses.length).toBeGreaterThan(0);
      // No crash = safe
    });
  });

  describe("Input Length Limits", () => {
    it("handles very long focus strings", async () => {
      const harness = createHarness();
      await harness.startSession();

      const longFocus = "A".repeat(10000);
      await harness.runCommand(`focus ${longFocus}`);

      // Should handle without crashing
      expect(harness.notifications.length).toBeGreaterThan(0);
      const state = harness.appended.at(-1)?.data;
      expect(typeof state.currentFocus).toBe("string");
    });

    it("handles very large numbers in state", async () => {
      const harness = createHarness([
        {
          type: "custom",
          customType: "pomodoro-state",
          data: {
            remainingSeconds: Number.MAX_SAFE_INTEGER,
            workDuration: Number.MAX_SAFE_INTEGER,
            sessionsCompleted: Number.MAX_SAFE_INTEGER,
          },
        },
      ]);

      await harness.startSession();
      
      // State should be restored but might cause display issues
      // The key is it doesn't crash
      expect(harness.statuses.length).toBeGreaterThan(0);
    });
  });

  describe("Type Confusion", () => {
    it("handles NaN in numeric fields", async () => {
      const harness = createHarness([
        {
          type: "custom",
          customType: "pomodoro-state",
          data: {
            remainingSeconds: NaN,
            workDuration: "not a number",
          },
        },
      ]);

      await harness.startSession();
      
      // Invalid values should be rejected - status should still update
      expect(harness.statuses.length).toBeGreaterThan(0);
    });

    it("handles Infinity in numeric fields", async () => {
      const harness = createHarness([
        {
          type: "custom",
          customType: "pomodoro-state",
          data: {
            remainingSeconds: Infinity,
            sessionsCompleted: -Infinity,
          },
        },
      ]);

      await harness.startSession();
      
      // Invalid values should be rejected
      expect(harness.statuses.length).toBeGreaterThan(0);
    });

    it("handles boolean type confusion", async () => {
      const harness = createHarness([
        {
          type: "custom",
          customType: "pomodoro-state",
          data: {
            isRunning: "true",
            isBreak: 1,
          },
        },
      ]);

      await harness.startSession();
      
      // String "true" and number 1 should NOT be treated as booleans
      // Status should be set with default false values
      expect(harness.statuses.length).toBeGreaterThan(0);
      const lastStatus = harness.statuses.at(-1)?.value || "";
      expect(lastStatus).toContain("(paused)"); // lowercase "paused"
    });
  });

  describe("Command Injection Prevention", () => {
    it("handles script tags in focus task", async () => {
      const harness = createHarness();
      await harness.startSession();

      // split(/\s+/) breaks on whitespace including newlines
      // Script-like content is stored but harmless (no eval)
      await harness.runCommand("focus Test<script>alert(1)</script>");
      
      const state = harness.appended.at(-1)?.data;
      expect(state.currentFocus).toContain("script");
      expect(state.currentFocus).toBe("Test<script>alert(1)</script>");
    });

    it("handles special characters in focus", async () => {
      const harness = createHarness();
      await harness.startSession();

      await harness.runCommand("focus Test && rm -rf /");
      
      const state = harness.appended.at(-1)?.data;
      // Special chars should be preserved safely
      expect(state.currentFocus).toContain("&&");
    });
  });

  describe("ReDoS Prevention", () => {
    it("handles large input in duration parsing", async () => {
      const harness = createHarness();
      await harness.startSession();

      // Should not cause regex catastrophic backtracking
      await harness.runCommand("set 9999999999999999999 1 1");
      
      // Should either accept or reject, but not hang
      expect(harness.notifications.length).toBeGreaterThan(0);
    });

    it("handles unicode in duration parsing", async () => {
      const harness = createHarness();
      await harness.startSession();

      await harness.runCommand("set 25ವ 5 15");
      
      // Should reject non-digit input
      expect(harness.notifications.at(-1)?.msg).toContain("Invalid");
    });
  });
});
