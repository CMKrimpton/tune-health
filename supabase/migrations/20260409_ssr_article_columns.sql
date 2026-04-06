-- Add columns needed for SSR article rendering (previously only in JSON files)
ALTER TABLE articles ADD COLUMN IF NOT EXISTS author_name text NOT NULL DEFAULT 'alumi news Editorial';
ALTER TABLE articles ADD COLUMN IF NOT EXISTS author_role text NOT NULL DEFAULT 'Medical Review Board';
ALTER TABLE articles ADD COLUMN IF NOT EXISTS series text;
ALTER TABLE articles ADD COLUMN IF NOT EXISTS series_order integer;
