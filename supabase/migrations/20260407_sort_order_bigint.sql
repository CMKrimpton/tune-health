-- sort_order stores Date.now() epoch milliseconds (~1.77 trillion)
-- which overflows integer (max 2,147,483,647). Change to bigint.
ALTER TABLE articles ALTER COLUMN sort_order TYPE bigint;
