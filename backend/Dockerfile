FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /app

COPY pyproject.toml ./
RUN pip install --no-cache-dir ".[dev]"

COPY . .

EXPOSE 8000
# A single process, so exactly one scheduler runs.
# --proxy-headers: trust nginx's X-Forwarded-For for the client IP (login rate limits).
# Only nginx should reach this port in production; don't publish 8000 publicly.
CMD ["sh", "-c", "alembic upgrade head && uvicorn main:app --host 0.0.0.0 --port 8000 --proxy-headers --forwarded-allow-ips='*'"]
