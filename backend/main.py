import logging
from contextlib import asynccontextmanager

from fastapi import APIRouter, FastAPI

from app import models  # noqa: F401  (register all models on Base.metadata)
from app.core.config import get_settings
from app.core.envelope import register_exception_handlers
from app.core.scheduler import create_scheduler
from app.features.auth.router import router as auth_router
from app.features.calendar_feed.router import public_router as ical_router
from app.features.calendar_feed.router import router as calendar_feed_router
from app.features.categories.router import router as categories_router
from app.features.notifications.router import router as notifications_router
from app.features.reminders.router import router as reminders_router
from app.features.subtasks.router import router as subtasks_router
from app.features.tags.router import router as tags_router
from app.features.tasks.router import router as tasks_router
from app.features.tasks.router import trash_router

logging.basicConfig(level=logging.INFO)


@asynccontextmanager
async def lifespan(_: FastAPI):
    scheduler = create_scheduler() if get_settings().enable_scheduler else None
    if scheduler:
        scheduler.start()
    yield
    if scheduler:
        scheduler.shutdown(wait=False)


app = FastAPI(
    title="Task Manager API",
    version="0.1.0",
    description=(
        "Task management API. Every response uses the `{data, error, meta}` envelope. "
        "Authentication uses httpOnly cookies: call `POST /api/auth/login` first."
    ),
    lifespan=lifespan,
    openapi_tags=[
        {"name": "auth", "description": "Signup, login, logout and session refresh"},
        {"name": "tasks", "description": "Task CRUD with filters, sorting and pagination"},
        {"name": "subtasks", "description": "A task's checklist of steps"},
        {"name": "tags", "description": "Free-form task labels"},
        {"name": "calendar feed", "description": "Private iCal URL to subscribe to tasks from calendar apps"},
        {"name": "categories", "description": "User-defined task categories"},
        {"name": "notifications", "description": "In-app due-date notifications"},
        {"name": "reminders", "description": "Reminder preferences, daily digest and browser push"},
    ],
)
register_exception_handlers(app)

api = APIRouter(prefix="/api")
api.include_router(auth_router)
api.include_router(tasks_router)
api.include_router(subtasks_router)
api.include_router(trash_router)
api.include_router(tags_router)
api.include_router(calendar_feed_router)
api.include_router(ical_router)
api.include_router(categories_router)
api.include_router(notifications_router)
api.include_router(reminders_router)
app.include_router(api)


@app.get("/api/health", tags=["health"])
def health():
    return {"data": {"status": "ok"}, "error": None, "meta": None}
