# CLAUDE.md - Project Configuration

## Project Overview
Full-stack task management app with React frontend and Python FastAPI backend.

## Tech Stack
- Frontend: React 18 + TypeScript + Vite + TailwindCSS
- Backend: Python 3.12 + FastAPI + SQLAlchemy + PostgreSQL
- Testing: Vitest (frontend), Pytest (backend)
- Deployment: Docker + docker-compose

## Common Commands
Frontend (run in `frontend/`):
- `npm run dev` - Start frontend dev server (http://localhost:5173, proxies `/api` to :8000)
- `npm run test` - Frontend tests
- `npx vitest run src/features/tasks/TasksPage.test.tsx` - Single test file (add `-t "name"` for one test)
- `npm run build` - Type check + production build
- `npm run gen:api` - Regenerate `src/lib/api-types.ts` from the running backend's OpenAPI spec

Backend (run in `backend/`, after `pip install -e ".[dev]"`):
- `uvicorn main:app --reload` - Start backend (OpenAPI docs at http://localhost:8000/docs)
- `pytest` - Backend tests (need Postgres: `docker-compose up -d db`)
- `pytest tests/features/tasks/test_tasks.py::test_delete_task` - Single test
- `alembic upgrade head` - Apply migrations
- `alembic revision --autogenerate -m "message"` - New migration after model changes

Root:
- `docker-compose up` - Full stack (app at http://localhost, API at :8000)
- `docker-compose up -d db` - Just Postgres (also creates the `taskapp_test` database on first start)
- Mailpit catches all outgoing email in development: inbox at http://localhost:8025
- `docker compose run --rm backend python -m app.core.push` - Generate VAPID keys for browser push (put them in the gitignored root `.env`; without them push is simply off)

## Architecture Decisions
- REST API with OpenAPI spec
- JWT authentication
- Repository pattern for data access
- Feature-based folder structure

### How it fits together
- Backend features live in `backend/app/features/<feature>/` as `models.py`, `schemas.py`, `repository.py`, `service.py`, `router.py`. Only repositories touch SQLAlchemy; services hold business rules and raise `ApiError`; routers wire dependencies and wrap results with `ok()`.
- `backend/app/core/` holds the cross-cutting pieces: `envelope.py` (the `Envelope[T]` response model, `ApiError`, and exception handlers that turn every error into the envelope), `schemas.py` (`CamelModel`, the base for every DTO), `deps.py` (`DbSession`, `CurrentUser`), `security.py` (JWT + cookie helpers).
- New models must be imported in `backend/app/models.py` so Alembic and the tests see them.
- Auth: JWTs live in httpOnly cookies (`access_token` 15 min, `refresh_token` 7 days scoped to `/api/auth`). The frontend never sees tokens; `frontend/src/lib/apiClient.ts` retries once after `POST /api/auth/refresh` on a 401.
- Sessions: every login creates a row in `sessions`; both JWTs carry its id (`sid`) and `get_current_session` (`core/deps.py`) rejects revoked sessions, so logout takes effect immediately. Refresh rotates the token (only SHA-256 hashes are stored); a replayed old token revokes the session, except within a 30 s grace window for concurrent tabs.
- Rate limits: `core/rate_limit.py` counts rows in `rate_limit_events` (no Redis). Login allows 5 failures per email+IP and 20 per IP per 15 min, then 429 with `Retry-After`. The client IP comes from nginx via uvicorn `--proxy-headers`.
- Email: `core/email.py` (`Mailer` dependency, SMTP); routes queue messages with `BackgroundTasks`. Templates (PT/EN, by `users.locale`) are in `features/auth/emails.py`. Tests swap the sender for the `outbox` fixture (`tests/conftest.py`), so no test touches SMTP.
- Account (`features/auth/account.py`): password reset (`/auth/password-reset/request` always answers 202 so it never reveals who has an account; single-use 1 h links stored hashed; confirming ends all sessions), password change (ends other sessions), account deletion (needs the password; data goes via ON DELETE CASCADE). Changing or resetting the password emails a notice.
- Scheduled jobs are registered in `core/scheduler.py` (due-date notifications and reminders every minute, daily digest check every 5 min, cleanup daily).
- Reminders (`features/reminders/`): a task's `remind_before_minutes` (needs `due_at`) fires once: `ReminderRepository.claim_due_reminders` inserts the in-app `reminder` notification (the `UNIQUE(task_id, type)` row is the "already sent" marker) and only newly claimed rows get email/push per `notification_preferences`. Reminders over an hour late are dropped. The daily digest emails open overdue+today tasks once per local day at `digest_hour`. Browser push: `core/push.py` (pywebpush, VAPID), subscriptions in `push_subscriptions` (410/404 from the push service deletes them), service worker in `frontend/public/sw.js`. Tests use the `pushbox` fixture instead of real push.
- Notifications: an APScheduler job (`backend/app/features/notifications/scheduler.py`, scheduled by `core/scheduler.py` from the `main.py` lifespan) inserts `due_soon`/`overdue` rows every 60s. `UNIQUE(task_id, type)` + `ON CONFLICT DO NOTHING` keeps it idempotent. Changing a task's `dueAt` deletes its notifications so they regenerate. The frontend polls `GET /api/notifications` every 60s.
- Recurring tasks: completing one (`TaskService.update`) creates the next occurrence and links it via `next_occurrence_id` (prevents duplicates on re-complete); the PATCH response carries it in `meta.nextOccurrence`. Dates come from `tasks/recurrence.py`: always `recurrence_anchor_at + n * step` in `recurrence_timezone`, so month-end and DST don't drift. The anchor only resets when a series field actually changes value.
- i18n (PT/EN): every UI string goes through `t()` from `react-i18next`; strings live in `frontend/src/locales/en.ts` and `pt.ts` (`pt` is typed as `Translation`, so a missing key fails `tsc`). zod messages are translation keys, translated by `Field`. Server errors are shown via `errorMessage()` (`lib/errors.ts`), which translates known `code`s. Language = `users.locale` (null = follow the browser) > localStorage > browser. Tests run in English (`test/setup.ts`); Portuguese is covered in `features/account/language.test.tsx`.
- Frontend features live in `frontend/src/features/<feature>/` (`api.ts` → `hooks.ts` with TanStack Query → components). Routes: `/today` (home; `/` redirects there), `/upcoming`, `/tasks` (filterable list), `/board` (Kanban), `/settings`. Task filters are stored in the URL query string (`features/tasks/useFilterParams.ts`, shared by `/tasks` and `/board`). Today/Upcoming (`features/agenda/`) query `GET /api/tasks?excludeDone=true&dueAfter=…&dueBefore=…` with the browser's local-day boundaries; `useToday()` keeps them stable within a day so query keys (and the cache shared with the nav badge) don't churn. Shared DTO types are in `src/lib/types.ts`.
- The board (`features/board/`) issues one `GET /api/tasks?status=…` per column (config in `columns.ts`) and moves cards with `@dnd-kit/core`. `useMoveTask` updates every cached task list optimistically and rolls back on error.
- Backend tests wrap each test in a rolled-back transaction (`tests/conftest.py`); frontend tests mock the API with MSW (`src/test/server.ts`, `renderWithProviders` in `src/test/render.tsx`).

## Coding Conventions
- Use absolute imports with @ prefix
- All API responses follow {data, error, meta} envelope
- Database models use snake_case, API DTOs use camelCase
- Every endpoint needs input validation with Pydantic
