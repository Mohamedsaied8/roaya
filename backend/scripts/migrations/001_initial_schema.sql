-- Create users table
CREATE TABLE IF NOT EXISTS users (
    id VARCHAR(50) PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    name VARCHAR(255) NOT NULL,
    avatar_url TEXT,
    created_at BIGINT NOT NULL,
    last_login BIGINT NOT NULL
);

-- Index for email lookups
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
