ALTER TABLE trade_events
    DROP CONSTRAINT trade_events_event_type_check;

ALTER TABLE trade_events
    ADD CONSTRAINT trade_events_event_type_check CHECK (
        event_type IN (
            'CANDIDATE_CREATED', 'CANDIDATE_QUALIFIED', 'CANDIDATE_WAIT',
            'CANDIDATE_REJECTED', 'CANDIDATE_NOTIFIED', 'CANDIDATE_ANALYSIS_FAILED',
            'CANDIDATE_SKIPPED', 'TRADE_OPENED', 'STOP_CHANGED', 'TRADE_CLOSED', 'USER_NOTE',
            'PRICE_MILESTONE_REACHED', 'ADVERSE_MOVE_OBSERVED',
            'STOP_PROXIMITY_OBSERVED', 'STOP_BREACHED_OBSERVED',
            'TARGET1_REACHED', 'TARGET2_REACHED'
        )
    );

CREATE UNIQUE INDEX uq_event_candidate_analysis_issue
    ON trade_events (candidate_id, (data -> 'issue' ->> 'kind'), (data -> 'issue' ->> 'code'))
    WHERE event_type = 'CANDIDATE_ANALYSIS_FAILED';
