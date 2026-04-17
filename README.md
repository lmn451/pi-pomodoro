# Pomodoro Timer Extension for pi

A Pomodoro technique timer extension for the [pi coding agent](https://github.com/badlogic/pi-mono).

## Features

- **Configurable timer**: Set work, break, and long break durations
- **Focus tracking**: Set focus when starting or mid-session
- **Visual status**: Shows timer and focus in the footer status bar
- **Commands**: Use `/pomodoro` for quick actions
- **Persistence**: State survives session restarts
- **Notifications**: Alerts when sessions complete

## Installation

```bash
cp pomodoro.ts ~/.pi/agent/extensions/
pi
```

## Usage

### Commands

| Command | Description |
|---------|-------------|
| `/pomodoro start [focus]` | Start timer, optional focus task |
| `/pomodoro stop` | Pause timer |
| `/pomodoro reset` | Reset to work session |
| `/pomodoro status` | Show current status |
| `/pomodoro focus <task>` | Set/update current focus |
| `/pomodoro set <work> <break> <long>` | Configure durations (minutes) |

### Examples

```bash
# Start with default 25min work session
/pomodoro start

# Start with focus task
/pomodoro start Write API documentation

# Start with focus and default work session
/pomodoro start Fix authentication bug

# Change focus mid-session
/pomodoro focus Review PR #456

# Check current status
/pomodoro status

# Pause timer
/pomodoro stop

# Reset timer
/pomodoro reset

# Configure custom durations
/pomodoro set 30 10 20  # 30min work, 10min break, 20min long break
```

### Keyboard Shortcut

- `Ctrl+Shift+P` - Toggle timer start/stop

## Default Settings

- **Work duration**: 25 minutes
- **Break duration**: 5 minutes
- **Long break**: 15 minutes (after 4 work sessions)

## Files

- `pomodoro.ts` - The extension source
- `pomodoro.test.ts` - Core logic unit tests (36 tests)
- `README.md` - This documentation

## Testing

```bash
bun test
```

All 36 tests pass covering:
- Time formatting
- Timer tick logic
- Focus tracking
- Work/break session transitions
- Long break logic
- State defaults

## Publishing to npm

This repo is configured to publish automatically from GitHub Actions when you push a version tag matching `v*`.

### One-time setup

1. Publish the package once manually if it does not exist on npm yet.
2. On npm, open the package settings and add a **Trusted Publisher**:
   - Provider: **GitHub Actions**
   - Repository: `lmn451/pi-pomodoro`
   - Workflow file: `publish.yml`
3. Make sure the package name `pi-pomodoro` is available to your npm account.

### Release a new version

```bash
npm version patch
git push
git push --tags
```

You can also use `minor` or `major` instead of `patch`.