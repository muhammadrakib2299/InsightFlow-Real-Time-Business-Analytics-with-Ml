# syntax=docker/dockerfile:1.7

# Prophet pulls cmdstan / stan compilation toolchain at build time, so we
# stick with the slim image and install the toolchain in a builder stage.

# -------- base --------
FROM python:3.11-slim AS base
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends \
        build-essential gcc g++ curl ca-certificates tini \
    && rm -rf /var/lib/apt/lists/*

# -------- deps --------
FROM base AS deps
COPY requirements.txt ./
RUN pip install -r requirements.txt

# -------- dev (used by docker-compose.dev.yml) --------
FROM deps AS dev
ENV APP_ENV=development
COPY app ./app
RUN mkdir -p /app/artifacts
EXPOSE 8000
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]

# -------- runtime --------
FROM deps AS runtime
ENV APP_ENV=production
RUN groupadd -r app && useradd -r -g app app
RUN mkdir -p /app/artifacts && chown -R app:app /app
COPY --chown=app:app app ./app
USER app
EXPOSE 8000
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1"]
