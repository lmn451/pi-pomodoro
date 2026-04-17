/**
 * Pomodoro Timer Extension for pi
 *
 * Usage:
 *   /pomodoro start [focus]      # Start timer, optional focus task
 *   /pomodoro stop               # Pause timer
 *   /pomodoro reset              # Reset to work session
 *   /pomodoro status             # Show current status
 *   /pomodoro focus <task>       # Set/update focus
 *   /pomodoro set <work> <break> <long>  # Configure durations
 *
 * Examples:
 *   /pomodoro start
 *   /pomodoro start Fix authentication bug
 *   /pomodoro set 30 10 20
 */

export default function (pi: any) {
  const DEFAULT_WORK_SECONDS = 25 * 60;
  const DEFAULT_BREAK_SECONDS = 5 * 60;
  const DEFAULT_LONG_BREAK_SECONDS = 15 * 60;
  const DEFAULT_SESSIONS_UNTIL_LONG = 4;
  const STATUS_KEY = "pomodoro-timer";

  const defaultState = {
    isRunning: false,
    isBreak: false,
    remainingSeconds: DEFAULT_WORK_SECONDS,
    workDuration: DEFAULT_WORK_SECONDS,
    breakDuration: DEFAULT_BREAK_SECONDS,
    longBreakDuration: DEFAULT_LONG_BREAK_SECONDS,
    sessionsCompleted: 0,
    sessionsUntilLongBreak: DEFAULT_SESSIONS_UNTIL_LONG,
    currentFocus: "",
  };

  let state = { ...defaultState };
  let timerInterval: any = null;
  let ctx: any = null;

  function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
  }

  function isPositiveInteger(value: unknown): value is number {
    return Number.isInteger(value) && value > 0;
  }

  function isNonNegativeInteger(value: unknown): value is number {
    return Number.isInteger(value) && value >= 0;
  }

  function parseDurationMinutes(value?: string): number | null {
    if (!value || !/^\d+$/.test(value)) return null;

    const minutes = Number(value);
    return Number.isSafeInteger(minutes) && minutes > 0 ? minutes : null;
  }

  function restoreStateEntry(data: unknown) {
    if (!isRecord(data)) {
      console.warn("Skipping invalid pomodoro state entry:", data);
      return;
    }

    state = {
      ...state,
      ...(typeof data.isRunning === "boolean" ? { isRunning: data.isRunning } : {}),
      ...(typeof data.isBreak === "boolean" ? { isBreak: data.isBreak } : {}),
      ...(isNonNegativeInteger(data.remainingSeconds) ? { remainingSeconds: data.remainingSeconds } : {}),
      ...(isPositiveInteger(data.workDuration) ? { workDuration: data.workDuration } : {}),
      ...(isPositiveInteger(data.breakDuration) ? { breakDuration: data.breakDuration } : {}),
      ...(isPositiveInteger(data.longBreakDuration) ? { longBreakDuration: data.longBreakDuration } : {}),
      ...(isNonNegativeInteger(data.sessionsCompleted) ? { sessionsCompleted: data.sessionsCompleted } : {}),
      ...(isPositiveInteger(data.sessionsUntilLongBreak)
        ? { sessionsUntilLongBreak: data.sessionsUntilLongBreak }
        : {}),
      ...(typeof data.currentFocus === "string" ? { currentFocus: data.currentFocus } : {}),
    };
  }

  function formatTime(seconds: number): string {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return String(mins).padStart(2, "0") + ":" + String(secs).padStart(2, "0");
  }

  function updateStatus() {
    if (!ctx) return;
    const theme = ctx.ui.theme;
    const mode = state.isBreak ? "Break" : "Work";
    const time = formatTime(state.remainingSeconds);
    const focus = state.currentFocus ? " 📋 " + state.currentFocus : "";
    
    if (state.isRunning) {
      ctx.ui.setStatus(STATUS_KEY, theme.fg("accent", "●") + " [Pomodoro " + mode + "] " + time + focus);
    } else {
      ctx.ui.setStatus(STATUS_KEY, "[Pomodoro " + mode + "] " + time + " (paused)" + focus);
    }
  }

  function tickTimer() {
    state.remainingSeconds--;

    if (state.remainingSeconds <= 0) {
      handleTimerComplete();
    } else {
      updateStatus();
    }
  }

  function beginTimerInterval() {
    timerInterval = setInterval(tickTimer, 1000);
  }

  function startTimer(focus?: string) {
    if (timerInterval) return;
    
    if (focus) state.currentFocus = focus.trim();
    
    state.isRunning = true;
    updateStatus();
    persistState();
    beginTimerInterval();
  }

  function stopTimer() {
    if (timerInterval) {
      clearInterval(timerInterval);
      timerInterval = null;
    }
    state.isRunning = false;
    updateStatus();
    persistState();
  }

  function handleTimerComplete() {
    stopTimer();

    const completedFocus = state.currentFocus;

    if (state.isBreak) {
      state.isBreak = false;
      state.remainingSeconds = state.workDuration;
      state.currentFocus = "";
      ctx?.ui.notify("Break over! Time to focus.", "info");
    } else {
      state.sessionsCompleted++;
      state.sessionsUntilLongBreak--;

      if (completedFocus) {
        ctx?.ui.notify("Session complete: " + completedFocus, "success");
      }

      if (state.sessionsUntilLongBreak <= 0) {
        state.isBreak = true;
        state.remainingSeconds = state.longBreakDuration;
        state.sessionsUntilLongBreak = DEFAULT_SESSIONS_UNTIL_LONG;
        ctx?.ui.notify("Work session " + state.sessionsCompleted + " complete! Take a long break.", "success");
      } else {
        state.isBreak = true;
        state.remainingSeconds = state.breakDuration;
        ctx?.ui.notify("Work session " + state.sessionsCompleted + " complete! Take a short break.", "success");
      }
      
      state.currentFocus = "";
    }

    updateStatus();
    persistState();
  }

  function persistState() {
    pi.appendEntry("pomodoro-state", { ...state });
  }

  // Session start - restore state
  pi.on("session_start", async (_event: any, extensionCtx: any) => {
    ctx = extensionCtx;
    
    for (const entry of extensionCtx.sessionManager.getEntries()) {
      if (entry.type === "custom" && entry.customType === "pomodoro-state") {
        restoreStateEntry(entry.data);
      }
    }
    
    if (state.isRunning && !timerInterval) {
      beginTimerInterval();
    }
    
    updateStatus();
  });

  // Register command
  pi.registerCommand("pomodoro", {
    description: "Pomodoro: start [focus] | stop | reset | status | focus <task> | set <work> <break> <long>",
    handler: async (args: string, extensionCtx: any) => {
      ctx = extensionCtx;
      const parts = args.trim().split(/\s+/);
      const action = (parts[0] || "").toLowerCase();

      switch (action) {
        case "start": {
          const focus = parts.slice(1).join(" ") || undefined;
          startTimer(focus);
          
          let msg = "Timer started: " + formatTime(state.remainingSeconds);
          if (state.currentFocus) msg += " [" + state.currentFocus + "]";
          extensionCtx.ui.notify(msg, "info");
          break;
        }

        case "stop":
          stopTimer();
          extensionCtx.ui.notify("Timer paused at " + formatTime(state.remainingSeconds), "info");
          break;

        case "reset":
          stopTimer();
          state.remainingSeconds = state.workDuration;
          state.isBreak = false;
          state.currentFocus = "";
          extensionCtx.ui.notify("Timer reset", "info");
          updateStatus();
          persistState();
          break;

        case "status": {
          const focus = state.currentFocus ? " [" + state.currentFocus + "]" : "";
          extensionCtx.ui.notify(
            (state.isRunning ? "Running" : "Paused") + ": " + 
            formatTime(state.remainingSeconds) + " (" + 
            (state.isBreak ? "break" : "work") + ")" + focus,
            "info"
          );
          break;
        }

        case "focus": {
          const focus = parts.slice(1).join(" ").trim();
          if (focus) {
            state.currentFocus = focus;
            updateStatus();
            extensionCtx.ui.notify("Focus set: " + focus, "info");
            persistState();
          } else if (state.currentFocus) {
            extensionCtx.ui.notify("Current focus: " + state.currentFocus, "info");
          } else {
            extensionCtx.ui.notify("No focus set. Usage: /pomodoro focus <task>", "info");
          }
          break;
        }

        case "set": {
          const workMins = parseDurationMinutes(parts[1]);
          const breakMins = parseDurationMinutes(parts[2]);
          const longMins = parseDurationMinutes(parts[3]);
          
          if (workMins === null || breakMins === null || longMins === null) {
            extensionCtx.ui.notify(
              "Invalid durations. Use: /pomodoro set <work> <break> <long> (positive whole minutes)",
              "info"
            );
            break;
          }
          
          state.workDuration = workMins * 60;
          state.breakDuration = breakMins * 60;
          state.longBreakDuration = longMins * 60;
          
          if (!state.isRunning && !state.isBreak) {
            state.remainingSeconds = state.workDuration;
          }
          
          extensionCtx.ui.notify(
            "Configured: Work " + workMins + "m, Break " + breakMins + "m, Long " + longMins + "m",
            "info"
          );
          updateStatus();
          persistState();
          break;
        }

        default:
          extensionCtx.ui.notify(
            "Pomodoro: /pomodoro start [focus] | stop | reset | status | focus <task> | set <work> <break> <long>",
            "info"
          );
      }
    },
  });

  // Keyboard shortcut
  pi.registerShortcut("ctrl+shift+p", {
    description: "Toggle Pomodoro timer",
    handler: async () => {
      if (state.isRunning) {
        stopTimer();
      } else {
        startTimer();
      }
    },
  });

  // Cleanup on shutdown
  pi.on("session_shutdown", () => {
    if (timerInterval) {
      clearInterval(timerInterval);
      timerInterval = null;
    }
  });
}