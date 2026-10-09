-- Member-owned profile data; installation credentials are not a person.
CREATE TABLE member_profiles (
    operator_id UUID PRIMARY KEY REFERENCES admin_operators(id),
    avatar_data_url TEXT CHECK (avatar_data_url IS NULL OR (
        avatar_data_url LIKE 'data:image/png;base64,%'
        AND octet_length(avatar_data_url) <= 175000
    )),
    revision BIGINT NOT NULL DEFAULT 0 CHECK (revision >= 0),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);
