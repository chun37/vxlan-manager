# Implementation Plan: VXLANマシン管理システム

**Branch**: `001-vxlan-machine-manager` | **Date**: 2025-10-18 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/home/chun/programs/vxlan-manager/specs/001-vxlan-machine-manager/spec.md`

**Note**: This template is filled in by the `/speckit.plan` command. See `.specify/templates/commands/plan.md` for the execution workflow.

## Summary

VXLANネットワーク内の最大1000台のマシンを自動登録・死活監視し、接続状態をリアルタイムでWeb管理画面に表示するシステム。マシンはHTTP PUTで自動登録され、バックグラウンドでICMP pingによる定期監視(Exponential Backoff採用)が実行される。状態変化はWebSocketでプッシュ通知され、管理者はPC/モバイルから現在の状態を確認し、接続不可マシンを削除できる。

技術アプローチ: Python 3.11+ + FastAPI + asyncio + PostgreSQL 14+ による完全非同期アーキテクチャ。WebSocketによるリアルタイム通信、レスポンシブUI(Bootstrap 5)によるマルチデバイス対応。

## Technical Context

**Language/Version**: Python 3.11+
**Primary Dependencies**: FastAPI (Webフレームワーク), asyncpg (PostgreSQL非同期ドライバ), asyncio (非同期ランタイム), Pydantic (バリデーション), websockets (リアルタイム通信)
**Storage**: PostgreSQL 14+ (machines, ping_status, failure_logsテーブル)
**Testing**: pytest, pytest-asyncio, FastAPI TestClient, httpx (非同期HTTPクライアント)
**Target Platform**: Linux server (単一サーバー、VXLANネットワーク内配置)
**Project Type**: web (backend + frontend分離)
**Performance Goals**: 1000台同時監視、100並列ping実行、WebSocket通知<1秒、API応答<1秒、DBクエリ<100ms
**Constraints**: 非同期I/O必須、トランザクション必須、メモリ効率重視(1000台監視でのリソース管理)
**Scale/Scope**: 最大1000台のマシン、WebSocket同時接続数十名の管理者想定、24時間365日稼働

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

This feature MUST comply with `.specify/memory/constitution.md` principles:

### Core Principles Compliance

- [x] **非同期処理優先**: すべてのI/O処理(DB、ネットワーク、ping)が非同期実装されているか?
  - ✅ asyncpg (DB非同期), asyncio.create_subprocess_exec (ping非同期), FastAPI async endpoints
- [x] **リアルタイム状態反映**: 状態変化がWebSocketで即座に通知される設計か?
  - ✅ WebSocketエンドポイント `/ws/status` でプッシュ通知、ポーリング不使用
- [x] **堅牢な監視**: Exponential Backoff (60s→120s→240s→接続不可判定) が実装されているか?
  - ✅ FR-005で明示、ping_statusテーブルにconsecutive_failuresとnext_check_interval管理
- [x] **データ整合性**: トランザクション管理とロールバック処理が適切か?
  - ✅ asyncpgのトランザクションコンテキスト使用、エラー時自動ロールバック
- [x] **レスポンシブUI**: PC/スマホ両対応が考慮されているか?
  - ✅ Bootstrap 5によるレスポンシブデザイン、カード形式表示(User Story 3)
- [x] **セキュリティ**: 入力検証(IP/MAC)、SQLインジェクション対策、XSS対策、レート制限が実装されているか?
  - ✅ Pydanticバリデーション(IP/MAC形式)、asyncpgパラメータバインディング、Jinjaエスケープ、FastAPI rate limiting middleware

### Technical Standards Compliance

- [x] **技術スタック**: Python 3.11+, FastAPI, asyncio, asyncpg, PostgreSQL 14+に準拠しているか?
  - ✅ すべて憲章で定義された技術を採用
- [x] **データベーススキーマ**: spec.mdのスキーマ(machines, ping_status, failure_logs)に従っているか?
  - ✅ 仕様書のKey Entitiesセクションで定義済み
- [x] **API契約**: spec.mdのエンドポイント契約(PUT/GET/DELETE, WebSocket)を遵守しているか?
  - ✅ FR-001(PUT登録), FR-007(GET一覧), FR-008(DELETE削除), FR-006(WebSocket通知)で定義

### Testing Standards Compliance

- [x] **テストカバレッジ**: pytest, pytest-asyncio, FastAPI TestClientを使用しているか?
  - ✅ 憲章のTesting Standardsに準拠
- [x] **統合テスト**: WebSocket通信、Ping監視E2E、DB連携のテストが含まれているか?
  - ✅ 計画に統合テストフェーズを含める(WebSocket E2E, Ping監視フロー, DBトランザクション)

### Performance Requirements Compliance

- [x] **スケーラビリティ**: 1000台同時監視、100並列ping、WebSocket遅延<1秒、DBクエリ<100msを満たせるか?
  - ✅ NFR-PERF-002(1000台監視), NFR-PERF-005(100並列), NFR-PERF-004(WS<1秒), NFR-PERF-003(DB<100ms)で要件定義

**Complexity Justification Required**: 憲章違反なし - すべてのチェック項目がパス

## Project Structure

### Documentation (this feature)

```
specs/001-vxlan-machine-manager/
├── plan.md              # This file (/speckit.plan command output)
├── research.md          # Phase 0 output: asyncio ping実装パターン調査
├── data-model.md        # Phase 1 output: Machine, PingStatus, FailureLogエンティティ定義
├── quickstart.md        # Phase 1 output: 開発環境構築手順
├── contracts/           # Phase 1 output: OpenAPI仕様
│   └── api-spec.yaml    # REST API + WebSocket契約
└── tasks.md             # Phase 2 output: /speckit.tasks command (NOT created by /speckit.plan)
```

### Source Code (repository root)

```
backend/
├── src/
│   ├── api/
│   │   ├── endpoints/
│   │   │   ├── machines.py      # PUT/GET/DELETE /api/machines endpoints
│   │   │   └── websocket.py     # WS /ws/status endpoint
│   │   ├── dependencies.py      # FastAPI dependencies (DB接続、認証など)
│   │   └── middleware.py        # Rate limiting, CORS, error handling
│   ├── models/
│   │   ├── machine.py           # Machine Pydantic model + SQLAlchemy ORM
│   │   ├── ping_status.py       # PingStatus model
│   │   └── failure_log.py       # FailureLog model
│   ├── services/
│   │   ├── machine_service.py   # マシン登録・更新・削除ロジック
│   │   ├── monitor_service.py   # Ping監視バックグラウンドタスク
│   │   └── websocket_service.py # WebSocket接続管理・ブロードキャスト
│   ├── db/
│   │   ├── database.py          # asyncpg接続プール管理
│   │   └── migrations/          # Alembicマイグレーションスクリプト
│   ├── validators/
│   │   └── network.py           # IP/MACアドレスバリデーター
│   ├── main.py                  # FastAPIアプリケーションエントリーポイント
│   └── config.py                # 環境変数設定 (DB接続文字列、ping間隔など)
└── tests/
    ├── contract/
    │   └── test_api_contract.py  # OpenAPI契約準拠テスト
    ├── integration/
    │   ├── test_machine_lifecycle.py  # 登録→監視→削除のE2Eテスト
    │   ├── test_websocket_flow.py     # WebSocket接続→状態更新受信テスト
    │   └── test_monitor_backoff.py    # Exponential Backoffロジックテスト
    └── unit/
        ├── test_machine_service.py    # マシンサービスユニットテスト
        ├── test_monitor_service.py    # 監視サービスユニットテスト
        └── test_validators.py          # IP/MACバリデーターテスト

frontend/
├── src/
│   ├── components/
│   │   ├── MachineList.js       # マシン一覧テーブル/カード表示
│   │   ├── MachineCard.js       # スマホ用カード表示コンポーネント
│   │   └── DeleteConfirmModal.js # 削除確認ダイアログ
│   ├── services/
│   │   ├── api.js               # REST APIクライアント (fetch wrapper)
│   │   └── websocket.js         # WebSocket接続管理・イベントリスナー
│   ├── pages/
│   │   └── Dashboard.html       # メインダッシュボード画面
│   ├── styles/
│   │   └── main.css             # Bootstrap 5カスタマイズ + レスポンシブスタイル
│   └── index.html               # エントリーポイント
└── tests/
    └── e2e/
        └── test_dashboard.js    # Selenium/Playwright E2Eテスト

database/
└── init.sql                     # 初期テーブル作成スクリプト (machines, ping_status, failure_logs)

docs/
├── architecture.md              # システムアーキテクチャ図
└── deployment.md                # デプロイ手順 (Docker Compose推奨)
```

**Structure Decision**: Web applicationアーキテクチャを採用。バックエンドとフロントエンドを分離し、バックエンドは完全非同期のFastAPIで構築、フロントエンドは軽量なHTML/JS/Bootstrap 5でレスポンシブUIを実現。VXLANネットワーク内の単一Linuxサーバーにバックエンド・フロントエンド・PostgreSQLをDockerコンテナとして配置予定。

## Complexity Tracking

憲章違反なし - このセクションは不要。すべてのConstitution Checkがパスしており、複雑性の正当化は必要ない。
