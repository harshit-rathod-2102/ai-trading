BEGIN;

DO $verify$
BEGIN
    INSERT INTO scan_runs (id, market_date, scanner_version, status, started_at)
    VALUES ('10000000-0000-4000-8000-000000000001', DATE '2000-01-03', 'scanner-v1-duplicate-check', 'STARTED', CURRENT_TIMESTAMP);

    BEGIN
        INSERT INTO scan_runs (id, market_date, scanner_version, status, started_at)
        VALUES ('10000000-0000-4000-8000-000000000002', DATE '2000-01-03', 'scanner-v1-duplicate-check', 'STARTED', CURRENT_TIMESTAMP);
        RAISE EXCEPTION 'duplicate scanner run was unexpectedly accepted';
    EXCEPTION
        WHEN unique_violation THEN
            RAISE NOTICE 'PASS H: duplicate market_date + scanner_version was rejected';
    END;
END;
$verify$;

ROLLBACK;
