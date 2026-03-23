-- Pause cron jobs — Anthropic API spending limit reached until 2026-04-01
SELECT cron.unschedule('article-scout');
SELECT cron.unschedule('article-produce');
