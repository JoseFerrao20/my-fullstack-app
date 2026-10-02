import pytest

from app.core.config import Settings, check_production_settings

GOOD = dict(
    environment="production",
    jwt_secret="x" * 48,
    cookie_secure=True,
    app_base_url="https://tasks.example.com",
    smtp_host="smtp-relay.brevo.com",
    # Explicit, so a DISABLE_RATE_LIMITS=true in the test machine's environment can't leak in.
    disable_rate_limits=False,
)


def test_development_is_never_blocked():
    assert Settings(environment="development").production_problems() == []


def test_a_good_production_config_starts():
    check_production_settings(Settings(**GOOD))


@pytest.mark.parametrize(
    ("override", "message"),
    [
        ({"jwt_secret": "dev-only-insecure-secret-change-me-in-production"}, "JWT_SECRET"),
        ({"jwt_secret": "too-short"}, "JWT_SECRET"),
        ({"cookie_secure": False}, "COOKIE_SECURE"),
        ({"app_base_url": "http://1-2-3-4.sslip.io"}, "APP_BASE_URL"),
        ({"disable_rate_limits": True}, "DISABLE_RATE_LIMITS"),
        ({"smtp_host": "mailpit"}, "SMTP_HOST"),
    ],
)
def test_unsafe_production_settings_refuse_to_start(override, message):
    with pytest.raises(RuntimeError, match=message):
        check_production_settings(Settings(**{**GOOD, **override}))
