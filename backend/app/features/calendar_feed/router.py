"""Private iCal feed: subscribe to your tasks from Google Calendar, Outlook or Apple Calendar."""

import secrets
from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Response
from sqlalchemy import or_, select

from app.core.config import get_settings
from app.core.deps import CurrentUser, DbSession
from app.core.envelope import ApiError, Envelope, ok
from app.core.schemas import CamelModel
from app.core.security import hash_token
from app.features.auth.models import User
from app.features.calendar_feed.ics import FeedEvent, build_calendar
from app.features.reminders.repository import PreferencesRepository
from app.features.tasks.models import Task, TaskStatus

router = APIRouter(prefix="/calendar-feed", tags=["calendar feed"])
public_router = APIRouter(prefix="/ical", tags=["calendar feed"])

# Completed tasks stay visible in the calendar for a while, then drop out of the feed.
KEEP_DONE_FOR = timedelta(days=30)


class FeedStatusOut(CamelModel):
    enabled: bool
    created_at: datetime | None


class FeedCreatedOut(FeedStatusOut):
    # Shown once: only a hash of the token is stored.
    url: str


def _feed_url(token: str) -> str:
    return f"{get_settings().app_base_url.rstrip('/')}/api/ical/{token}.ics"


@router.get("", response_model=Envelope[FeedStatusOut])
def feed_status(user: CurrentUser):
    return ok(FeedStatusOut(enabled=user.calendar_feed_token_hash is not None, created_at=user.calendar_feed_created_at))


@router.post("", response_model=Envelope[FeedCreatedOut])
def create_feed(user: CurrentUser, db: DbSession):
    """Create (or replace) the feed URL. Any previous URL stops working."""
    token = secrets.token_urlsafe(32)
    user.calendar_feed_token_hash = hash_token(token)
    user.calendar_feed_created_at = datetime.now(UTC)
    db.commit()
    return ok(FeedCreatedOut(enabled=True, created_at=user.calendar_feed_created_at, url=_feed_url(token)))


@router.delete("", response_model=Envelope[None])
def delete_feed(user: CurrentUser, db: DbSession):
    """Turn the feed off; the URL stops working."""
    user.calendar_feed_token_hash = None
    user.calendar_feed_created_at = None
    db.commit()
    return ok(None)


@public_router.get("/{token}.ics", include_in_schema=True, response_class=Response)
def calendar_file(token: str, db: DbSession):
    """The feed itself (no login: the secret URL is the credential)."""
    user = db.scalar(select(User).where(User.calendar_feed_token_hash == hash_token(token)))
    if user is None:
        raise ApiError(404, "NOT_FOUND", "Unknown calendar feed")

    now = datetime.now(UTC)
    prefs = PreferencesRepository(db).get(user.id)
    default_tz = prefs.timezone if prefs else "UTC"
    tasks = db.scalars(
        select(Task)
        .where(
            Task.user_id == user.id,
            Task.deleted_at.is_(None),
            Task.due_at.is_not(None),
            or_(Task.status != TaskStatus.DONE, Task.due_at >= now - KEEP_DONE_FOR),
        )
        .order_by(Task.due_at, Task.id)
    ).unique()
    host = get_settings().app_base_url.rstrip("/")
    events = [
        FeedEvent(
            uid=f"task-{t.id}@{host.split('://')[-1]}",
            title=t.title,
            due_at=t.due_at,
            updated_at=t.updated_at,
            timezone=t.recurrence_timezone or default_tz,
            done=t.status == TaskStatus.DONE,
            description=t.description,
            categories=tuple(([t.category.name] if t.category else []) + [tag.name for tag in t.tags]),
            recurrence=t.recurrence.value if t.recurrence else None,
            recurrence_interval=t.recurrence_interval,
            url=f"{host}/today",
        )
        for t in tasks
        if t.due_at is not None
    ]
    body = build_calendar(f"Task Manager – {user.name}", events, now)
    return Response(
        content=body,
        media_type="text/calendar; charset=utf-8",
        headers={"Content-Disposition": 'inline; filename="tasks.ics"', "Cache-Control": "private, max-age=300"},
    )
