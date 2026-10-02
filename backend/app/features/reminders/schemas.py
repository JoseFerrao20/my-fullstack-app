from pydantic import Field, field_validator

from app.core.schemas import CamelModel
from app.features.tasks.recurrence import is_valid_timezone


class PreferencesOut(CamelModel):
    email_reminders: bool = True
    push_reminders: bool = True
    daily_digest: bool = False
    digest_hour: int = 8
    timezone: str = "UTC"


class PreferencesUpdate(CamelModel):
    email_reminders: bool | None = None
    push_reminders: bool | None = None
    daily_digest: bool | None = None
    digest_hour: int | None = Field(default=None, ge=0, le=23)
    timezone: str | None = Field(default=None, max_length=64)

    @field_validator("timezone")
    @classmethod
    def check_timezone(cls, v: str | None) -> str | None:
        if v is not None and not is_valid_timezone(v):
            raise ValueError("Unknown time zone")
        return v


class PushKeys(CamelModel):
    p256dh: str = Field(min_length=1, max_length=200)
    auth: str = Field(min_length=1, max_length=100)


class PushSubscriptionIn(CamelModel):
    """The browser's PushSubscription.toJSON() shape."""

    endpoint: str = Field(min_length=1, max_length=1000, pattern=r"^https://")
    keys: PushKeys


class PushUnsubscribeIn(CamelModel):
    endpoint: str = Field(min_length=1, max_length=1000)


class PushConfigOut(CamelModel):
    # None when the server has no VAPID keys: the UI then hides push.
    public_key: str | None
