ALTER TABLE trade_candidates
    ADD COLUMN notification_snapshot JSONB,
    ADD COLUMN notified_at TIMESTAMPTZ,
    ADD COLUMN notification_provider_message_id VARCHAR(255),
    ADD CONSTRAINT candidate_notification_snapshot_object CHECK (
        notification_snapshot IS NULL OR jsonb_typeof(notification_snapshot) = 'object'
    ),
    ADD CONSTRAINT candidate_notification_metadata_consistent CHECK (
        (notification_snapshot IS NULL AND notified_at IS NULL AND notification_provider_message_id IS NULL) OR
        (notification_snapshot IS NOT NULL AND notified_at IS NOT NULL AND notification_provider_message_id IS NOT NULL)
    );

CREATE UNIQUE INDEX uq_candidate_notification_provider_message
    ON trade_candidates (notification_provider_message_id)
    WHERE notification_provider_message_id IS NOT NULL;

CREATE INDEX idx_candidates_actionable_notification
    ON trade_candidates (status, notified_at, created_at DESC)
    WHERE status IN ('QUALIFIED', 'NOTIFIED');

ALTER TABLE trade_events
    DROP CONSTRAINT trade_events_event_type_check;

ALTER TABLE trade_events
    ADD CONSTRAINT trade_events_event_type_check CHECK (
        event_type IN (
            'CANDIDATE_CREATED', 'CANDIDATE_QUALIFIED', 'CANDIDATE_WAIT',
            'CANDIDATE_REJECTED', 'CANDIDATE_NOTIFIED', 'CANDIDATE_SKIPPED',
            'TRADE_OPENED', 'STOP_CHANGED', 'TRADE_CLOSED', 'USER_NOTE'
        )
    );

CREATE UNIQUE INDEX uq_event_candidate_notified
    ON trade_events (candidate_id)
    WHERE event_type = 'CANDIDATE_NOTIFIED';
