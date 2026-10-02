"""Outgoing email. Routes queue messages with BackgroundTasks so requests never wait on SMTP."""

import logging
import smtplib
from dataclasses import dataclass
from email.message import EmailMessage
from typing import Annotated, Protocol

from fastapi import Depends

from app.core.config import get_settings

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class Email:
    to: str
    subject: str
    text: str
    html: str | None = None


class EmailSender(Protocol):
    def send(self, email: Email) -> None: ...


class SmtpEmailSender:
    def send(self, email: Email) -> None:
        settings = get_settings()
        message = EmailMessage()
        message["From"] = settings.mail_from
        message["To"] = email.to
        message["Subject"] = email.subject
        message.set_content(email.text)
        if email.html:
            message.add_alternative(email.html, subtype="html")
        try:
            with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=10) as smtp:
                if settings.smtp_starttls:
                    smtp.starttls()
                if settings.smtp_user:
                    smtp.login(settings.smtp_user, settings.smtp_password or "")
                smtp.send_message(message)
        except (OSError, smtplib.SMTPException):
            # Runs after the response was sent; log it rather than crash the worker.
            logger.exception("Failed to send email %r to %s", email.subject, email.to)


def get_email_sender() -> EmailSender:
    return SmtpEmailSender()


Mailer = Annotated[EmailSender, Depends(get_email_sender)]
