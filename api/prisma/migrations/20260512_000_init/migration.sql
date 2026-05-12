-- InsightFlow — initial Postgres schema
-- Generated equivalent of prisma/schema.prisma. Applied by `prisma migrate
-- deploy` on container start (api/Dockerfile) and on local dev with
-- `npm run prisma:migrate:dev`.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- -----------------------------------------------------------------------------
-- Enums
-- -----------------------------------------------------------------------------

CREATE TYPE "workspace_role" AS ENUM ('owner', 'member', 'viewer');
CREATE TYPE "widget_type"   AS ENUM ('kpi', 'line', 'bar', 'funnel', 'cohort', 'forecast', 'table');
CREATE TYPE "alert_method"  AS ENUM ('zscore', 'iqr', 'threshold');
CREATE TYPE "pdf_job_status" AS ENUM ('queued', 'running', 'done', 'failed');

-- -----------------------------------------------------------------------------
-- users
-- -----------------------------------------------------------------------------

CREATE TABLE "users" (
    "id"             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "email"          TEXT NOT NULL UNIQUE,
    "password_hash"  TEXT NOT NULL,
    "display_name"   TEXT,
    "email_verified" BOOLEAN NOT NULL DEFAULT FALSE,
    "created_at"     TIMESTAMPTZ NOT NULL DEFAULT now(),
    "updated_at"     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- -----------------------------------------------------------------------------
-- workspaces
-- -----------------------------------------------------------------------------

CREATE TABLE "workspaces" (
    "id"         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "name"       TEXT NOT NULL,
    "slug"       TEXT NOT NULL UNIQUE,
    "owner_id"   UUID NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- -----------------------------------------------------------------------------
-- workspace_members
-- -----------------------------------------------------------------------------

CREATE TABLE "workspace_members" (
    "id"           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "workspace_id" UUID NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
    "user_id"      UUID NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
    "role"         workspace_role NOT NULL,
    "invited_at"   TIMESTAMPTZ NOT NULL DEFAULT now(),
    "joined_at"    TIMESTAMPTZ,
    UNIQUE ("workspace_id", "user_id")
);
CREATE INDEX "workspace_members_user_id_idx" ON "workspace_members" ("user_id");

-- -----------------------------------------------------------------------------
-- api_keys
-- -----------------------------------------------------------------------------

CREATE TABLE "api_keys" (
    "id"            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "workspace_id"  UUID NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
    "created_by_id" UUID NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
    "name"          TEXT NOT NULL,
    "prefix"        TEXT NOT NULL UNIQUE,
    "hash"          TEXT NOT NULL,
    "scopes"        TEXT[] NOT NULL DEFAULT ARRAY['events:write']::TEXT[],
    "last_used_at"  TIMESTAMPTZ,
    "created_at"    TIMESTAMPTZ NOT NULL DEFAULT now(),
    "revoked_at"    TIMESTAMPTZ
);
CREATE INDEX "api_keys_workspace_id_idx"        ON "api_keys" ("workspace_id");
CREATE INDEX "api_keys_prefix_revoked_at_idx"   ON "api_keys" ("prefix", "revoked_at");

-- -----------------------------------------------------------------------------
-- dashboards
-- -----------------------------------------------------------------------------

CREATE TABLE "dashboards" (
    "id"            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "workspace_id"  UUID NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
    "created_by_id" UUID NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
    "name"          TEXT NOT NULL,
    "description"   TEXT,
    "layout_json"   JSONB NOT NULL DEFAULT '[]'::JSONB,
    "created_at"    TIMESTAMPTZ NOT NULL DEFAULT now(),
    "updated_at"    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX "dashboards_workspace_id_idx" ON "dashboards" ("workspace_id");

-- -----------------------------------------------------------------------------
-- widgets
-- -----------------------------------------------------------------------------

CREATE TABLE "widgets" (
    "id"           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "dashboard_id" UUID NOT NULL REFERENCES "dashboards"("id") ON DELETE CASCADE,
    "type"         widget_type NOT NULL,
    "title"        TEXT NOT NULL,
    "config_json"  JSONB NOT NULL DEFAULT '{}'::JSONB,
    "position_x"   INTEGER NOT NULL DEFAULT 0,
    "position_y"   INTEGER NOT NULL DEFAULT 0,
    "width"        INTEGER NOT NULL DEFAULT 4,
    "height"       INTEGER NOT NULL DEFAULT 3,
    "created_at"   TIMESTAMPTZ NOT NULL DEFAULT now(),
    "updated_at"   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX "widgets_dashboard_id_idx" ON "widgets" ("dashboard_id");

-- -----------------------------------------------------------------------------
-- alerts
-- -----------------------------------------------------------------------------

CREATE TABLE "alerts" (
    "id"               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "workspace_id"     UUID NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
    "name"             TEXT NOT NULL,
    "metric"           TEXT NOT NULL,
    "method"           alert_method NOT NULL,
    "threshold_params" JSONB NOT NULL,
    "channels_json"    JSONB NOT NULL DEFAULT '[]'::JSONB,
    "cooldown_seconds" INTEGER NOT NULL DEFAULT 3600,
    "enabled"          BOOLEAN NOT NULL DEFAULT TRUE,
    "last_fired_at"    TIMESTAMPTZ,
    "created_at"       TIMESTAMPTZ NOT NULL DEFAULT now(),
    "updated_at"       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX "alerts_workspace_id_enabled_idx" ON "alerts" ("workspace_id", "enabled");

-- -----------------------------------------------------------------------------
-- alert_events
-- -----------------------------------------------------------------------------

CREATE TABLE "alert_events" (
    "id"           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "alert_id"     UUID NOT NULL REFERENCES "alerts"("id") ON DELETE CASCADE,
    "workspace_id" UUID NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
    "fired_at"     TIMESTAMPTZ NOT NULL DEFAULT now(),
    "value"        DOUBLE PRECISION NOT NULL,
    "expected"     DOUBLE PRECISION,
    "payload"      JSONB NOT NULL DEFAULT '{}'::JSONB
);
CREATE INDEX "alert_events_workspace_id_fired_at_idx" ON "alert_events" ("workspace_id", "fired_at");
CREATE INDEX "alert_events_alert_id_fired_at_idx"     ON "alert_events" ("alert_id", "fired_at");

-- -----------------------------------------------------------------------------
-- share_links
-- -----------------------------------------------------------------------------

CREATE TABLE "share_links" (
    "id"            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "workspace_id"  UUID NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
    "dashboard_id"  UUID NOT NULL REFERENCES "dashboards"("id") ON DELETE CASCADE,
    "created_by_id" UUID NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
    "token_hash"    TEXT NOT NULL UNIQUE,
    "expires_at"    TIMESTAMPTZ,
    "revoked_at"    TIMESTAMPTZ,
    "created_at"    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX "share_links_workspace_id_idx" ON "share_links" ("workspace_id");
CREATE INDEX "share_links_dashboard_id_idx" ON "share_links" ("dashboard_id");

-- -----------------------------------------------------------------------------
-- pdf_jobs
-- -----------------------------------------------------------------------------

CREATE TABLE "pdf_jobs" (
    "id"               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "workspace_id"     UUID NOT NULL,
    "dashboard_id"     UUID NOT NULL,
    "requested_by_id"  UUID NOT NULL,
    "status"           pdf_job_status NOT NULL DEFAULT 'queued',
    "s3_key"           TEXT,
    "error_message"    TEXT,
    "created_at"       TIMESTAMPTZ NOT NULL DEFAULT now(),
    "completed_at"     TIMESTAMPTZ
);
CREATE INDEX "pdf_jobs_workspace_id_status_idx" ON "pdf_jobs" ("workspace_id", "status");
