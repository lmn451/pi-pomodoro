# Plan: pi-pomodro npm Package

## Goals
- Publish as `pi-pomodro` on npm
- Installable via `pi install npm:pi-pomodro`
- Shared with other pi users

## Package Structure

```
pi-pomodro/
├── package.json          # npm manifest + pi config
├── pomodoro.ts           # Extension source
├── pomodoro.test.ts      # Unit tests
├── README.md             # Documentation
├── src/                  # (optional) refactor if needed
├── themes/               # (future) custom theme
└── package-lock.json
```

## package.json

```json
{
  "name": "pi-pomodro",
  "version": "1.0.0",
  "description": "Pomodoro timer extension for pi coding agent",
  "keywords": ["pi-package", "pi", "pomodoro", "timer", "productivity"],
  "main": "pomodoro.ts",
  "type": "module",
  "pi": {
    "extensions": ["./pomodoro.ts"]
  }
}
```

## Todo

- [x] Create extension
- [x] Add tests (36 passing)
- [x] Init git + push to GitHub
- [ ] Update package.json with pi manifest
- [ ] Add npmignore (exclude test files)
- [ ] Version bump + publish
- [ ] Tag release on GitHub

## Publishing Steps

```bash
# 1. Update package.json
# 2. Create .npmignore
npm login
npm publish --access public
```

## Future Enhancements
- Custom pi theme matching Pomodoro states
- Notification sounds
- Stats/history tracking
- `/pomodoro stats` command