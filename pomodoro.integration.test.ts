import { describe, expect, it } from "bun:test";
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
  const intervals: Array<{ cb: () => void; cleared: boolean }> = [];

  const originalSetInterval = globalThis.setInterval;
  const originalClearInterval = globalThis.clearInterval;

  globalThis.setInterval = ((cb: () => void) => {
    const interval = { cb, cleared: false };
    intervals.push(interval);
    return interval as any;
  }) as typeof setInterval;

  globalThis.clearInterval = ((interval: { cleared?: boolean } | null) => {
    if (interval) interval.cleared = true;
  }) as typeof clearInterval;

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

  function restoreGlobals() {
    globalThis.setInterval = originalSetInterval;
    globalThis.clearInterval = originalClearInterval;
  }

  return {
    appended,
    intervals,
    notifications,
    restoreGlobals,
    runCommand,
    startSession,
    statuses,
  };
}


describe("Pomodoro extension integration", () => {
  it("rejects non-positive durations without persisting state", async () => {
    const harness = createHarness();

    try {
      await harness.startSession();
      await harness.runCommand("set -1 0 5");

      expect(harness.appended).toHaveLength(0);
      expect(harness.notifications.at(-1)).toEqual({
        msg: "Invalid durations. Use: /pomodoro set <work> <break> <long> (positive whole minutes)",
        level: "info",
      });
      expect(harness.statuses.at(-1)?.value).toContain("25:00");
    } finally {
      harness.restoreGlobals();
    }
  });

  it("rejects partially numeric duration strings", async () => {
    const harness = createHarness();

    try {
      await harness.startSession();
      await harness.runCommand("set 25m 5 15");

      expect(harness.appended).toHaveLength(0);
      expect(harness.notifications.at(-1)?.msg).toContain("Invalid durations");
    } finally {
      harness.restoreGlobals();
    }
  });

  it("persists valid duration updates", async () => {
    const harness = createHarness();

    try {
      await harness.startSession();
      await harness.runCommand("set 30 10 20");

      expect(harness.appended).toHaveLength(1);
      expect(harness.appended[0].data.workDuration).toBe(30 * 60);
      expect(harness.appended[0].data.breakDuration).toBe(10 * 60);
      expect(harness.appended[0].data.longBreakDuration).toBe(20 * 60);
      expect(harness.statuses.at(-1)?.value).toContain("30:00");
    } finally {
      harness.restoreGlobals();
    }
  });

  it("skips malformed restore entries and warns", async () => {
    const warnCalls: unknown[][] = [];
    const originalWarn = console.warn;
    console.warn = (...args: unknown[]) => {
      warnCalls.push(args);
    };

    const harness = createHarness([
      { type: "custom", customType: "pomodoro-state", data: null },
      {
        type: "custom",
        customType: "pomodoro-state",
        data: { remainingSeconds: 120, currentFocus: "Ship release" },
      },
    ]);

    try {
      await harness.startSession();

      expect(warnCalls).toHaveLength(1);
      expect(String(warnCalls[0][0])).toContain("Skipping invalid pomodoro state entry");
      expect(harness.statuses.at(-1)?.value).toContain("02:00");
      expect(harness.statuses.at(-1)?.value).toContain("Ship release");
    } finally {
      console.warn = originalWarn;
      harness.restoreGlobals();
    }
  });
});
