# Chess Timer Status

Check the current state of work session tracking and prediction accuracy.

## When to Use

Use this skill when:
- User asks about active sessions or time tracking
- User wants to see session history
- User asks how accurate predictions have been

## Instructions

1. Call `get_active_session` to check for ongoing work
2. Call `list_work_sessions` with `status: completed` and `limit: 5` to get recent history
3. Summarize:
   - Current session status (if any)
   - Recent completed sessions with times
   - Brief note on prediction accuracy based on satisfaction ratings

## Example Response

> **Current:** Working on feature/auth (12 minutes so far)
>
> **Recent sessions:**
> - feature/notifications: 23 min
> - bugfix/login-error: 8 min
> - refactor/api-client: 45 min
>
> Predictions have been within range for 4 of the last 5 sessions.
