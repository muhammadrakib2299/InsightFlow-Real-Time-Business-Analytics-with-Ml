-- =============================================================================
-- InsightFlow — ClickHouse schema
-- =============================================================================
-- Applied by ClickHouse on first start (mounted into /docker-entrypoint-initdb.d).
-- Tenant isolation: every table has workspace_id as the first ORDER BY column
-- (see docs/ADR-005-multitenant-row-level.md).
-- =============================================================================

create database if not exists insightflow;

-- -----------------------------------------------------------------------------
-- events — raw event store
-- -----------------------------------------------------------------------------
-- ReplacingMergeTree gives idempotency on (workspace_id, event_id): re-processing
-- Kafka offsets after a consumer crash will not double-count.
-- Partitioned monthly so retention (18 months) drops whole partitions.
-- -----------------------------------------------------------------------------

create table if not exists insightflow.events (
    workspace_id    UUID,
    event_id        UUID,
    event_name      LowCardinality(String),
    user_id         String,
    session_id      String,
    occurred_at     DateTime64(3, 'UTC'),
    ingested_at     DateTime64(3, 'UTC') default now64(),
    properties      Map(String, String),
    revenue_cents   Int64 default 0,
    currency        LowCardinality(String) default '',
    country         LowCardinality(String) default '',
    city            LowCardinality(String) default '',
    device          LowCardinality(String) default '',
    os              LowCardinality(String) default '',
    browser         LowCardinality(String) default '',
    utm_source      LowCardinality(String) default '',
    utm_medium      LowCardinality(String) default '',
    utm_campaign    LowCardinality(String) default '',
    utm_term        LowCardinality(String) default '',
    utm_content     LowCardinality(String) default ''
) engine = ReplacingMergeTree(ingested_at)
order by (workspace_id, event_name, occurred_at, event_id)
partition by toYYYYMM(occurred_at)
ttl toDateTime(occurred_at) + INTERVAL 18 MONTH
settings index_granularity = 8192;

-- -----------------------------------------------------------------------------
-- mv_kpi_hourly — per-hour KPI rollup
-- -----------------------------------------------------------------------------
-- Powers KPI tiles (MRR, ARPU, DAU, event count) at hourly resolution.
-- AggregatingMergeTree with -State combinators so we can roll up further on
-- read (e.g. daily / weekly) without re-scanning raw events.
-- -----------------------------------------------------------------------------

create table if not exists insightflow.kpi_hourly (
    workspace_id    UUID,
    event_name      LowCardinality(String),
    hour            DateTime,
    event_count     AggregateFunction(count, UInt64),
    revenue_cents   AggregateFunction(sum, Int64),
    unique_users    AggregateFunction(uniq, String),
    unique_sessions AggregateFunction(uniq, String)
) engine = AggregatingMergeTree()
order by (workspace_id, event_name, hour)
partition by toYYYYMM(hour);

create materialized view if not exists insightflow.mv_kpi_hourly
to insightflow.kpi_hourly as
select
    workspace_id,
    event_name,
    toStartOfHour(occurred_at) as hour,
    countState() as event_count,
    sumState(revenue_cents) as revenue_cents,
    uniqState(user_id) as unique_users,
    uniqState(session_id) as unique_sessions
from insightflow.events
group by workspace_id, event_name, hour;

-- -----------------------------------------------------------------------------
-- mv_cohort_daily — signup-cohort × activity-day retention
-- -----------------------------------------------------------------------------
-- Counts each user under their *signup* day cohort and the day they were
-- active. We derive signup_day from a user's earliest event in the events
-- table — the BFF rolls these into the heatmap on read.
-- -----------------------------------------------------------------------------

create table if not exists insightflow.cohort_daily (
    workspace_id    UUID,
    signup_day      Date,
    activity_day    Date,
    active_users    AggregateFunction(uniq, String)
) engine = AggregatingMergeTree()
order by (workspace_id, signup_day, activity_day)
partition by toYYYYMM(signup_day);

create materialized view if not exists insightflow.mv_cohort_daily
to insightflow.cohort_daily as
with first_seen as (
    select workspace_id, user_id, toDate(min(occurred_at)) as signup_day
    from insightflow.events
    where user_id != ''
    group by workspace_id, user_id
)
select
    e.workspace_id as workspace_id,
    fs.signup_day  as signup_day,
    toDate(e.occurred_at) as activity_day,
    uniqState(e.user_id) as active_users
from insightflow.events e
inner join first_seen fs
    on e.workspace_id = fs.workspace_id and e.user_id = fs.user_id
where e.user_id != ''
group by workspace_id, signup_day, activity_day;

-- -----------------------------------------------------------------------------
-- mv_funnel_step_daily — placeholder, populated in M5
-- -----------------------------------------------------------------------------
-- Funnel widgets compute on-read using `windowFunnel()` against the raw events
-- table — this MV is a future optimisation for popular funnels. For now we
-- create the destination table so the schema is stable.
-- -----------------------------------------------------------------------------

create table if not exists insightflow.funnel_step_daily (
    workspace_id    UUID,
    funnel_id       UUID,
    step_index      UInt8,
    day             Date,
    reached_users   AggregateFunction(uniq, String)
) engine = AggregatingMergeTree()
order by (workspace_id, funnel_id, day, step_index)
partition by toYYYYMM(day);

-- Materialized view to populate funnel_step_daily is created at funnel-save
-- time by the API service (it depends on a user-defined event sequence and
-- cannot be a single static query). The empty destination table above lets
-- the read path query a stable schema while a funnel is being built.

-- -----------------------------------------------------------------------------
-- Helper views — read-friendly merge-aggregated facades
-- -----------------------------------------------------------------------------

create view if not exists insightflow.v_kpi_hourly as
select
    workspace_id,
    event_name,
    hour,
    countMerge(event_count)       as event_count,
    sumMerge(revenue_cents)       as revenue_cents,
    uniqMerge(unique_users)       as unique_users,
    uniqMerge(unique_sessions)    as unique_sessions
from insightflow.kpi_hourly
group by workspace_id, event_name, hour;

create view if not exists insightflow.v_cohort_daily as
select
    workspace_id,
    signup_day,
    activity_day,
    uniqMerge(active_users) as active_users
from insightflow.cohort_daily
group by workspace_id, signup_day, activity_day;
