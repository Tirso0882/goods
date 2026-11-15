-- Support cases and their messages. The messages table is the only source of
-- the conversation (ADR 0020). Every table carries the shared columns of
-- docs/design.md, "Data model".

CREATE TABLE support_cases (
    id uuid PRIMARY KEY,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    -- The turn that opened the case.
    correlation_id uuid NOT NULL,
    actor text NOT NULL CHECK (actor IN ('shopper', 'agent', 'operator', 'system')),
    status text NOT NULL CHECK (
        status IN (
            'open', 'agent_working', 'awaiting_approval', 'handed_off', 'failed', 'resolved'
        )
    ),
    retention_class text NOT NULL DEFAULT 'transcript'
        CHECK (retention_class IN ('transcript', 'audit', 'operational')),
    -- Null for guests. Logged-in sessions arrive with J2 in Step 6.
    customer_id text,
    locale text,
    last_activity_at timestamptz NOT NULL DEFAULT now(),
    closed_at timestamptz,
    close_reason text,
    complaint boolean NOT NULL DEFAULT false
);

CREATE TABLE messages (
    id uuid PRIMARY KEY,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    -- The turn the message belongs to: a shopper message and its reply share it.
    correlation_id uuid NOT NULL,
    actor text NOT NULL CHECK (actor IN ('shopper', 'agent', 'operator', 'system')),
    -- A message, once stored, is never edited.
    status text NOT NULL DEFAULT 'stored' CHECK (status IN ('stored')),
    retention_class text NOT NULL DEFAULT 'transcript'
        CHECK (retention_class IN ('transcript', 'audit', 'operational')),
    case_id uuid NOT NULL REFERENCES support_cases (id),
    role text NOT NULL CHECK (role IN ('shopper', 'agent', 'system')),
    content text NOT NULL,
    -- Orders the conversation: two messages of one turn can share a timestamp.
    seq bigint GENERATED ALWAYS AS IDENTITY UNIQUE
);

CREATE INDEX messages_case_id_seq ON messages (case_id, seq);
