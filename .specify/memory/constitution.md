# VXLAN Manager Constitution

<!--
Sync Impact Report:
- Version change: [none] → 1.0.0
- Initial constitution creation based on spec.md
- Modified principles: N/A (initial creation)
- Added sections: All core principles, Technical Standards, Development Workflow, Governance
- Removed sections: N/A
- Templates requiring updates:
  ✅ .specify/templates/plan-template.md (updated - Constitution Check section with concrete compliance criteria)
  ✅ .specify/templates/spec-template.md (updated - Added Non-Functional Requirements section)
  ✅ .specify/templates/tasks-template.md (updated - Enhanced Foundational phase with constitution-compliant tasks)
  ✅ .specify/templates/checklist-template.md (no changes required - generic template)
- Follow-up TODOs: None
-->

## Core Principles

### I. 非同期処理優先 (Async-First Architecture)

すべての I/O 処理(データベースアクセス、ネットワーク通信、ping実行)は非同期で実装されなければならない (MUST)。

**理由**: 最大1000台のマシンを効率的に監視するため、ブロッキング処理を避け asyncio を活用したスケーラブルなアーキテクチャが必須。同期処理はシステム全体のパフォーマンスを著しく低下させる。

### II. リアルタイム状態反映 (Real-time State Propagation)

マシンの状態変化は WebSocket を通じて即座にクライアントへ通知されなければならない (MUST)。

**理由**: 管理者が最新の接続状態を常に把握するため、ポーリングではなくプッシュ型通信が必要。これにより不要なAPIリクエストも削減される。

### III. 堅牢な監視メカニズム (Resilient Monitoring)

死活監視は Exponential Backoff によって実装され、以下のルールを厳守する (MUST):
- 初回失敗: 60秒後に再試行
- 2回目失敗: 120秒後に再試行
- 3回目失敗: 240秒後に再試行、接続不可判定、failure_logsに記録
- 以降: 間隔を2倍に延長 (最大60分)

**理由**: 一時的なネットワーク障害と恒久的な障害を区別し、システムリソースの無駄遣いを防ぐため。3回の猶予により誤検知を最小化。

### IV. データ整合性保証 (Data Integrity Guarantee)

すべてのデータベース操作はトランザクション内で実行され、エラー時は適切にロールバックされなければならない (MUST)。

**理由**: マシン登録・更新・削除の各操作において、部分的な書き込みやデータ不整合は運用上の重大な問題を引き起こす。PostgreSQLのACID特性を最大限活用する。

### V. レスポンシブ UI 設計 (Responsive UI Design)

Web UI はすべてのデバイス(デスクトップ、タブレット、スマートフォン)で完全に機能しなければならない (MUST)。

**理由**: 管理者は現場でモバイル端末から状態確認・操作を行う必要がある。横スクロール不要、タッチ操作最適化、カード形式表示などが求められる。

### VI. セキュリティファースト (Security First)

すべての入力は検証され、SQL インジェクション、XSS、DoS攻撃から保護されなければならない (MUST):
- IPアドレス形式の検証
- MACアドレス形式の検証
- パラメータバインディングの使用
- HTMLエスケープ
- レート制限 (同一IP、最大登録数1000台)

**理由**: VXLANネットワーク内であっても、悪意ある入力や誤操作によるシステム破壊を防ぐ。認証は不要だが、入力検証は必須。

## Technical Standards

### Technology Stack Requirements

- **Backend**: Python 3.11+, FastAPI, asyncio, asyncpg
- **Frontend**: HTML5, CSS3, JavaScript (WebSocket), Bootstrap 5 / Tailwind CSS
- **Database**: PostgreSQL 14+
- **Testing**: pytest, pytest-asyncio

すべての新規コンポーネントはこの技術スタックに準拠しなければならない (MUST)。変更が必要な場合は憲章改正が必要。

### Database Schema Compliance

テーブル構造は spec.md 第4章に定義された以下のスキーマに厳密に従わなければならない (MUST):
- `machines` (id, hostname, ip_address, mac_address, status, last_seen, registered_at, updated_at, extra_data)
- `ping_status` (id, machine_id, is_alive, response_time, checked_at, consecutive_failures, next_check_interval)
- `failure_logs` (id, machine_id, hostname, ip_address, mac_address, failure_detected_at)

**理由**: データ整合性とシステムの予測可能性を保証するため。スキーマ変更はマイグレーションスクリプトと憲章改正が必要。

### API Contract Stability

API エンドポイントは spec.md 第5章に定義された契約を遵守しなければならない (MUST):
- `PUT /api/machines/{ip_address}` (Upsert操作)
- `GET /api/machines` (一覧取得)
- `DELETE /api/machines/{machine_id}` (削除)
- `WS /ws/status` (リアルタイム更新)

**理由**: クライアントとの互換性を保証し、予期しない動作変更を防ぐ。破壊的変更はメジャーバージョンアップが必要。

## Development Workflow

### Code Review Requirements

すべてのプルリクエストは以下をレビューされなければならない (MUST):
- 憲章原則への準拠確認
- 非同期処理の適切な使用
- エラーハンドリングとトランザクション管理
- セキュリティ検証の実装
- テストカバレッジ

### Testing Standards

新機能・変更は以下のテストを含まなければならない (MUST):
- ユニットテスト (pytest)
- 非同期関数のテスト (pytest-asyncio)
- APIエンドポイントテスト (FastAPI TestClient)
- データベーストランザクションテスト

統合テストは以下の領域で必須 (MUST):
- WebSocket通信
- Ping監視と状態更新のエンドツーエンド
- データベースとビジネスロジック間の連携

### Performance Requirements

システムは以下の性能基準を満たさなければならない (MUST):
- 1000台のマシン同時監視が可能
- ping監視の並列実行 (最大100並列)
- WebSocket メッセージ遅延 < 1秒
- データベースクエリ < 100ms (通常負荷時)

## Governance

### Amendment Procedure

この憲章の改正には以下が必要:
1. 改正提案の文書化 (理由、影響範囲、移行計画)
2. 技術レビュー (既存コードへの影響評価)
3. バージョン番号の決定 (MAJOR.MINOR.PATCH)
4. 依存テンプレートの更新確認

### Versioning Policy

- **MAJOR**: 後方互換性のない原則削除・再定義、技術スタック変更
- **MINOR**: 新原則・セクションの追加、重要なガイダンス拡張
- **PATCH**: 明確化、文言修正、誤字修正、非セマンティックな改善

### Compliance Review

すべてのPRとコードレビューは憲章準拠を検証しなければならない (MUST)。複雑な実装は正当化が必要。

### Runtime Guidance

日常の開発ガイダンスは agent-specific ファイル (`.specify/templates/agent-file-template.md` など) を参照すること。

**Version**: 1.0.0 | **Ratified**: 2025-10-18 | **Last Amended**: 2025-10-18
