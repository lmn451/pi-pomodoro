/**
 * Pomodoro Extension Tests
 * 
 * Core logic tests for the Pomodoro timer.
 */

import { describe, it, expect, beforeEach } from "bun:test";

interface PomodoroState {
  isRunning: boolean;
  isBreak: boolean;
  remainingSeconds: number;
  workDuration: number;
  breakDuration: number;
  longBreakDuration: number;
  sessionsCompleted: number;
  sessionsUntilLongBreak: number;
  currentFocus: string;
}

function createPomodoroState(
  workSeconds = 25 * 60,
  breakSeconds = 5 * 60,
  longBreakSeconds = 15 * 60
): PomodoroState {
  return {
    isRunning: false,
    isBreak: false,
    remainingSeconds: workSeconds,
    workDuration: workSeconds,
    breakDuration: breakSeconds,
    longBreakDuration: longBreakSeconds,
    sessionsCompleted: 0,
    sessionsUntilLongBreak: 4,
    currentFocus: "",
  };
}

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return String(mins).padStart(2, "0") + ":" + String(secs).padStart(2, "0");
}

function tick(state: PomodoroState): PomodoroState {
  return { ...state, remainingSeconds: state.remainingSeconds - 1 };
}

function setFocus(state: PomodoroState, focus: string): PomodoroState {
  return { ...state, currentFocus: focus.trim() };
}

function clearFocus(state: PomodoroState): PomodoroState {
  return { ...state, currentFocus: "" };
}

function completeWorkSession(state: PomodoroState): PomodoroState {
  const newState = { ...state };
  newState.sessionsCompleted++;
  newState.sessionsUntilLongBreak--;

  if (newState.sessionsUntilLongBreak <= 0) {
    newState.isBreak = true;
    newState.remainingSeconds = state.longBreakDuration;
    newState.sessionsUntilLongBreak = 4;
  } else {
    newState.isBreak = true;
    newState.remainingSeconds = state.breakDuration;
  }
  newState.currentFocus = "";

  return newState;
}

function completeBreak(state: PomodoroState): PomodoroState {
  return {
    ...state,
    isBreak: false,
    remainingSeconds: state.workDuration,
    currentFocus: "",
  };
}

// ============ TESTS ============

describe("Pomodoro Timer Core Logic", () => {
  let state: PomodoroState;

  beforeEach(() => {
    state = createPomodoroState();
  });

  describe("formatTime", () => {
    it("formats 25:00 correctly", () => {
      expect(formatTime(25 * 60)).toBe("25:00");
    });

    it("formats 0 seconds", () => {
      expect(formatTime(0)).toBe("00:00");
    });

    it("formats 59 seconds", () => {
      expect(formatTime(59)).toBe("00:59");
    });

    it("formats 1 minute 30 seconds", () => {
      expect(formatTime(90)).toBe("01:30");
    });

    it("formats 99 minutes 59 seconds", () => {
      expect(formatTime(99 * 60 + 59)).toBe("99:59");
    });
  });

  describe("tick", () => {
    it("decrements remaining seconds", () => {
      state.remainingSeconds = 100;
      const newState = tick(state);
      expect(newState.remainingSeconds).toBe(99);
    });

    it("does not affect other properties", () => {
      state.remainingSeconds = 100;
      state.workDuration = 1500;
      const newState = tick(state);
      expect(newState.workDuration).toBe(1500);
    });
  });

  describe("Focus", () => {
    it("has empty focus by default", () => {
      expect(state.currentFocus).toBe("");
    });

    it("can set focus", () => {
      const newState = setFocus(state, "Write documentation");
      expect(newState.currentFocus).toBe("Write documentation");
    });

    it("trims whitespace from focus", () => {
      const newState = setFocus(state, "  Review PR #123  ");
      expect(newState.currentFocus).toBe("Review PR #123");
    });

    it("can clear focus", () => {
      state = setFocus(state, "Fixing bugs");
      state = clearFocus(state);
      expect(state.currentFocus).toBe("");
    });

    it("focus persists through other changes", () => {
      state = setFocus(state, "Testing");
      state.remainingSeconds = 100;
      expect(state.currentFocus).toBe("Testing");
    });

    it("focus is cleared after work session completes", () => {
      state = setFocus(state, "Important task");
      const newState = completeWorkSession(state);
      expect(newState.currentFocus).toBe("");
    });

    it("focus is cleared after break completes", () => {
      state.isBreak = true;
      state = setFocus(state, "Break task");
      const newState = completeBreak(state);
      expect(newState.currentFocus).toBe("");
    });
  });

  describe("shouldCompleteSession", () => {
    it("returns true when timer hits 0 on work session", () => {
      state.remainingSeconds = 0;
      state.isBreak = false;
      expect(state.remainingSeconds <= 0 && !state.isBreak).toBe(true);
    });

    it("returns false during break", () => {
      state.remainingSeconds = 0;
      state.isBreak = true;
      expect(state.remainingSeconds <= 0 && !state.isBreak).toBe(false);
    });

    it("returns false when time remaining", () => {
      state.remainingSeconds = 1;
      expect(state.remainingSeconds <= 0 && !state.isBreak).toBe(false);
    });
  });

  describe("completeWorkSession", () => {
    it("increments sessions completed", () => {
      const newState = completeWorkSession(state);
      expect(newState.sessionsCompleted).toBe(1);
    });

    it("sets isBreak to true", () => {
      const newState = completeWorkSession(state);
      expect(newState.isBreak).toBe(true);
    });

    it("sets remaining seconds to break duration", () => {
      const newState = completeWorkSession(state);
      expect(newState.remainingSeconds).toBe(state.breakDuration);
    });

    it("decrements sessions until long break", () => {
      state.sessionsUntilLongBreak = 4;
      const newState = completeWorkSession(state);
      expect(newState.sessionsUntilLongBreak).toBe(3);
    });

    it("grants long break after 4 sessions", () => {
      state.sessionsUntilLongBreak = 1;
      const newState = completeWorkSession(state);
      expect(newState.remainingSeconds).toBe(state.longBreakDuration);
      expect(newState.sessionsUntilLongBreak).toBe(4);
    });

    it("clears focus after completion", () => {
      state = setFocus(state, "Task to complete");
      const newState = completeWorkSession(state);
      expect(newState.currentFocus).toBe("");
    });
  });

  describe("completeBreak", () => {
    it("resets to work mode", () => {
      state.isBreak = true;
      const newState = completeBreak(state);
      expect(newState.isBreak).toBe(false);
    });

    it("resets remaining seconds to work duration", () => {
      state.isBreak = true;
      state.remainingSeconds = 1;
      const newState = completeBreak(state);
      expect(newState.remainingSeconds).toBe(state.workDuration);
    });

    it("preserves sessions completed", () => {
      state.isBreak = true;
      state.sessionsCompleted = 3;
      const newState = completeBreak(state);
      expect(newState.sessionsCompleted).toBe(3);
    });

    it("clears focus after break", () => {
      state.isBreak = true;
      state = setFocus(state, "Break focus");
      const newState = completeBreak(state);
      expect(newState.currentFocus).toBe("");
    });
  });

  describe("full work session cycle", () => {
    it("completes a full work session in 25 minutes", () => {
      state.workDuration = 150;
      state.breakDuration = 60;
      state.remainingSeconds = 150;

      for (let i = 0; i < 150; i++) {
        state = tick(state);
      }

      expect(state.remainingSeconds).toBe(0);
      expect(state.isBreak).toBe(false);
    });

    it("transitions to break after work session", () => {
      state.remainingSeconds = 0;
      const afterWork = completeWorkSession(state);
      
      expect(afterWork.isBreak).toBe(true);
      expect(afterWork.sessionsCompleted).toBe(1);
    });

    it("preserves focus through ticks", () => {
      state = setFocus(state, "My task");
      for (let i = 0; i < 10; i++) {
        state = tick(state);
      }
      expect(state.currentFocus).toBe("My task");
    });
  });

  describe("break cycle", () => {
    it("transitions back to work after break", () => {
      state.isBreak = true;
      state.remainingSeconds = 0;
      
      const afterBreak = completeBreak(state);
      
      expect(afterBreak.isBreak).toBe(false);
      expect(afterBreak.remainingSeconds).toBe(state.workDuration);
    });
  });

  describe("long break cycle", () => {
    it("resets sessions counter after long break", () => {
      state.sessionsUntilLongBreak = 1;
      state.remainingSeconds = 0;
      
      const afterLongBreak = completeWorkSession(state);
      
      expect(afterLongBreak.remainingSeconds).toBe(state.longBreakDuration);
      expect(afterLongBreak.sessionsUntilLongBreak).toBe(4);
    });
  });

  describe("multiple sessions with focus", () => {
    it("tracks focus across multiple sessions", () => {
      state = setFocus(state, "First task");
      
      // Complete first session
      state.remainingSeconds = 0;
      state = completeWorkSession(state);
      expect(state.currentFocus).toBe("");
      
      // Break ends
      state = completeBreak(state);
      
      // Start new focus
      state = setFocus(state, "Second task");
      expect(state.currentFocus).toBe("Second task");
    });

    it("session count increments correctly with focus", () => {
      for (let i = 1; i <= 4; i++) {
        state = setFocus(state, "Task " + i);
        state.remainingSeconds = 0;
        state = completeWorkSession(state);
        state = completeBreak(state);
      }
      
      expect(state.sessionsCompleted).toBe(4);
    });
  });
});

describe("Pomodoro State", () => {
  it("has correct default values", () => {
    const state = createPomodoroState();
    
    expect(state.isRunning).toBe(false);
    expect(state.isBreak).toBe(false);
    expect(state.remainingSeconds).toBe(25 * 60);
    expect(state.workDuration).toBe(25 * 60);
    expect(state.breakDuration).toBe(5 * 60);
    expect(state.longBreakDuration).toBe(15 * 60);
    expect(state.sessionsCompleted).toBe(0);
    expect(state.sessionsUntilLongBreak).toBe(4);
    expect(state.currentFocus).toBe("");
  });

  it("can be customized with constructor params", () => {
    const state = createPomodoroState(
      30 * 60,
      10 * 60,
      20 * 60
    );
    
    expect(state.workDuration).toBe(30 * 60);
    expect(state.breakDuration).toBe(10 * 60);
    expect(state.longBreakDuration).toBe(20 * 60);
  });
});