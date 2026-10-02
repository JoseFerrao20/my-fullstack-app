"""Reminder and digest wording (PT/EN) for email and push."""

from datetime import datetime
from html import escape
from zoneinfo import ZoneInfo

from app.core.email import Email
from app.core.push import PushMessage

_TEXTS = {
    "en": {
        "reminder_title": "Reminder: {title}",
        "reminder_body": "Due {when}",
        "reminder_email": "Hi {name},\n\nThis is your reminder for \"{title}\", due {when}.\n\nOpen it: {link}",
        "digest_subject_one": "Your day: 1 task",
        "digest_subject_other": "Your day: {count} tasks",
        "digest_intro": "Hi {name}, here's what's due today or still overdue:",
        "digest_overdue": "overdue",
        "digest_link": "Open Today",
        "test_title": "Notifications are on",
        "test_body": "You'll get reminders on this device.",
    },
    "pt": {
        "reminder_title": "Lembrete: {title}",
        "reminder_body": "Prazo: {when}",
        "reminder_email": "Olá {name},\n\nEste é o lembrete de «{title}», com prazo {when}.\n\nAbrir: {link}",
        "digest_subject_one": "O seu dia: 1 tarefa",
        "digest_subject_other": "O seu dia: {count} tarefas",
        "digest_intro": "Olá {name}, isto é o que tem para hoje ou ainda em atraso:",
        "digest_overdue": "em atraso",
        "digest_link": "Abrir Hoje",
        "test_title": "Notificações ativas",
        "test_body": "Vai receber lembretes neste dispositivo.",
    },
}

_MONTHS_PT = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"]


def _texts(locale: str | None) -> dict[str, str]:
    return _TEXTS.get(locale or "en", _TEXTS["en"])


def format_when(due_at: datetime, timezone: str, locale: str | None) -> str:
    """Short local date and time, e.g. '6 May, 09:00' / '6 mai, 09:00'."""
    local = due_at.astimezone(ZoneInfo(timezone))
    month = _MONTHS_PT[local.month - 1] if locale == "pt" else local.strftime("%b")
    return f"{local.day} {month}, {local:%H:%M}"


def reminder_push(
    *, title: str, due_at: datetime, timezone: str, locale: str | None, url: str, task_id: int
) -> PushMessage:
    t = _texts(locale)
    return PushMessage(
        title=t["reminder_title"].format(title=title),
        body=t["reminder_body"].format(when=format_when(due_at, timezone, locale)),
        url=url,
        tag=f"task-{task_id}",
    )


def reminder_email(
    *, to: str, name: str, title: str, due_at: datetime, timezone: str, locale: str | None, link: str
) -> Email:
    t = _texts(locale)
    when = format_when(due_at, timezone, locale)
    return Email(
        to=to,
        subject=t["reminder_title"].format(title=title),
        text=t["reminder_email"].format(name=name, title=title, when=when, link=link),
    )


def digest_email(
    *, to: str, name: str, tasks: list[tuple[str, datetime, bool]], timezone: str, locale: str | None, link: str
) -> Email:
    """`tasks` are (title, due_at, overdue) tuples."""
    t = _texts(locale)
    subject = (t["digest_subject_one"] if len(tasks) == 1 else t["digest_subject_other"]).format(count=len(tasks))
    # (title, "6 May, 09:00[, overdue]", overdue) for each task, shared by the text and HTML versions.
    rows = [
        (title, format_when(due, timezone, locale) + (f", {t['digest_overdue']}" if overdue else ""), overdue)
        for title, due, overdue in tasks
    ]
    intro = t["digest_intro"].format(name=name)
    listing = "\n".join(f"- {title} ({when})" for title, when, _ in rows)
    text = f"{intro}\n\n{listing}\n\n{t['digest_link']}: {link}"
    items = "".join(
        f"<li>{escape(title)} <span style=\"color:{'#dc2626' if overdue else '#64748b'}\">({escape(when)})</span></li>"
        for title, when, overdue in rows
    )
    html = (
        '<div style="font-family:system-ui,sans-serif;font-size:15px;line-height:1.5;color:#0f172a">'
        f"<p>{escape(intro)}</p><ul>{items}</ul>"
        f'<p><a href="{escape(link, quote=True)}" style="display:inline-block;background:#4f46e5;color:#fff;'
        f'padding:10px 16px;border-radius:6px;text-decoration:none">{escape(t["digest_link"])}</a></p></div>'
    )
    return Email(to=to, subject=subject, text=text, html=html)


def push_test_message(locale: str | None) -> PushMessage:
    t = _texts(locale)
    return PushMessage(title=t["test_title"], body=t["test_body"], url="/settings", tag="test")
