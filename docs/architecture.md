# VXLAN Machine Manager - システムアーキテクチャ

## 概要

VXLANネットワーク内のマシンを自動登録・監視し、接続状態をリアルタイムでWeb管理画面に表示するシステム。

## システム構成

```
┌─────────────────────────────────────────────────────────────────┐
│                        VXLAN Network                            │
│                                                                 │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐                     │
│  │ Machine 1│  │ Machine 2│  │ Machine N│  (最大1000台)        │
│  └─────┬────┘  └─────┬────┘  └─────┬────┘                     │
│        │             │             │                            │
│        │ HTTP PUT    │             │                            │
│        │ (登録)      │             │                            │
│        ▼             ▼             ▼                            │
│  ┌─────────────────────────────────────────┐                   │
│  │                                         │                   │
│  │     VXLAN Manager Server                │                   │
│  │  ┌─────────────┐  ┌──────────────┐     │                   │
│  │  │   Backend   │  │  PostgreSQL  │     │                   │
│  │  │  (FastAPI)  │◄─┤   Database   │     │                   │
│  │  └──────┬──────┘  └──────────────┘     │                   │
│  │         │                               │                   │
│  │         │ WebSocket                     │                   │
│  │         │ Broadcast                     │                   │
│  │  ┌──────▼──────┐                        │                   │
│  │  │  Frontend   │                        │                   │
│  │  │   (Nginx)   │                        │                   │
│  │  └─────────────┘                        │                   │
│  └─────────────────────────────────────────┘                   │
│                    │                                            │
└────────────────────┼────────────────────────────────────────────┘
                     │
                     │ HTTPS
                     ▼
              ┌─────────────┐
              │  管理者PC   │
              │  (Browser)  │
              └─────────────┘
```

## コンポーネント詳細

### 1. Backend (FastAPI + Python 3.11+)

#### 責務
- マシン登録・更新・削除のREST API提供
- ICMP pingによる死活監視 (バックグラウンドタスク)
- WebSocketによるリアルタイム状態通知
- データベース操作 (asyncpg)

#### 主要モジュール

**API Layer** (`backend/src/api/`)
- `endpoints/machines.py`: マシンCRUD API
- `endpoints/websocket.py`: WebSocket接続エンドポイント (Phase 4)
- `middleware.py`: CORS, レート制限, エラーハンドリング
- `dependencies.py`: 依存性注入 (DB接続など)

**Service Layer** (`backend/src/services/`)
- `machine_service.py`: マシンのビジネスロジック (Upsert, 削除, 検索)
- `monitor_service.py`: Ping監視バックグラウンドタスク (Phase 4)
- `ping_utils.py`: ICMP ping実行 (icmplib wrapper)
- `websocket_service.py`: WebSocket接続管理・ブロードキャスト

**Data Layer** (`backend/src/db/`)
- `database.py`: asyncpg接続プール管理

**Models** (`backend/src/models/`)
- Pydantic models: リクエスト/レスポンスバリデーション

### 2. Database (PostgreSQL 14+)

#### スキーマ

**machines テーブル**
- マシン情報を保存 (hostname, ip_address, mac_address, status)
- `ip_address` は UNIQUE キー (Upsert操作の基準)
- `status`: 'active' | 'unreachable'

**ping_status テーブル**
- Ping監視結果の履歴を保存
- Exponential backoff管理 (consecutive_failures, next_check_interval)

**failure_logs テーブル**
- 接続不可判定されたマシンの監査ログ

### 3. Frontend (HTML/JS + Bootstrap 5)

#### 責務
- マシン一覧表示 (デスクトップ: テーブル, モバイル: カード)
- WebSocketによるリアルタイム状態更新受信 (Phase 4)
- マシン削除操作

#### 主要ファイル
- `pages/Dashboard.html`: メイン画面
- `components/MachineList.js`: テーブルレイアウト
- `components/MachineCard.js`: モバイル用カードレイアウト
- `services/api.js`: REST API クライアント
- `services/websocket.js`: WebSocket クライアント

### 4. Machine Registration Script

**docs/register-machine.sh**
- 各マシンで実行するbashスクリプト
- マシン情報 (hostname, IP, MAC) を収集してPUT /api/machines API を呼び出し

## データフロー

### 1. マシン登録フロー

```
Machine                Backend                  Database
  │                      │                         │
  │  PUT /api/machines   │                         │
  ├─────────────────────►│                         │
  │  {hostname, IP, MAC} │                         │
  │                      │  Upsert machine         │
  │                      ├────────────────────────►│
  │                      │                         │
  │                      │◄────────────────────────┤
  │                      │  Machine record         │
  │   201/200 OK         │                         │
  │◄─────────────────────┤                         │
  │  {machine_data}      │                         │
```

### 2. 死活監視フロー (Phase 4で実装)

```
MonitorService         PingUtils         Database        WebSocket
      │                   │                 │                │
      │  Ping machine     │                 │                │
      ├──────────────────►│                 │                │
      │                   │  ICMP ping      │                │
      │                   ├─────────────────┼───────────────►│
      │                   │  Response       │       (network)
      │                   │◄────────────────┼────────────────┤
      │  is_alive, RTT    │                 │                │
      │◄──────────────────┤                 │                │
      │                   │                 │                │
      │  Update status    │                 │                │
      ├───────────────────┼────────────────►│                │
      │                   │  status='active'│                │
      │                   │                 │                │
      │  Broadcast update │                 │                │
      ├───────────────────┼─────────────────┼───────────────►│
      │                   │                 │  status_update │
```

### 3. WebSocket状態通知フロー (Phase 4で実装)

```
Browser              Frontend WS Client      Backend WS          MonitorService
   │                        │                    │                      │
   │  Open Dashboard        │                    │                      │
   ├───────────────────────►│                    │                      │
   │                        │  WS Connect        │                      │
   │                        ├───────────────────►│                      │
   │                        │◄───────────────────┤                      │
   │                        │  Connection ACK    │                      │
   │                        │                    │                      │
   │                        │                    │  Status changed      │
   │                        │                    │◄─────────────────────┤
   │                        │  status_update msg │  (machine unreachable)
   │                        │◄───────────────────┤                      │
   │  Update UI (red ○)    │                    │                      │
   │◄───────────────────────┤                    │                      │
```

## セキュリティ

### 実装済み対策

1. **入力検証**
   - Pydantic models による IP/MAC アドレス形式検証
   - ホスト名長さ制限 (1-255文字)

2. **SQLインジェクション対策**
   - asyncpg パラメータバインディング使用
   - 動的SQLなし

3. **XSS対策**
   - フロントエンドで `escapeHtml()` 関数使用
   - ユーザー入力をDOM挿入前にエスケープ

4. **レート制限**
   - IP単位でリクエスト制限 (120 req/min)
   - 過剰なAPI呼び出しを防止

5. **CORS設定**
   - 許可オリジンをホワイトリスト管理
   - 環境変数 `CORS_ORIGINS` で制御

### 将来の改善案

- 認証・認可 (JWT, OAuth2)
- HTTPS/TLS通信 (本番環境では必須)
- APIキー認証 (マシン登録用)

## パフォーマンス

### 設計目標

- **最大マシン数**: 1000台
- **並列ping実行**: 100 (Semaphore制御)
- **API応答時間**: <1秒
- **DBクエリ**: <100ms
- **WebSocket通知**: <1秒

### 最適化戦略

1. **非同期処理**
   - すべてのI/O操作が非同期 (asyncpg, icmplib async_ping, asyncio)

2. **接続プール**
   - asyncpg Pool (min: 10, max: 50)
   - 接続再利用でオーバーヘッド削減

3. **Exponential Backoff**
   - 接続不可マシンのping間隔を動的に増加 (60s→3600s)
   - リソース効率化

4. **データベースインデックス**
   - `machines.status`, `machines.last_seen`, `ping_status(machine_id, checked_at)` にインデックス

## デプロイ

### Docker Compose構成

```yaml
services:
  db:       PostgreSQL 14 (port 5432)
  backend:  FastAPI (port 8000, CAP_NET_RAW)
  frontend: Nginx (port 3000)
```

### 必須権限

- **CAP_NET_RAW**: ICMP raw socket使用のため必須
- systemd設定: `AmbientCapabilities=CAP_NET_RAW`

### 環境変数

`.env` ファイルで設定:
- `DATABASE_URL`: PostgreSQL接続文字列
- `MAX_MACHINES`: 最大登録台数 (デフォルト: 1000)
- `MAX_PARALLEL_PINGS`: 並列ping数 (デフォルト: 100)
- `CORS_ORIGINS`: 許可オリジン (カンマ区切り)

## 開発ワークフロー

### ローカル開発

```bash
# Backend
cd backend
python3.11 -m venv venv
source venv/bin/activate
pip install -e .[dev]
uvicorn src.main:app --reload

# Frontend
cd frontend
npm run dev  # or: python3 -m http.server 3000 --directory src
```

### Docker環境

```bash
docker-compose up -d
docker-compose logs -f backend
```

### テスト

```bash
# ユニットテスト
pytest tests/unit -v

# 統合テスト
pytest tests/integration -v

# カバレッジ
pytest --cov=src --cov-report=html
```

## 今後の実装 (Phase 4-6)

### Phase 4: リアルタイム死活監視
- MachineMonitorManager 実装
- WebSocket /ws/status エンドポイント
- フロントエンドWebSocket統合

### Phase 5: モバイル対応とマシン削除
- レスポンシブデザイン最適化
- 削除確認モーダル
- モバイルテスト

### Phase 6: 仕上げ
- ヘルスチェックエンドポイント強化
- ログ構造化
- パフォーマンステスト (1000台)
- OpenAPI/Swagger UIドキュメント生成
