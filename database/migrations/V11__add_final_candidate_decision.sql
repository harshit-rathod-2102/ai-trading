ALTER TABLE trade_candidates
    DROP CONSTRAINT trade_candidates_status_check;

ALTER TABLE trade_candidates
    ADD CONSTRAINT trade_candidates_status_check CHECK (
        status IN (
            'NEW', 'ANALYZED', 'QUALIFIED', 'WAIT', 'NOTIFIED',
            'ACCEPTED', 'SKIPPED', 'EXPIRED', 'REJECTED'
        )
    ),
    ADD COLUMN decision_snapshot JSONB,
    ADD COLUMN decided_at TIMESTAMPTZ,
    ADD CONSTRAINT candidate_decision_snapshot_object CHECK (
        decision_snapshot IS NULL OR jsonb_typeof(decision_snapshot) = 'object'
    ),
    ADD CONSTRAINT candidate_decision_timestamp_consistent CHECK (
        (decision_snapshot IS NULL AND decided_at IS NULL) OR
        (decision_snapshot IS NOT NULL AND decided_at IS NOT NULL)
    );

ALTER TABLE trade_events
    DROP CONSTRAINT trade_events_event_type_check;

ALTER TABLE trade_events
    ADD CONSTRAINT trade_events_event_type_check CHECK (
        event_type IN (
            'CANDIDATE_CREATED', 'CANDIDATE_QUALIFIED', 'CANDIDATE_WAIT',
            'CANDIDATE_REJECTED', 'CANDIDATE_SKIPPED', 'TRADE_OPENED',
            'STOP_CHANGED', 'TRADE_CLOSED', 'USER_NOTE'
        )
    );

CREATE UNIQUE INDEX uq_event_candidate_final_decision
    ON trade_events (candidate_id)
    WHERE event_type IN ('CANDIDATE_QUALIFIED', 'CANDIDATE_WAIT', 'CANDIDATE_REJECTED');
