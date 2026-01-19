---
name: setup-chess-timer-hooks
description: Install hookify rules for automatic chess timer session management
---

# Setup Chess Timer Hooks

This skill installs hookify rules that make the chess timer fully automatic. No more remembering to start/stop sessions manually!

## What It Does

Installs 3 hookify rules that automatically:
1. **Start sessions** when users request work ("implement X", "fix Y", "add Z")
2. **Complete sessions** when you stop (reminds you to record metrics)
3. **Remind on commits** to complete sessions at natural checkpoints

## Installation

Call the `setup_chess_timer_hooks` MCP tool with action "install":

```typescript
await setup_chess_timer_hooks({ action: 'install' });
```

This copies 3 hookify rules to `~/.claude/`:
- `hookify.chess-timer-start.local.md`
- `hookify.chess-timer-complete.local.md`
- `hookify.chess-timer-commit.local.md`

## How It Works

### Auto-Start (prompt event)
Triggers when users say things like:
- "implement user authentication"
- "fix the bug in checkout"
- "add dark mode toggle"
- "refactor the API layer"

**What you'll see:**
```
🕐 Work Session Start

User is requesting substantive work. Before responding:
1. Call get_active_session to check status
2. If no session exists: Call start_work_session
3. If session is paused: Call resume_work_session
4. If session is active: Continue working
```

### Auto-Complete (stop event)
Triggers when you're about to finish responding.

**What you'll see:**
```
🕐 Session Completion Check

Before stopping, verify work session state:
1. Call get_active_session
2. If session is active: Call complete_work_session with notes
3. If work isn't done: Call pause_work_session instead
```

### Commit Reminder (bash event)
Triggers when running `git commit`.

**What you'll see:**
```
🕐 Session Completion Opportunity

Git commit detected - work may be complete.
After commit succeeds:
1. Call get_active_session
2. If this commit completes the work: Call complete_work_session
3. If continuing with more work: Leave session active
```

## Verification

After installation, test by:
1. User says "build a calculator app"
2. You should see the start hook trigger
3. You start a work session automatically
4. After completing work, the complete hook reminds you to finish the session

## Status Check

Check hook status anytime:
```typescript
await setup_chess_timer_hooks({ action: 'status' });
```

Returns:
- Which hooks are installed
- Whether they're enabled
- Instructions for install/uninstall

## Disabling

Temporarily disable a hook by editing the file and setting `enabled: false`.

Permanently remove all hooks:
```typescript
await setup_chess_timer_hooks({ action: 'uninstall' });
```

## Automagic UX

Once installed, chess timer becomes truly hands-free:
- ✅ Users never need to remember to start sessions
- ✅ You never forget to complete sessions
- ✅ Time tracking happens in the background
- ✅ Predictions improve automatically with each session

This is how chess timer should always work - completely transparent and automatic.
