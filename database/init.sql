-- VXLAN Machine Manager - Database Schema
-- PostgreSQL 14+

-- Machinesテーブル
CREATE TABLE IF NOT EXISTS machines (
    id SERIAL PRIMARY KEY,
    hostname VARCHAR(255) NOT NULL,
    ip_address INET NOT NULL UNIQUE,
    mac_address MACADDR NOT NULL,
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'unreachable')),
    last_seen TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    registered_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    extra_data JSONB
);

CREATE INDEX IF NOT EXISTS idx_machines_status ON machines(status);
CREATE INDEX IF NOT EXISTS idx_machines_last_seen ON machines(last_seen);

-- PingStatusテーブル
CREATE TABLE IF NOT EXISTS ping_status (
    id SERIAL PRIMARY KEY,
    machine_id INTEGER NOT NULL REFERENCES machines(id) ON DELETE CASCADE,
    is_alive BOOLEAN NOT NULL,
    response_time FLOAT CHECK (response_time IS NULL OR response_time >= 0),
    checked_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    consecutive_failures INTEGER DEFAULT 0 CHECK (consecutive_failures >= 0),
    next_check_interval INTEGER DEFAULT 60 CHECK (next_check_interval BETWEEN 60 AND 3600)
);

CREATE INDEX IF NOT EXISTS idx_ping_status_machine_checked ON ping_status(machine_id, checked_at DESC);

-- FailureLogsテーブル
CREATE TABLE IF NOT EXISTS failure_logs (
    id SERIAL PRIMARY KEY,
    machine_id INTEGER REFERENCES machines(id) ON DELETE SET NULL,
    hostname VARCHAR(255) NOT NULL,
    ip_address INET NOT NULL,
    mac_address MACADDR NOT NULL,
    failure_detected_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_failure_logs_detected_at ON failure_logs(failure_detected_at DESC);
CREATE INDEX IF NOT EXISTS idx_failure_logs_machine_id ON failure_logs(machine_id);

-- updated_at自動更新トリガー
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_machines_updated_at
    BEFORE UPDATE ON machines
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- 初期データ(オプション - テスト用)
-- INSERT INTO machines (hostname, ip_address, mac_address)
-- VALUES ('test-machine', '192.168.100.10', '00:11:22:33:44:55');
