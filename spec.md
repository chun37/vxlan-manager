# VXLANマシン管理システム 基本設計書

## 1. システム概要

### 1.1 目的
VXLANネットワーク内のマシンを自動登録・監視し、接続状態をリアルタイムで管理するシステム

### 1.2 システム構成
- **動作環境**: 単一サーバー
- **管理対象**: 最大1000台のマシン
- **ネットワーク**: VXLANネットワーク内で動作（VTEPは別機器が担当）
- **アクセス方法**: Webブラウザ（PC/スマートフォン対応）

## 2. 機能要件

### 2.1 マシン自動登録機能
- マシンが自身の情報をHTTP PUTで送信（IPアドレスをリソース識別子として使用）
- 登録情報：
  - IPアドレス（URLパスに含める）
  - ホスト名（必須）
  - MACアドレス（必須）
  - その他の拡張フィールド（将来対応）
- 認証不要
- 同一IPアドレスの場合は自動的に情報を更新（Upsert操作）

### 2.2 死活監視機能
- **監視方法**: ICMP ping
- **監視間隔**: 1分
- **判定基準**: 3回連続失敗で接続不可と判定
- **リトライ方式**: Exponential Backoff
  - 1回目の失敗: 1分後に再試行
  - 2回目の失敗: 2分後に再試行
  - 3回目の失敗: 4分後に再試行
  - 接続不可判定後: 8分、16分、32分...（最大60分間隔）

### 2.3 Web管理画面
- **表示情報**:
  - マシン一覧（ホスト名、IPアドレス、MACアドレス、接続状態）
  - 接続状態のリアルタイム更新（WebSocket使用）
  - 最終確認時刻
  - 接続不可マシンの削除ボタン
- **レスポンシブデザイン**: PC/スマートフォン両対応
- **自動更新**: WebSocketによるリアルタイム状態反映

### 2.4 データ管理
- **永続化**: PostgreSQL使用
- **ログ記録**: 3回連続失敗時のみ記録（日時、マシン情報）
- **削除機能**: 接続不可マシンの手動削除

## 3. システムアーキテクチャ

### 3.1 技術スタック
```
フロントエンド:
- HTML5 / CSS3 (レスポンシブ対応)
- JavaScript (WebSocket通信)
- Bootstrap 5 または Tailwind CSS

バックエンド:
- Python 3.11+ (FastAPI推奨)
- WebSocket (リアルタイム通信)
- asyncio (非同期処理)
- asyncpg (PostgreSQL非同期ドライバ)

データベース:
- PostgreSQL 14+

監視プロセス:
- Python asyncio (非同期ping実行)
- aioping または subprocess (ping実装)
```

### 3.2 コンポーネント構成
```
┌─────────────────────────────────────────┐
│         Webブラウザ（PC/スマホ）          │
└────────┬──────────────────┬─────────────┘
         │HTTP/WebSocket     │
┌────────▼──────────────────▼─────────────┐
│         FastAPI Application             │
│  ┌──────────────┐  ┌─────────────────┐ │
│  │ API Handler  │  │WebSocket Handler│ │
│  └──────┬───────┘  └────────┬────────┘ │
│         │                    │          │
│  ┌──────▼────────────────────▼────────┐ │
│  │      Business Logic Layer          │ │
│  └──────┬────────────────────┬────────┘ │
│         │                    │          │
│  ┌──────▼───────┐  ┌────────▼────────┐ │
│  │ Data Access  │  │ Monitor Service  │ │
│  │    Layer     │  │  (Background)    │ │
│  └──────┬───────┘  └────────┬────────┘ │
└─────────┼────────────────────┼──────────┘
          │                    │
┌─────────▼────────────────────▼──────────┐
│           PostgreSQL Database           │
└─────────────────────────────────────────┘
```

## 4. データベース設計

### 4.1 テーブル構造

#### machines テーブル
```sql
CREATE TABLE machines (
    id SERIAL PRIMARY KEY,
    hostname VARCHAR(255) NOT NULL,
    ip_address INET NOT NULL UNIQUE,
    mac_address MACADDR NOT NULL,
    status VARCHAR(20) DEFAULT 'active',
    last_seen TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    registered_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    extra_data JSONB,
    INDEX idx_status (status),
    INDEX idx_last_seen (last_seen)
);
```

#### ping_status テーブル
```sql
CREATE TABLE ping_status (
    id SERIAL PRIMARY KEY,
    machine_id INTEGER REFERENCES machines(id) ON DELETE CASCADE,
    is_alive BOOLEAN NOT NULL,
    response_time FLOAT,
    checked_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    consecutive_failures INTEGER DEFAULT 0,
    next_check_interval INTEGER DEFAULT 60,
    INDEX idx_machine_checked (machine_id, checked_at DESC)
);
```

#### failure_logs テーブル
```sql
CREATE TABLE failure_logs (
    id SERIAL PRIMARY KEY,
    machine_id INTEGER REFERENCES machines(id) ON DELETE CASCADE,
    hostname VARCHAR(255) NOT NULL,
    ip_address INET NOT NULL,
    mac_address MACADDR NOT NULL,
    failure_detected_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_failure_time (failure_detected_at DESC)
);
```

## 5. API設計

### 5.1 RESTful API エンドポイント

#### PUT /api/machines/{ip_address}
マシン登録・更新（IPアドレスをキーとしたUpsert操作）
```json
Request:
{
    "hostname": "server01",
    "mac_address": "00:11:22:33:44:55",
    "extra_data": {}  // オプション
}

Response (新規登録 - 201 Created):
{
    "id": 1,
    "hostname": "server01",
    "ip_address": "192.168.100.10",
    "mac_address": "00:11:22:33:44:55",
    "status": "active",
    "registered_at": "2024-01-01T00:00:00Z"
}

Response (更新 - 200 OK):
{
    "id": 1,
    "hostname": "server01",
    "ip_address": "192.168.100.10",
    "mac_address": "00:11:22:33:44:55",
    "status": "active",
    "updated_at": "2024-01-01T00:00:00Z"
}
```

#### GET /api/machines
マシン一覧取得
```json
Response:
{
    "machines": [
        {
            "id": 1,
            "hostname": "server01",
            "ip_address": "192.168.100.10",
            "mac_address": "00:11:22:33:44:55",
            "status": "active",
            "last_seen": "2024-01-01T00:00:00Z",
            "is_alive": true,
            "response_time": 1.23
        }
    ]
}
```

#### DELETE /api/machines/{machine_id}
マシン削除（フロントエンドで削除確認ダイアログを表示）

### 5.2 WebSocket エンドポイント

#### WS /ws/status
リアルタイム状態更新
```json
Message Format:
{
    "type": "status_update",
    "machine_id": 1,
    "status": "active",
    "is_alive": true,
    "response_time": 1.23,
    "last_seen": "2024-01-01T00:00:00Z"
}
```

## 6. 監視ロジック詳細

### 6.1 Ping監視フロー
```python
1. 起動時に全マシンの監視タスクを作成
2. 各マシンごとに独立した非同期タスクで監視
3. ping実行:
   - 成功時: 
     - consecutive_failures = 0
     - next_check_interval = 60秒
   - 失敗時:
     - consecutive_failures++
     - if consecutive_failures >= 3:
       - status = "unreachable"
       - failure_logsに記録
     - next_check_interval = min(60 * (2 ** consecutive_failures), 3600)
4. WebSocketで状態変更を通知
5. 次回チェック時間まで待機
```

### 6.2 Exponential Backoff実装
```
初回失敗: 60秒後に再試行
2回目: 120秒後（2分）
3回目: 240秒後（4分）→ ここで接続不可判定
4回目: 480秒後（8分）
5回目: 960秒後（16分）
6回目: 1920秒後（32分）
7回目以降: 3600秒後（60分）※上限
```

## 7. 画面設計

### 7.1 マシン管理画面（メイン画面）

```
┌─────────────────────────────────────────┐
│ VXLANマシン管理システム          [更新: リアルタイム] │
├─────────────────────────────────────────┤
│ 接続中: 95台 | 切断: 5台 | 合計: 100台    │
├─────────────────────────────────────────┤
│ ┌─────────────────────────────────────┐ │
│ │ ホスト名 │ IPアドレス │ MAC │ 状態 │ 操作 │ │
│ ├─────────────────────────────────────┤ │
│ │ server01 │ 192.168... │ 00:11.. │ ● │     │ │
│ │ server02 │ 192.168... │ 00:22.. │ ● │     │ │
│ │ server03 │ 192.168... │ 00:33.. │ ○ │ [削除] │ │
│ └─────────────────────────────────────┘ │
└─────────────────────────────────────────┘

凡例: ● 接続中  ○ 切断中
```

### 7.2 レスポンシブ対応（スマートフォン表示）
- カード形式での表示
- 横スクロール不要なレイアウト
- タッチ操作最適化

### 7.3 削除確認ダイアログ
```
┌─────────────────────────────────┐
│        マシン削除の確認           │
├─────────────────────────────────┤
│ 以下のマシンを削除しますか？        │
│                                 │
│ ホスト名: server03              │
│ IP: 192.168.100.13              │
│ MAC: 00:33:44:55:66:77          │
│                                 │
│ この操作は取り消せません。         │
├─────────────────────────────────┤
│     [キャンセル]    [削除]        │
└─────────────────────────────────┘
```

## 8. セキュリティ考慮事項

### 8.1 ネットワークセキュリティ
- VXLANネットワーク内からのみアクセス可能
- 管理画面へのアクセス制限は不要（要件により）

### 8.2 入力検証
- IPアドレス形式の検証
- MACアドレス形式の検証
- SQLインジェクション対策（パラメータバインディング使用）
- XSS対策（HTMLエスケープ）

### 8.3 DoS対策
- 同一IPからの登録レート制限
- 最大登録数の制限（1000台）

## 9. パフォーマンス考慮事項

### 9.1 スケーラビリティ
- 非同期処理による効率的なping実行
- データベースインデックスの適切な設置
- WebSocket接続数の監視

### 9.2 最適化
- ping実行の並列化（最大100並列）
- データベース接続プーリング
- フロントエンドの仮想スクロール（大量データ表示時）

## 10. 運用・保守

### 10.1 監視項目
- システムリソース（CPU、メモリ、ディスク）
- ping監視プロセスの死活
- WebSocket接続数
- データベース接続数

### 10.2 バックアップ
- PostgreSQLの定期バックアップ
- failure_logsの定期アーカイブ

### 10.3 ログ
- アプリケーションログ（エラー、警告）
- アクセスログ
- ping失敗ログ（failure_logsテーブル）

## 11. 今後の拡張性

### 11.1 将来的な機能追加候補
- マシンのグループ管理
- 統計ダッシュボード
- エクスポート機能（CSV、JSON）
- API認証機能
- 複数VXLANネットワーク対応

### 11.2 拡張フィールド対応
- extra_data（JSONB）フィールドで柔軟に対応
- スキーマレスでの追加情報保存

## 12. 開発スケジュール（参考）

1. **Phase 1**: 基本機能実装（2週間）
   - データベース構築
   - API実装
   - ping監視機能

2. **Phase 2**: Web UI実装（1週間）
   - 管理画面
   - WebSocket通信
   - レスポンシブ対応

3. **Phase 3**: テスト・調整（1週間）
   - 負荷テスト
   - バグ修正
   - パフォーマンス調整
