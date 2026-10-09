-- Content-free completion observations outlive optional payload retention.
CREATE TABLE request_finish_reasons (
    attempt_id uuid PRIMARY KEY REFERENCES attempts(id) ON DELETE CASCADE,
    choices jsonb NOT NULL CHECK (
        jsonb_typeof(choices) = 'array'
        AND jsonb_array_length(choices) BETWEEN 1 AND 128
    )
);
