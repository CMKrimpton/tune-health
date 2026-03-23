-- Pause both cron jobs while fixing duplicate detection
SELECT cron.unschedule('article-scout');
SELECT cron.unschedule('article-produce');
