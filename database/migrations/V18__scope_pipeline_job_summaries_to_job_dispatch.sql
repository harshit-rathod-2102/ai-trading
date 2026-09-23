ALTER TABLE pipeline_job_summaries
    ADD COLUMN job_id VARCHAR(255);

UPDATE pipeline_job_summaries
SET job_id = 'legacy-' || id::text
WHERE job_id IS NULL;

ALTER TABLE pipeline_job_summaries
    ALTER COLUMN job_id SET NOT NULL;

ALTER TABLE pipeline_job_summaries
    DROP CONSTRAINT uq_pipeline_job_summaries_run;

ALTER TABLE pipeline_job_summaries
    ADD CONSTRAINT uq_pipeline_job_summaries_run_job UNIQUE (pipeline_run_id, job_id);
