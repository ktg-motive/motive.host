-- Migration 010: Add profile columns to customers table for account management
alter table customers add column if not exists display_name text;
alter table customers add column if not exists company_name text;
alter table customers add column if not exists phone text;
alter table customers add column if not exists plan_started_at timestamptz;
