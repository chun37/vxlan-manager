# Data Model: VXLANマシン管理システム

**Feature**: VXLANマシン管理システム
**Date**: 2025-10-18

## Overview

このドキュメントは、VXLANマシン管理システムで使用されるデータエンティティとその関係を定義します。PostgreSQL 14+を使用し、すべてのモデルはPydantic(バリデーション)とSQLAlchemy(ORM)の両方で表現されます。

## Entity Relationship Diagram

```
┌─────────────────────────────────┐
│         Machine                 │
│─────────────────────────────────│
│ • id: SERIAL PK                 │
│ • hostname: VARCHAR(255)        │
│ • ip_address: INET (UNIQUE)     │
│ • mac_address: MACADDR          │
│ • status: VARCHAR(20)           │
│ • last_seen: TIMESTAMP          │
│ • registered_at: TIMESTAMP      │
│ • updated_at: TIMESTAMP         │
│ • extra_data: JSONB             │
└─────────────┬───────────────────┘
              │ 1
              │
              │ has many
              │
              ▼ *
┌─────────────────────────────────┐
│       PingStatus                │
│─────────────────────────────────│
│ • id: SERIAL PK                 │
│ • machine_id: INT FK            │
│ • is_alive: BOOLEAN             │
│ • response_time: FLOAT          │
│ • checked_at: TIMESTAMP         │
│ • consecutive_failures: INT     │
│ • next_check_interval: INT      │
└─────────────────────────────────┘
              │
              │ logged to
              │
              ▼
┌─────────────────────────────────┐
│       FailureLog                │
│─────────────────────────────────│
│ • id: SERIAL PK                 │
│ • machine_id: INT FK            │
│ • hostname: VARCHAR(255)        │
│ • ip_address: INET              │
│ • mac_address: MACADDR          │
│ • failure_detected_at: TIMESTAMP│
└─────────────────────────────────┘
```

## Entities

### Machine (マシン)

**Purpose**: VXLANネットワーク内の管理対象デバイスを表現

**Attributes**:

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| id | SERIAL | PRIMARY KEY | 自動採番の一意識別子 |
| hostname | VARCHAR(255) | NOT NULL | マシンのホスト名 |
| ip_address | INET | NOT NULL, UNIQUE | IPアドレス(一意識別子、Upsertキー) |
| mac_address | MACADDR | NOT NULL | MACアドレス |
| status | VARCHAR(20) | DEFAULT 'active' | 接続状態: 'active' / 'unreachable' |
| last_seen | TIMESTAMP WITH TIME ZONE | DEFAULT CURRENT_TIMESTAMP | 最後に確認された日時 |
| registered_at | TIMESTAMP WITH TIME ZONE | DEFAULT CURRENT_TIMESTAMP | 初回登録日時 |
| updated_at | TIMESTAMP WITH TIME ZONE | DEFAULT CURRENT_TIMESTAMP | 最終更新日時 |
| extra_data | JSONB | NULLABLE | 将来の拡張用フリーフォーマットデータ |

**Indexes**:
- `idx_machines_status` on `status` - 状態別検索の高速化
- `idx_machines_last_seen` on `last_seen` - 最終確認時刻でのソート高速化
- `idx_machines_ip_address` on `ip_address` (UNIQUE) - IP検索とUpsert高速化

**Validation Rules**:
- `ip_address`: 有効なIPv4/IPv6形式 (Pydanticで `ipaddress.IPv4Address` または `IPv6Address`)
- `mac_address`: 有効なMAC形式 (Pydanticで正規表現 `^([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})$`)
- `hostname`: 1-255文字、空文字列不可
- `status`: 'active' または 'unreachable' のみ許可

**State Transitions**:
```
   [New Machine]
        ↓
   (registered)
        ↓
    'active' ←──────┐
        │           │
        │ (3 consecutive │
        │  ping failures) │
        ↓           │
  'unreachable' ────┘
    (ping success)
```

**Business Rules**:
- IPアドレスは一意であり、同一IPでの再登録は既存エントリを更新(Upsert)
- マシンが削除されても、関連するFailureLogは履歴として保持(ON DELETE CASCADEは使わない)
- `updated_at`は登録情報更新時に自動更新(PostgreSQL TRIGGERまたはアプリケーションロジック)

---

### PingStatus (接続状態)

**Purpose**: 各マシンの死活監視結果を記録

**Attributes**:

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| id | SERIAL | PRIMARY KEY | 自動採番の一意識別子 |
| machine_id | INTEGER | FOREIGN KEY (machines.id) ON DELETE CASCADE | 対象マシンへの参照 |
| is_alive | BOOLEAN | NOT NULL | ping成功=true, 失敗=false |
| response_time | FLOAT | NULLABLE | ping応答時間(ミリ秒)、失敗時はNULL |
| checked_at | TIMESTAMP WITH TIME ZONE | DEFAULT CURRENT_TIMESTAMP | ping実行日時 |
| consecutive_failures | INTEGER | DEFAULT 0 | 連続失敗回数(成功時に0にリセット) |
| next_check_interval | INTEGER | DEFAULT 60 | 次回チェックまでの秒数 |

**Indexes**:
- `idx_ping_status_machine_checked` on `(machine_id, checked_at DESC)` - マシンごとの最新状態取得の高速化

**Validation Rules**:
- `response_time`: 0以上、`is_alive=false`の場合はNULL
- `consecutive_failures`: 0以上
- `next_check_interval`: 60 ≤ interval ≤ 3600 (秒)

**Business Rules**:
- 各マシンの最新のPingStatusレコードが現在の監視状態を表す
- `consecutive_failures >= 3` の場合、Machineのstatusを'unreachable'に更新し、FailureLogに記録
- Exponential Backoff: `next_check_interval = min(60 * (2 ** consecutive_failures), 3600)`
  - 0回失敗: 60秒
  - 1回失敗: 120秒
  - 2回失敗: 240秒
  - 3回失敗: 480秒
  - 4回失敗: 960秒
  - 5回失敗: 1920秒
  - 6回以降: 3600秒(上限)

---

### FailureLog (障害ログ)

**Purpose**: 接続不可と判定されたマシンの履歴を記録(監査・分析用)

**Attributes**:

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| id | SERIAL | PRIMARY KEY | 自動採番の一意識別子 |
| machine_id | INTEGER | FOREIGN KEY (machines.id) | 対象マシンへの参照(削除後もログ保持) |
| hostname | VARCHAR(255) | NOT NULL | 障害発生時のホスト名(スナップショット) |
| ip_address | INET | NOT NULL | 障害発生時のIPアドレス(スナップショット) |
| mac_address | MACADDR | NOT NULL | 障害発生時のMACアドレス(スナップショット) |
| failure_detected_at | TIMESTAMP WITH TIME ZONE | DEFAULT CURRENT_TIMESTAMP | 接続不可判定日時 |

**Indexes**:
- `idx_failure_logs_detected_at` on `failure_detected_at DESC` - 時系列での検索高速化
- `idx_failure_logs_machine_id` on `machine_id` - マシンごとの障害履歴取得

**Validation Rules**:
- すべてのフィールドが必須(Machineからのスナップショットのため)

**Business Rules**:
- レコードは`consecutive_failures = 3`に達した時点で1回だけ作成
- マシンが削除されてもログは保持(外部キー制約でON DELETE SET NULLまたはNO ACTION)
- 定期的なアーカイブ処理が推奨(例: 6ヶ月以上前のログを別テーブルへ移動)

---

## Database Schema (SQL)

```sql
-- Machinesテーブル
CREATE TABLE machines (
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

CREATE INDEX idx_machines_status ON machines(status);
CREATE INDEX idx_machines_last_seen ON machines(last_seen);

-- PingStatusテーブル
CREATE TABLE ping_status (
    id SERIAL PRIMARY KEY,
    machine_id INTEGER NOT NULL REFERENCES machines(id) ON DELETE CASCADE,
    is_alive BOOLEAN NOT NULL,
    response_time FLOAT CHECK (response_time IS NULL OR response_time >= 0),
    checked_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    consecutive_failures INTEGER DEFAULT 0 CHECK (consecutive_failures >= 0),
    next_check_interval INTEGER DEFAULT 60 CHECK (next_check_interval BETWEEN 60 AND 3600)
);

CREATE INDEX idx_ping_status_machine_checked ON ping_status(machine_id, checked_at DESC);

-- FailureLogsテーブル
CREATE TABLE failure_logs (
    id SERIAL PRIMARY KEY,
    machine_id INTEGER REFERENCES machines(id) ON DELETE SET NULL,
    hostname VARCHAR(255) NOT NULL,
    ip_address INET NOT NULL,
    mac_address MACADDR NOT NULL,
    failure_detected_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_failure_logs_detected_at ON failure_logs(failure_detected_at DESC);
CREATE INDEX idx_failure_logs_machine_id ON failure_logs(machine_id);

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
```

## Pydantic Models (Example)

```python
from datetime import datetime
from typing import Optional
from pydantic import BaseModel, Field, IPvAnyAddress, field_validator
import re

class MachineBase(BaseModel):
    hostname: str = Field(..., min_length=1, max_length=255)
    ip_address: IPvAnyAddress
    mac_address: str
    extra_data: Optional[dict] = None

    @field_validator('mac_address')
    @classmethod
    def validate_mac(cls, v: str) -> str:
        pattern = r'^([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})$'
        if not re.match(pattern, v):
            raise ValueError('Invalid MAC address format')
        return v.lower()

class MachineCreate(MachineBase):
    pass

class MachineUpdate(BaseModel):
    hostname: Optional[str] = Field(None, min_length=1, max_length=255)
    mac_address: Optional[str] = None
    extra_data: Optional[dict] = None

class MachineInDB(MachineBase):
    id: int
    status: str
    last_seen: datetime
    registered_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True

class PingStatusCreate(BaseModel):
    machine_id: int
    is_alive: bool
    response_time: Optional[float] = Field(None, ge=0)
    consecutive_failures: int = Field(0, ge=0)
    next_check_interval: int = Field(60, ge=60, le=3600)

class PingStatusInDB(PingStatusCreate):
    id: int
    checked_at: datetime

    class Config:
        from_attributes = True

class FailureLogCreate(BaseModel):
    machine_id: int
    hostname: str
    ip_address: IPvAnyAddress
    mac_address: str

class FailureLogInDB(FailureLogCreate):
    id: int
    failure_detected_at: datetime

    class Config:
        from_attributes = True
```

## Migration Strategy

1. **初期セットアップ**: Alembic使用、`database/init.sql`スクリプトも提供
2. **バージョン管理**: すべてのスキーマ変更はAlembicマイグレーションで管理
3. **ダウンタイム**: 初回デプロイのみダウンタイム許容、以降はオンラインマイグレーション
4. **バックアップ**: マイグレーション前に必ずPostgreSQLバックアップを取得

## Performance Considerations

- **最大レコード数**: machines: 1000, ping_status: ~10万/月(1000台×100チェック), failure_logs: 可変
- **クエリパターン**:
  - 最新PingStatus取得(machine_idでフィルタ): インデックス使用で<10ms
  - マシン一覧(ステータスフィルタ): インデックス使用で<50ms
- **パーティショニング**: ping_statusとfailure_logsは将来的に月単位でパーティション検討
