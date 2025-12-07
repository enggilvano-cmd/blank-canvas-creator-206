-- Fix: Ensure journal_entries table has description column
-- This fixes the "column 'description' does not exist" error when creating transactions

ALTER TABLE public.journal_entries ADD COLUMN IF NOT EXISTS description TEXT NOT NULL DEFAULT '';
