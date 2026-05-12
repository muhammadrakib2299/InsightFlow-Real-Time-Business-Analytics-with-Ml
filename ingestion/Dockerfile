# syntax=docker/dockerfile:1.7

# -------- base --------
FROM python:3.11-slim AS base
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends \
        curl ca-certificates tini \
    && rm -rf /var/lib/apt/lists/*

# -------- deps --------
FROM base AS deps
COPY requirements.txt ./
RUN pip install -r requirements.txt

# -------- dev (used by docker-compose.dev.yml) --------
FROM deps AS dev
ENV APP_ENV=development
COPY app ./app
EXPOSE 5000
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "5000", "--reload"]

# -------- runtime --------
FROM deps AS runtime
ENV APP_ENV=production
RUN groupadd -r app && useradd -r -g app app
COPY app ./app
USER app
EXPOSE 5000
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "5000", "--workers", "2"]
