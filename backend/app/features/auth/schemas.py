from datetime import datetime
from typing import Literal

from pydantic import EmailStr, Field, field_validator

from app.core.schemas import CamelModel

Locale = Literal["pt", "en"]


class SignupIn(CamelModel):
    email: EmailStr
    name: str = Field(min_length=1, max_length=100)
    password: str = Field(min_length=8, max_length=128)
    locale: Locale | None = None

    @field_validator("email")
    @classmethod
    def normalize_email(cls, v: str) -> str:
        return v.lower()

    @field_validator("name")
    @classmethod
    def strip_name(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("Name must not be blank")
        return v


class LoginIn(CamelModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=128)

    @field_validator("email")
    @classmethod
    def normalize_email(cls, v: str) -> str:
        return v.lower()


class ProfileUpdate(CamelModel):
    name: str | None = Field(default=None, min_length=1, max_length=100)
    locale: Locale | None = None

    @field_validator("name")
    @classmethod
    def strip_name(cls, v: str | None) -> str | None:
        if v is None:
            raise ValueError("Name cannot be null")
        v = v.strip()
        if not v:
            raise ValueError("Name must not be blank")
        return v


class UserOut(CamelModel):
    id: int
    email: str
    name: str
    locale: Locale | None
    created_at: datetime


class PasswordResetRequestIn(CamelModel):
    email: EmailStr
    # Language for the email when the account has none saved (it follows the browser).
    locale: Locale | None = None

    @field_validator("email")
    @classmethod
    def normalize_email(cls, v: str) -> str:
        return v.lower()


class PasswordResetConfirmIn(CamelModel):
    token: str = Field(min_length=1, max_length=200)
    new_password: str = Field(min_length=8, max_length=128)


class PasswordChangeIn(CamelModel):
    current_password: str = Field(min_length=1, max_length=128)
    new_password: str = Field(min_length=8, max_length=128)


class AccountDeleteIn(CamelModel):
    password: str = Field(min_length=1, max_length=128)
