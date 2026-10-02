# Two targets: "prod" (docker-compose.prod.yml) and "dev" (the default, last stage: adds pytest and ruff).
FROM python:3.12-slim AS prod

ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /app
RUN useradd --create-home --uid 1000 app && chown app:app /app

COPY pyproject.toml ./
RUN pip install --no-cache-dir .

COPY --chown=app:app . .
USER app

EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/api/health', timeout=4)"
# A single process, so exactly one scheduler runs.
# --proxy-headers: trust the X-Forwarded-For set by the proxies in front (login rate limits).
# Only the proxy should reach this port; don't publish 8000 publicly in production.
CMD ["sh", "-c", "alembic upgrade head && uvicorn main:app --host 0.0.0.0 --port 8000 --proxy-headers --forwarded-allow-ips='*'"]


FROM prod AS dev
USER root
RUN pip install --no-cache-dir ".[dev]"
USER app
