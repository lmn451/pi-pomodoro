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

  it("transitions to break when work timer completes", async () => {
    const harness = createHarness();

    try {
      await harness.startSession();
      await harness.runCommand("set 1 5 15");
      await harness.runCommand("start");

      const timer = harness.intervals[0];
      while (!harness.intervals[0].cleared) {
        timer.cb();
      }

      expect(harness.notifications.at(-1)?.msg).toContain("Work session 1 complete");
      expect(harness.notifications.at(-1)?.msg).toContain("short break");
      expect(harness.statuses.at(-1)?.value).toContain("05:00");
      expect(harness.statuses.at(-1)?.value).toContain("Break");
    } finally {
      harness.restoreGlobals();
    }
  });

  it("transitions to long break after 4 sessions", async () => {
    const harness = createHarness();

    try {
      await harness.startSession();
      await harness.runCommand("set 1 5 15");

      for (let i = 1; i <= 4; i++) {
        await harness.runCommand("start Fix task " + i);

        let timer = harness.intervals[harness.intervals.length - 1];
        while (!timer.cleared) {
          timer.cb();
        }

        if (i < 4) {
          await harness.runCommand("start");
          timer = harness.intervals[harness.intervals.length - 1];
          while (!timer.cleared) {
            timer.cb();
          }
        }
      }

      const notif = harness.notifications.at(-1);
      expect(notif?.msg).toContain("Work session 4 complete");
      expect(notif?.msg).toContain("long break");
      expect(harness.statuses.at(-1)?.value).toContain("15:00");
    } finally {
      harness.restoreGlobals();
    }
  });

  it("clears focus after work session completes", async () => {
    const harness = createHarness();

    try {
      await harness.startSession();
      await harness.runCommand("set 1 5 15");
      await harness.runCommand("focus Fix critical bug");
      await harness.runCommand("start");

      expect(harness.statuses.at(-1)?.value).toContain("Fix critical bug");

      const timer = harness.intervals[0];
      while (!timer.cleared) {
        timer.cb();
      }

      expect(harness.statuses.at(-1)?.value).not.toContain("Fix critical bug");
      expect(harness.appended.at(-1)?.data.currentFocus).toBe("");
    } finally {
      harness.restoreGlobals();
    }
  });

  it("transitions back to work after break completes", async () => {
    const harness = createHarness();

    try {
      await harness.startSession();
      await harness.runCommand("set 1 2 5");
      await harness.runCommand("start");

      let timer = harness.intervals[harness.intervals.length - 1];
      while (!timer.cleared) {
        timer.cb();
      }

      expect(harness.statuses.at(-1)?.value).toContain("Break");
      expect(harness.statuses.at(-1)?.value).toContain("02:00");

      await harness.runCommand("start");

      timer = harness.intervals[harness.intervals.length - 1];
      while (!timer.cleared) {
        timer.cb();
      }

      expect(harness.notifications.at(-1)?.msg).toContain("Break over");
      expect(harness.statuses.at(-1)?.value).toContain("Work");
      expect(harness.statuses.at(-1)?.value).toContain("01:00");
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

  describe("stop command", () => {
    it("pauses running timer and updates status", async () => {
      const harness = createHarness();

      try {
        await harness.startSession();
        await harness.runCommand("set 5 1 1");
        await harness.runCommand("start");

        harness.intervals[0].cb();
        harness.intervals[0].cb();

        await harness.runCommand("stop");

        expect(harness.intervals[0].cleared).toBe(true);
        expect(harness.notifications.at(-1)?.msg).toContain("paused");
        expect(harness.statuses.at(-1)?.value).toContain("paused");
      } finally {
        harness.restoreGlobals();
      }
    });

    it("persists state even when timer already stopped", async () => {
      const harness = createHarness();

      try {
        await harness.startSession();
        const appendedBefore = harness.appended.length;

        await harness.runCommand("stop");

        // stop persists state even if nothing was running
        expect(harness.appended.length).toBe(appendedBefore + 1);
        expect(harness.notifications.at(-1)?.msg).toContain("paused");
      } finally {
        harness.restoreGlobals();
      }
    });
  });

  describe("reset command", () => {
    it("stops timer, resets to work session", async () => {
      const harness = createHarness();

      try {
        await harness.startSession();
        await harness.runCommand("set 30 10 20");
        await harness.runCommand("start Fix bug");

        harness.intervals[0].cb();
        harness.intervals[0].cb();

        await harness.runCommand("reset");

        expect(harness.intervals[0].cleared).toBe(true);
        expect(harness.statuses.at(-1)?.value).toContain("30:00");
        expect(harness.statuses.at(-1)?.value).toContain("Work");
        expect(harness.statuses.at(-1)?.value).not.toContain("Fix bug");
      } finally {
        harness.restoreGlobals();
      }
    });

    it("clears focus on reset", async () => {
      const harness = createHarness();

      try {
        await harness.startSession();
        await harness.runCommand("focus Important task");
        await harness.runCommand("reset");

        expect(harness.appended.at(-1)?.data.currentFocus).toBe("");
      } finally {
        harness.restoreGlobals();
      }
    });
  });

  describe("status command", () => {
    it("shows running state", async () => {
      const harness = createHarness();

      try {
        await harness.startSession();
        await harness.runCommand("set 25 5 15");
        await harness.runCommand("start");
        await harness.runCommand("status");

        expect(harness.notifications.at(-1)?.msg).toContain("Running");
        expect(harness.notifications.at(-1)?.msg).toContain("25:00");
        expect(harness.notifications.at(-1)?.msg).toContain("work");
      } finally {
        harness.restoreGlobals();
      }
    });

    it("shows paused state with focus", async () => {
      const harness = createHarness();

      try {
        await harness.startSession();
        await harness.runCommand("focus Write tests");
        await harness.runCommand("status");

        expect(harness.notifications.at(-1)?.msg).toContain("Paused");
        expect(harness.notifications.at(-1)?.msg).toContain("Write tests");
      } finally {
        harness.restoreGlobals();
      }
    });

    it("shows break mode", async () => {
      const harness = createHarness();

      try {
        await harness.startSession();
        await harness.runCommand("set 1 5 15");
        await harness.runCommand("start");

        let timer = harness.intervals[harness.intervals.length - 1];
        while (!timer.cleared) timer.cb();

        await harness.runCommand("status");

        expect(harness.notifications.at(-1)?.msg).toContain("break");
      } finally {
        harness.restoreGlobals();
      }
    });
  });

  describe("focus command", () => {
    it("sets focus task", async () => {
      const harness = createHarness();

      try {
        await harness.startSession();
        await harness.runCommand("focus Review PR #42");

        expect(harness.appended.at(-1)?.data.currentFocus).toBe("Review PR #42");
        expect(harness.notifications.at(-1)?.msg).toContain("Review PR #42");
      } finally {
        harness.restoreGlobals();
      }
    });

    it("shows current focus when none provided", async () => {
      const harness = createHarness();

      try {
        await harness.startSession();
        await harness.runCommand("focus Existing task");
        await harness.runCommand("focus");

        expect(harness.notifications.at(-1)?.msg).toContain("Existing task");
      } finally {
        harness.restoreGlobals();
      }
    });

    it("shows help when no focus set and no args", async () => {
      const harness = createHarness();

      try {
        await harness.startSession();
        await harness.runCommand("focus");

        expect(harness.notifications.at(-1)?.msg).toContain("Usage");
      } finally {
        harness.restoreGlobals();
      }
    });
  });

  describe("start command", () => {
    it("accepts inline focus task", async () => {
      const harness = createHarness();

      try {
        await harness.startSession();
        await harness.runCommand("start Deploy v2.0");

        expect(harness.intervals.length).toBe(1);
        expect(harness.statuses.at(-1)?.value).toContain("Deploy v2.0");
      } finally {
        harness.restoreGlobals();
      }
    });

    it("does nothing if timer already running", async () => {
      const harness = createHarness();

      try {
        await harness.startSession();
        await harness.runCommand("set 5 1 1");
        await harness.runCommand("start");
        const intervalsBefore = harness.intervals.length;

        await harness.runCommand("start Another task");

        expect(harness.intervals.length).toBe(intervalsBefore);
      } finally {
        harness.restoreGlobals();
      }
    });
  });

  describe("unknown command", () => {
    it("shows help message", async () => {
      const harness = createHarness();

      try {
        await harness.startSession();
        await harness.runCommand("foobar");

        expect(harness.notifications.at(-1)?.msg).toContain("Pomodoro");
        expect(harness.notifications.at(-1)?.msg).toContain("start");
        expect(harness.notifications.at(-1)?.msg).toContain("stop");
      } finally {
        harness.restoreGlobals();
      }
    });

    it("shows help when called with no args", async () => {
      const harness = createHarness();

      try {
        await harness.startSession();
        await harness.runCommand("");

        expect(harness.notifications.at(-1)?.msg).toContain("pomodoro");
      } finally {
        harness.restoreGlobals();
      }
    });
  });

  describe("state restoration", () => {
    it("restores running timer and resumes countdown", async () => {
      const harness = createHarness([
        {
          type: "custom",
          customType: "pomodoro-state",
          data: { isRunning: true, remainingSeconds: 100 },
        },
      ]);

      try {
        await harness.startSession();

        expect(harness.intervals.length).toBe(1);
        expect(harness.statuses.at(-1)?.value).toContain("●");
      } finally {
        harness.restoreGlobals();
      }
    });

    it("does not auto-start timer when isRunning is false", async () => {
      const harness = createHarness([
        {
          type: "custom",
          customType: "pomodoro-state",
          data: { isRunning: false, remainingSeconds: 50 },
        },
      ]);

      try {
        await harness.startSession();

        expect(harness.intervals.length).toBe(0);
        expect(harness.statuses.at(-1)?.value).toContain("paused");
      } finally {
        harness.restoreGlobals();
      }
    });

    it("merges partial state entries", async () => {
      const harness = createHarness([
        {
          type: "custom",
          customType: "pomodoro-state",
          data: { sessionsCompleted: 2 },
        },
        {
          type: "custom",
          customType: "pomodoro-state",
          data: { currentFocus: "Q4 planning" },
        },
      ]);

      try {
        await harness.startSession();

        // Focus is restored from second entry
        expect(harness.statuses.at(-1)?.value).toContain("Q4 planning");

        // Any command that persists will include the merged state
        await harness.runCommand("focus New focus");
        expect(harness.appended.at(-1)?.data.currentFocus).toBe("New focus");
        expect(harness.appended.at(-1)?.data.sessionsCompleted).toBe(2);
      } finally {
        harness.restoreGlobals();
      }
    });
  });

  describe("session counter accuracy", () => {
    it("tracks sessions completed across multiple cycles", async () => {
      const harness = createHarness();

      try {
        await harness.startSession();
        await harness.runCommand("set 1 1 1");

        for (let i = 1; i <= 3; i++) {
          await harness.runCommand("start Task " + i);
          let timer = harness.intervals[harness.intervals.length - 1];
          while (!timer.cleared) timer.cb();
          await harness.runCommand("start");
          timer = harness.intervals[harness.intervals.length - 1];
          while (!timer.cleared) timer.cb();
        }

        const finalState = harness.appended.at(-1)?.data;
        expect(finalState.sessionsCompleted).toBe(3);
        expect(finalState.sessionsUntilLongBreak).toBe(1);
      } finally {
        harness.restoreGlobals();
      }
    });
  });

  describe("set command edge cases", () => {
    it("updates remaining time when paused", async () => {
      const harness = createHarness();

      try {
        await harness.startSession();
        await harness.runCommand("set 30 10 20");

        expect(harness.statuses.at(-1)?.value).toContain("30:00");
      } finally {
        harness.restoreGlobals();
      }
    });

    it("does not update remaining when running", async () => {
      const harness = createHarness();

      try {
        await harness.startSession();
        await harness.runCommand("start");
        harness.intervals[0].cb();
        await harness.runCommand("set 30 10 20");

        expect(harness.statuses.at(-1)?.value).toContain("24:59");
      } finally {
        harness.restoreGlobals();
      }
    });

    it("does not update remaining during break", async () => {
      const harness = createHarness();

      try {
        await harness.startSession();
        await harness.runCommand("set 1 5 15");
        await harness.runCommand("start");

        let timer = harness.intervals[harness.intervals.length - 1];
        while (!timer.cleared) timer.cb();

        await harness.runCommand("set 30 10 20");

        expect(harness.statuses.at(-1)?.value).toContain("05:00");
      } finally {
        harness.restoreGlobals();
      }
    });
  });

  describe("notification messages", () => {
    it("notifies with focus task when session completes", async () => {
      const harness = createHarness();

      try {
        await harness.startSession();
        await harness.runCommand("set 1 1 1");
        await harness.runCommand("start Ship feature X");

        let timer = harness.intervals[harness.intervals.length - 1];
        while (!timer.cleared) timer.cb();

        const completionNotif = harness.notifications.find(
          (n) => n.msg.includes("Session complete")
        );
        expect(completionNotif?.msg).toContain("Ship feature X");
      } finally {
        harness.restoreGlobals();
      }
    });

    it("notifies break end with correct message", async () => {
      const harness = createHarness();

      try {
        await harness.startSession();
        await harness.runCommand("set 1 1 1");
        await harness.runCommand("start");

        let timer = harness.intervals[harness.intervals.length - 1];
        while (!timer.cleared) timer.cb();

        await harness.runCommand("start");
        timer = harness.intervals[harness.intervals.length - 1];
        while (!timer.cleared) timer.cb();

        expect(harness.notifications.at(-1)?.msg).toBe("Break over! Time to focus.");
      } finally {
        harness.restoreGlobals();
      }
    });
  });

  describe("edge cases", () => {
    it("handles whitespace-only focus", async () => {
      const harness = createHarness();

      try {
        await harness.startSession();
        await harness.runCommand("focus    ");

        expect(harness.notifications.at(-1)?.msg).toContain("Usage");
      } finally {
        harness.restoreGlobals();
      }
    });

    it("persists state after each command", async () => {
      const harness = createHarness();

      try {
        await harness.startSession();

        // session_start persists state
        const afterSessionStart = harness.appended.length;

        await harness.runCommand("focus Task 1");
        const afterFocus = harness.appended.length;
        expect(afterFocus).toBeGreaterThan(afterSessionStart);

        await harness.runCommand("start");
        const afterStart = harness.appended.length;
        expect(afterStart).toBeGreaterThan(afterFocus);

        await harness.runCommand("stop");
        const afterStop = harness.appended.length;
        expect(afterStop).toBeGreaterThan(afterStart);
      } finally {
        harness.restoreGlobals();
      }
    });
  });
});
