# Bug Report

Every bug below was found by writing tests. All are fixed and covered by regression tests.

## Test results

- **Tests:** 88 passed (3 suites)
- **Coverage:** 97.7% statements, 98.3% branches, 93.9% functions, 97.4% lines
- The only uncovered code is the error handler and the `listen` block in `app.js`.

Run with `npm test` or `npm run coverage`.

## Summary

| # | Bug | Location | Severity |
|---|-----|----------|----------|
| 1 | Pagination offset is off by one page | `taskService.getPaginated` | High |
| 2 | Status filter matches substrings | `taskService.getByStatus` | Medium |
| 3 | Completing a task resets priority | `taskService.completeTask` | High |
| 4 | PUT accepts any field (mass assignment) | `taskService.update` | High |
| 5 | Pagination ignored with a status filter | `routes/tasks.js` | Medium |
| 6 | Weak input validation | `validators.js`, routes | Medium |
| 7 | `completedAt` handled inconsistently | `update`, `completeTask` | Low |

## Details

### 1. Pagination offset is off by one page
- **Expected:** `?page=1&limit=10` returns the first 10 tasks.
- **Actual:** page 1 skips the first `limit` tasks.
- **Cause:** the offset was `page * limit`. Pages are 1-based, so it should be `(page - 1) * limit`.
- **Found by:** a pagination test expected `t1, t2` on page 1 and got `t3, t4`.
- **Fix:** offset is now `(page - 1) * limit`.

### 2. Status filter matches substrings
- **Expected:** `?status=to` returns nothing. Only exact statuses match.
- **Actual:** `to` returns todo tasks, and `o` returns everything.
- **Cause:** the filter used `t.status.includes(status)`, which is a substring check.
- **Found by:** reading the service, then confirmed with a test.
- **Fix:** strict equality, `t.status === status`.

### 3. Completing a task resets priority
- **Expected:** `PATCH /:id/complete` changes only `status` and `completedAt`.
- **Actual:** a `high` priority task becomes `medium` once completed.
- **Cause:** `completeTask` hard-coded `priority: 'medium'` in the updated object.
- **Found by:** a test that completes a `high` priority task and checks the result.
- **Fix:** removed the priority override.

### 4. PUT accepts any field (mass assignment)
- **Expected:** only `title`, `description`, `status`, `priority` and `dueDate` can be updated.
- **Actual:** a client can overwrite `id` and `createdAt`, or add unknown fields. Overwriting `id` can collide with or hijack another task.
- **Cause:** `update` spread the whole request body onto the task.
- **Found by:** a test sending `{ "id": "hijacked" }`.
- **Fix:** `update` copies only a whitelist of updatable fields.

### 5. Pagination ignored with a status filter
- **Expected:** `?status=todo&page=1&limit=2` returns at most 2 todo tasks.
- **Actual:** all matching todo tasks are returned, and `page` and `limit` are ignored.
- **Cause:** the route returned inside the status branch before it reached the pagination branch.
- **Found by:** reading the route, then a test.
- **Fix:** `getPaginated` takes an optional status. It filters first, then slices.

### 6. Weak input validation
- **Expected:** invalid values are rejected with 400.
- **Actual:**
  - `status: ""` and `priority: ""` were accepted.
  - A non-string `dueDate` such as `5` was accepted.
  - `page=-1` and `limit=abc` were silently coerced.
- **Cause:** truthiness checks (`if (body.status && ...)`) skip empty strings, `dueDate` type was never checked, and pagination values were never validated.
- **Found by:** table-driven validator and API tests.
- **Fix:**
  - `status` and `priority` are validated whenever they are present.
  - `dueDate` must be a parseable date string or `null`.
  - `page` and `limit` must be positive integers, otherwise 400.

### 7. `completedAt` handled inconsistently
- **Expected:** `completedAt` is set when a task first becomes done, and cleared when it stops being done.
- **Actual:**
  - PUT with `status: 'done'` left `completedAt` null.
  - Moving a task back from done left a stale `completedAt`.
  - Calling `/complete` twice overwrote the original timestamp.
- **Cause:** only `completeTask` touched `completedAt`, and it always wrote a new value.
- **Found by:** service tests on status transitions.
- **Fix:**
  - PUT sets `completedAt` when moving to done, and clears it when moving to another status.
  - `/complete` keeps an existing `completedAt`.

## New feature: `PATCH /tasks/:id/assign`

Body: `{ "assignee": "string" }`. Returns the updated task.

| Case | Result |
|------|--------|
| Valid name | 200, assignee stored trimmed |
| Unknown task | 404 |
| Empty, whitespace-only, missing or non-string assignee | 400 |
| Assignee longer than 100 characters | 400 |
| Task already assigned | 200, assignee is replaced |

Design decisions:
- **Validation before lookup:** a bad body on an unknown id returns 400, not 404.
- **Re-assignment replaces the assignee** instead of returning 409. Handing a task to someone else is a normal workflow. It is a one-line change if the product wants otherwise.
- **100-character limit** keeps the field bounded.

## Submission notes

**What I would test next**
- Malformed JSON bodies, which go through the error handler in `app.js`.
- Concurrent requests.
- A larger pagination matrix.

**What surprised me**
- Pagination was off by one page.
- `completeTask` silently changed priority.
- `update` trusted the whole request body.

**Questions before shipping**
- Is there a persistence plan? Data is lost on every restart.
- Is there authentication or authorisation? Anyone can edit or assign any task.
- Should assignees be validated against a user list?
- Should `limit` have an upper bound?
- Should an unknown `status` filter value return 400 instead of an empty list?
