/**
 * Shared test harness for Pomodoro extension tests.
 * Used by integration and security test suites.
 */

import pomodoro from "../pomodoro";

type Entry = {
  type: string;
  customType?: string;
  data?: unknown;
};

export function createHarness(entries: Entry[] = []) {
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
