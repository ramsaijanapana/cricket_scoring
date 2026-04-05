-- TimescaleDB hypertable conversion deferred
-- The delivery table PK is UUID-only; TimescaleDB requires the partition column in the PK.
-- This needs a schema migration to make PK (id, timestamp) before converting.
-- For now, the delivery table works as a regular PostgreSQL table.

CREATE EXTENSION IF NOT EXISTS timescaledb CASCADE;

-- Placeholder: hypertable conversion will be done in a future migration
-- after delivery PK is changed to (id, timestamp)
