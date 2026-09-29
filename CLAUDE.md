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
- Notifications: an APScheduler job (`backend/app/features/notifications/scheduler.py`, started in `main.py` lifespan) inserts `due_soon`/`overdue` rows every 60s. `UNIQUE(task_id, type)` + `ON CONFLICT DO NOTHING` keeps it idempotent. Changing a task's `dueAt` deletes its notifications so they regenerate. The frontend polls `GET /api/notifications` every 60s.
- Frontend features live in `frontend/src/features/<feature>/` (`api.ts` → `hooks.ts` with TanStack Query → components). Task filters are stored in the URL query string. Shared DTO types are in `src/lib/types.ts`.
- Backend tests wrap each test in a rolled-back transaction (`tests/conftest.py`); frontend tests mock the API with MSW (`src/test/server.ts`, `renderWithProviders` in `src/test/render.tsx`).

## Coding Conventions
- Use absolute imports with @ prefix
- All API responses follow {data, error, meta} envelope
- Database models use snake_case, API DTOs use camelCase
- Every endpoint needs input validation with Pydantic
