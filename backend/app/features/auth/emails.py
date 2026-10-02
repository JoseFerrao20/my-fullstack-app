"""Account emails in Portuguese and English."""

from html import escape

from app.core.email import Email

_TEXTS = {
    "en": {
        "reset_subject": "Reset your Task Manager password",
        "reset_body": (
            "Hi {name},\n\nWe received a request to reset your password. "
            "Open this link within {minutes} minutes to choose a new one:\n\n{link}\n\n"
            "If you didn't ask for this, you can ignore this email; your password won't change."
        ),
        "reset_button": "Choose a new password",
        "changed_subject": "Your Task Manager password was changed",
        "changed_body": (
            "Hi {name},\n\nThe password of your account was just changed and you were logged out "
            "on your other devices.\n\nIf this wasn't you, reset your password now: {link}"
        ),
    },
    "pt": {
        "reset_subject": "Redefinir a password do Gestor de Tarefas",
        "reset_body": (
            "Olá {name},\n\nRecebemos um pedido para redefinir a sua password. "
            "Abra este link nos próximos {minutes} minutos para escolher uma nova:\n\n{link}\n\n"
            "Se não fez este pedido, pode ignorar este email; a sua password não muda."
        ),
        "reset_button": "Escolher nova password",
        "changed_subject": "A sua password do Gestor de Tarefas foi alterada",
        "changed_body": (
            "Olá {name},\n\nA password da sua conta acabou de ser alterada e a sessão foi terminada "
            "nos seus outros dispositivos.\n\nSe não foi você, redefina já a password: {link}"
        ),
    },
}


def _texts(locale: str | None) -> dict[str, str]:
    return _TEXTS.get(locale or "en", _TEXTS["en"])


def _html(body: str, link: str, button: str) -> str:
    paragraphs = "".join(f"<p>{escape(p).replace(chr(10), '<br>')}</p>" for p in body.split("\n\n"))
    return (
        '<div style="font-family:system-ui,sans-serif;font-size:15px;line-height:1.5;color:#0f172a">'
        f"{paragraphs}"
        f'<p><a href="{escape(link, quote=True)}" style="display:inline-block;background:#4f46e5;color:#fff;'
        f'padding:10px 16px;border-radius:6px;text-decoration:none">{escape(button)}</a></p></div>'
    )


def password_reset_email(*, to: str, name: str, link: str, minutes: int, locale: str | None) -> Email:
    t = _texts(locale)
    body = t["reset_body"].format(name=name, link=link, minutes=minutes)
    return Email(to=to, subject=t["reset_subject"], text=body, html=_html(body, link, t["reset_button"]))


def password_changed_email(*, to: str, name: str, forgot_link: str, locale: str | None) -> Email:
    t = _texts(locale)
    body = t["changed_body"].format(name=name, link=forgot_link)
    return Email(to=to, subject=t["changed_subject"], text=body)
