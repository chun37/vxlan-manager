---
description: "Task list for VXLANマシン管理システム"
---

# Tasks: VXLANマシン管理システム

**Input**: Design documents from `/home/chun/programs/vxlan-manager/specs/001-vxlan-machine-manager/`
**Prerequisites**: plan.md, spec.md, data-model.md, contracts/api-spec.yaml, research.md, quickstart.md

**Tests**: ユーザーストーリーの仕様には明示的なテスト要求がないため、テストタスクは含まれていません。必要に応じて後から追加可能です。

**Organization**: タスクはユーザーストーリーごとにグループ化され、各ストーリーを独立して実装・テスト可能にしています。

## Format: `[ID] [P?] [Story] Description`
- **[P]**: 並列実行可能(異なるファイル、依存関係なし)
- **[Story]**: このタスクが属するユーザーストーリー(US1, US2, US3など)
- 説明には正確なファイルパスを含める

## Path Conventions
- **Web app**: `backend/src/`, `frontend/src/`
- Database: `database/`
- Docs: `docs/`

---

## Phase 1: Setup (共通インフラ)

**Purpose**: プロジェクト初期化と基本構造

- [X] T001 Create project directory structure (backend/, frontend/, database/, docs/, tests/)
- [X] T002 Initialize Python backend project with pyproject.toml and dependencies (FastAPI, asyncpg, icmplib, Pydantic, python-dotenv)
- [X] T003 [P] Initialize frontend project with package.json and dependencies (Bootstrap 5)
- [X] T004 [P] Create .env.example file with all required environment variables
- [X] T005 [P] Create .gitignore for Python and Node.js projects
- [X] T006 [P] Setup ruff configuration for Python linting in backend/pyproject.toml
- [X] T007 Create Docker Compose configuration in docker-compose.yml (backend, frontend, PostgreSQL 14)

---

## Phase 2: Foundational (ブロッキング前提条件)

**Purpose**: すべてのユーザーストーリーを実装する前に完了しなければならないコアインフラ

**⚠️ CRITICAL**: このフェーズが完了するまで、ユーザーストーリーの作業は開始できません

### Database Layer

- [X] T008 Create database schema SQL script in database/init.sql (machines, ping_status, failure_logs tables with indexes)
- [ ] T009 Setup Alembic for database migrations in backend/alembic/
- [X] T010 Create async database connection pool module in backend/src/db/database.py using asyncpg
- [ ] T011 [P] Create database transaction helper utilities in backend/src/db/transactions.py

### Core Models & Validation

- [X] T012 [P] Create Machine Pydantic models in backend/src/models/machine.py (MachineBase, MachineCreate, MachineUpdate, MachineInDB)
- [X] T013 [P] Create PingStatus Pydantic models in backend/src/models/ping_status.py (PingStatusCreate, PingStatusInDB)
- [X] T014 [P] Create FailureLog Pydantic models in backend/src/models/failure_log.py (FailureLogCreate, FailureLogInDB)
- [X] T015 [P] Implement IP/MAC address validators in backend/src/validators/network.py

### API Infrastructure

- [X] T016 Create FastAPI application with async endpoints in backend/src/main.py
- [X] T017 [P] Setup CORS middleware in backend/src/api/middleware.py
- [X] T018 [P] Setup rate limiting middleware in backend/src/api/middleware.py (per-IP and global limits)
- [X] T019 [P] Setup error handling middleware with exception handlers in backend/src/api/middleware.py
- [X] T020 Setup dependency injection for database pool in backend/src/api/dependencies.py
- [X] T021 Create configuration management module in backend/src/config.py (environment variables, validation)

### Monitoring Infrastructure

- [X] T022 Create ping utility module using icmplib in backend/src/services/ping_utils.py (async_ping wrapper with semaphore)
- [X] T023 Create exponential backoff calculation function in backend/src/services/backoff.py (60s→120s→240s→...→3600s)
- [ ] T024 Setup global semaphore for ping concurrency control (100 parallel) in backend/src/services/monitor_service.py

### WebSocket Infrastructure

- [X] T025 Create WebSocket connection manager in backend/src/services/websocket_service.py (connection pool, broadcast functionality)

### Frontend Base

- [X] T026 Create base HTML template in frontend/src/index.html with Bootstrap 5
- [X] T027 [P] Create responsive CSS styles in frontend/src/styles/main.css (desktop and mobile layouts)
- [X] T028 [P] Create WebSocket client utility in frontend/src/services/websocket.js (auto-reconnect, event handling)
- [X] T029 [P] Create REST API client utility in frontend/src/services/api.js (fetch wrapper with error handling)

**Constitution Compliance Check**: すべてのタスクが非同期処理、セキュリティ(入力検証、SQLインジェクション対策、XSS対策、レート制限)、データ整合性(トランザクション管理)の原則に準拠していることを確認

**Checkpoint**: Foundation ready - ユーザーストーリーの実装を並列で開始可能

---

## Phase 3: User Story 1 - マシン自動登録と一覧表示 (Priority: P1) 🎯 MVP

**Goal**: 管理者が、VXLANネットワーク内の各マシンから自動的に登録情報を受け取り、Webブラウザで一覧表示できる

**Independent Test**: マシンから登録情報を送信し、Web画面で該当マシンが一覧に表示されることを確認。既に登録されているマシンの情報を再送信すると情報が更新されることを確認。

**Acceptance Scenarios**:
1. マシンが自身の情報(ホスト名、IPアドレス、MACアドレス)を送信すると、Web画面のマシン一覧に新しいマシンが表示される
2. 既に登録されているマシンが同じIPアドレスから異なるホスト名で情報を送信すると、既存のマシン情報が更新され、一覧に重複エントリは表示されない
3. 管理者がWebブラウザで管理画面にアクセスすると、すべての登録済みマシンの一覧(ホスト名、IPアドレス、MACアドレス)が表示される

### Implementation for User Story 1

#### Backend - Machine Service & API

- [X] T030 [P] [US1] Implement MachineService in backend/src/services/machine_service.py (upsert_machine, get_all_machines, get_machine_by_id, validate_machine_limit)
- [X] T031 [P] [US1] Implement PUT /api/machines/{ip_address} endpoint in backend/src/api/endpoints/machines.py (upsert operation with 200/201 status codes)
- [X] T032 [US1] Implement GET /api/machines endpoint in backend/src/api/endpoints/machines.py (list with status filter, pagination, join with latest ping_status)
- [X] T033 [US1] Add router registration in backend/src/main.py for machines endpoints
- [X] T034 [US1] Add input validation for machine registration in backend/src/api/endpoints/machines.py (hostname length, IP/MAC format, extra_data validation)
- [X] T035 [US1] Implement 1000 machine limit enforcement in backend/src/services/machine_service.py (return 503 when limit reached)

#### Frontend - Machine List UI

- [X] T036 [P] [US1] Create MachineList component in frontend/src/components/MachineList.js (desktop table layout with status icons)
- [X] T037 [P] [US1] Create Dashboard page in frontend/src/pages/Dashboard.html (main entry point, includes MachineList component)
- [X] T038 [US1] Implement machine list data fetching in frontend/src/pages/Dashboard.html (call GET /api/machines API on page load)
- [X] T039 [US1] Add status icons (green ● for active, red ○ for unreachable) to machine list table
- [X] T040 [US1] Add auto-update logic in frontend (refresh machine list every 60 seconds as fallback to WebSocket)

#### Client Script for Machine Registration

- [X] T041 [US1] Create machine registration script in docs/register-machine.sh (bash script to collect hostname, IP, MAC and call PUT /api/machines API)
- [X] T042 [US1] Add usage documentation for register-machine.sh in docs/architecture.md

**Checkpoint**: User Story 1が完全に機能し、独立してテスト可能な状態

---

## Phase 4: User Story 2 - リアルタイム死活監視 (Priority: P2)

**Goal**: 管理者が、登録されたマシンの接続状態をリアルタイムで監視でき、接続不可になったマシンを即座に把握できる

**Independent Test**: マシンの電源を切るか、ネットワークを切断し、Web画面上で該当マシンのステータスが「接続不可」に変わることを確認。誤検知を防ぐため、一時的なネットワーク障害では即座に切断判定されないことも確認。

**Acceptance Scenarios**:
1. マシンへの接続が3回連続で失敗すると、Web画面上でそのマシンのステータスが「接続不可」に変更され、管理者に視覚的に通知される
2. マシンが接続不可状態から再び応答可能になると、Web画面上でそのマシンのステータスが「接続中」に自動的に変更される
3. マシンへの接続が1回失敗しても、次の確認で成功すると失敗カウントがリセットされ、接続不可判定にならない
4. 管理者がWeb画面を開いている間、マシンの状態が変化するとページをリロードせずに状態が自動更新される

### Implementation for User Story 2

#### Backend - Monitoring Service

- [X] T043 [P] [US2] Create MachineMonitor dataclass in backend/src/services/monitor_service.py (machine_id, ip_address, consecutive_failures, next_check_interval, last_check, is_alive)
- [X] T044 [P] [US2] Implement monitor_machine coroutine in backend/src/services/monitor_service.py (long-running task with ping execution, state update, sleep)
- [X] T045 [US2] Implement MachineMonitorManager class in backend/src/services/monitor_service.py (start_monitoring, stop_monitoring, shutdown, get_status)
- [X] T046 [US2] Implement PingStatusService in backend/src/services/ping_status_service.py (create_ping_status, update_machine_status_on_failure)
- [X] T047 [US2] Add failure detection logic (3 consecutive failures → status='unreachable') in backend/src/services/monitor_service.py
- [X] T048 [US2] Add FailureLog creation when machine becomes unreachable in backend/src/services/monitor_service.py
- [X] T049 [US2] Add recovery detection logic (ping success → reset consecutive_failures, status='active') in backend/src/services/monitor_service.py

#### Backend - WebSocket Integration

- [X] T050 [US2] Implement WebSocket /ws/status endpoint in backend/src/api/endpoints/websocket.py (accept connections, send connection confirmation)
- [X] T051 [US2] Add WebSocket broadcast call in monitor_service when machine status changes (active ⇔ unreachable)
- [X] T052 [US2] Create WebSocketStatusUpdate message schema in backend/src/models/websocket.py (type, machine_id, status, is_alive, response_time, last_seen)
- [X] T053 [US2] Add router registration for WebSocket endpoint in backend/src/main.py

#### Backend - Monitoring Lifecycle

- [X] T054 [US2] Add startup event handler in backend/src/main.py to initialize MachineMonitorManager
- [X] T055 [US2] Load all machines from database and start monitoring tasks on application startup in backend/src/main.py
- [X] T056 [US2] Add shutdown event handler in backend/src/main.py to gracefully stop all monitoring tasks
- [X] T057 [US2] Integrate monitoring start when new machine is registered (call manager.start_monitoring in upsert_machine)

#### Frontend - Real-time Status Updates

- [X] T058 [P] [US2] Implement WebSocket connection in frontend/src/pages/Dashboard.html (connect to /ws/status on page load)
- [X] T059 [US2] Add WebSocket message handler in frontend/src/pages/Dashboard.html (listen for status_update messages, update machine list DOM)
- [X] T060 [US2] Add visual notification for status changes in frontend (highlight changed row with animation)
- [X] T061 [US2] Add WebSocket reconnection logic in frontend/src/services/websocket.js (auto-reconnect on disconnect with exponential backoff)
- [X] T062 [US2] Display connection status indicator in frontend (show "connected" or "disconnected" badge)

**Checkpoint**: User Stories 1 AND 2が両方とも独立して動作可能

---

## Phase 5: User Story 3 - モバイル対応とマシン削除 (Priority: P3)

**Goal**: 管理者が、スマートフォンやタブレットからも快適にマシンの状態を確認でき、接続不可のマシンを削除できる

**Independent Test**: スマートフォンのWebブラウザで管理画面にアクセスし、横スクロールなしで全情報が閲覧できることを確認。接続不可のマシンを選択し、削除ボタンから確認ダイアログを経て削除が完了することを確認。

**Acceptance Scenarios**:
1. 管理者がスマートフォンでWeb画面にアクセスすると、すべてのマシン情報が横スクロールなしで閲覧でき、タッチ操作で快適に操作できる
2. 接続不可のマシンが一覧に表示されているとき、管理者が削除ボタンをクリックすると削除確認ダイアログが表示され、マシン情報(ホスト名、IP、MAC)が確認できる
3. 削除確認ダイアログで管理者が削除を確定すると、マシンが一覧から削除され、削除前の情報がログに記録される
4. 削除確認ダイアログで管理者がキャンセルすると、マシンは削除されず一覧に残る

### Implementation for User Story 3

#### Backend - Machine Deletion

- [ ] T063 [P] [US3] Implement delete_machine method in backend/src/services/machine_service.py (delete from machines table, cascade delete ping_status)
- [ ] T064 [US3] Implement DELETE /api/machines/{machine_id} endpoint in backend/src/api/endpoints/machines.py (call delete_machine, return 204 on success, 404 if not found)
- [ ] T065 [US3] Add pre-deletion logging for unreachable machines in backend/src/services/machine_service.py (save to failure_logs before deletion)
- [ ] T066 [US3] Stop monitoring task when machine is deleted (call manager.stop_monitoring in delete_machine)

#### Frontend - Responsive Design

- [ ] T067 [P] [US3] Create MachineCard component for mobile layout in frontend/src/components/MachineCard.js (card-based layout for small screens)
- [ ] T068 [P] [US3] Add responsive media queries in frontend/src/styles/main.css (switch from table to card layout on mobile)
- [ ] T069 [US3] Update Dashboard.html to use responsive layout (show MachineList on desktop, MachineCard on mobile)
- [ ] T070 [US3] Test responsive design on various screen sizes (desktop: ≥768px table, mobile: <768px cards)

#### Frontend - Delete Functionality

- [ ] T071 [P] [US3] Create DeleteConfirmModal component in frontend/src/components/DeleteConfirmModal.js (Bootstrap modal with machine details display)
- [ ] T072 [US3] Add delete button to machine list/card (show only for unreachable machines)
- [ ] T073 [US3] Implement delete button click handler in frontend/src/pages/Dashboard.html (show DeleteConfirmModal with machine details)
- [ ] T074 [US3] Implement delete confirmation in frontend/src/pages/Dashboard.html (call DELETE /api/machines/{id} API)
- [ ] T075 [US3] Remove deleted machine from UI in real-time (remove from DOM after successful deletion)
- [ ] T076 [US3] Implement cancel handler in DeleteConfirmModal (close modal without deletion)

**Checkpoint**: すべてのユーザーストーリーが独立して機能可能

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: 複数のユーザーストーリーに影響する改善

- [X] T077 [P] Create system architecture diagram in docs/architecture.md (component diagram, data flow, WebSocket communication)
- [X] T078 [P] Create deployment guide in docs/deployment.md (Docker Compose setup, systemd service, CAP_NET_RAW permissions)
- [X] T079 [P] Add health check endpoint GET /health in backend/src/api/endpoints/health.py (check database connection, return 200 OK or 503)
- [X] T080 Add comprehensive logging in backend (structured logging with timestamps, log levels, request IDs)
- [X] T081 [P] Add error boundary in frontend (global error handler for unhandled exceptions)
- [X] T082 [P] Optimize database queries with prepared statements and connection pooling
- [X] T083 Performance testing with 1000 machines (verify <1s API response, <100ms DB queries, <1s WebSocket notifications)
- [X] T084 Security review (verify IP/MAC validation, SQL injection protection, XSS protection, rate limiting)
- [X] T085 Run quickstart.md validation (verify all setup steps work from scratch)
- [X] T086 [P] Add API documentation generation with OpenAPI/Swagger UI
- [X] T087 Code cleanup and refactoring (remove unused imports, add type hints, docstrings)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: 依存関係なし - 即座に開始可能
- **Foundational (Phase 2)**: Setupの完了に依存 - すべてのユーザーストーリーをブロック
- **User Stories (Phase 3+)**: すべてFoundationalフェーズの完了に依存
  - ユーザーストーリーは並列で進行可能(スタッフがいる場合)
  - または優先順位順に順次実行(P1 → P2 → P3)
- **Polish (最終フェーズ)**: 必要なすべてのユーザーストーリーの完了に依存

### User Story Dependencies

- **User Story 1 (P1)**: Foundational (Phase 2)の後に開始可能 - 他のストーリーへの依存なし
- **User Story 2 (P2)**: Foundational (Phase 2)の後に開始可能 - US1と統合するが独立してテスト可能
  - US1のマシン登録機能に依存(監視するマシンが必要)
  - US1完了後に開始することを推奨
- **User Story 3 (P3)**: Foundational (Phase 2)の後に開始可能 - US1/US2と統合するが独立してテスト可能
  - US1のマシン一覧機能に依存(削除対象が必要)
  - US2の監視機能に依存(unreachableステータスの検証)
  - US1とUS2完了後に開始することを推奨

### Within Each User Story

- サービスレイヤー before エンドポイント
- バックエンドAPI before フロントエンド統合
- コア実装 before 統合
- ストーリー完了 before 次の優先度に移行

### Parallel Opportunities

- Setupでマーク[P]のすべてのタスクは並列実行可能
- Foundationalでマーク[P]のすべてのタスクは並列実行可能(Phase 2内)
- Foundationalフェーズ完了後、すべてのユーザーストーリーを並列開始可能(チーム能力が許せば)
- ユーザーストーリー内でマーク[P]のタスクは並列実行可能
- 異なるユーザーストーリーは異なるチームメンバーが並列作業可能

---

## Parallel Example: User Story 1

```bash
# User Story 1のバックエンドサービスとエンドポイントを並列起動:
Task T030: "Implement MachineService in backend/src/services/machine_service.py"
Task T031: "Implement PUT /api/machines/{ip_address} endpoint" (depends on T030)

# User Story 1のフロントエンドコンポーネントを並列起動:
Task T036: "Create MachineList component in frontend/src/components/MachineList.js"
Task T037: "Create Dashboard page in frontend/src/pages/Dashboard.html"
```

---

## Implementation Strategy

### MVP First (User Story 1のみ)

1. Phase 1: Setup完了
2. Phase 2: Foundational完了 (CRITICAL - すべてのストーリーをブロック)
3. Phase 3: User Story 1完了
4. **STOP and VALIDATE**: User Story 1を独立してテスト
5. 準備ができればデプロイ/デモ

### Incremental Delivery

1. Setup + Foundational完了 → 基盤準備完了
2. User Story 1追加 → 独立してテスト → デプロイ/デモ (MVP!)
3. User Story 2追加 → 独立してテスト → デプロイ/デモ
4. User Story 3追加 → 独立してテスト → デプロイ/デモ
5. 各ストーリーが以前のストーリーを壊すことなく価値を追加

### Parallel Team Strategy

複数の開発者がいる場合:

1. チーム全体でSetup + Foundationalを完了
2. Foundational完了後:
   - Developer A: User Story 1
   - Developer B: User Story 2(US1のマシン登録完了後に監視機能を開始)
   - Developer C: User Story 3(US1とUS2完了後に削除機能を開始)
3. ストーリーが独立して完了・統合

---

## Notes

- [P]タスク = 異なるファイル、依存関係なし
- [Story]ラベルは特定のユーザーストーリーにタスクをマッピング(追跡可能性のため)
- 各ユーザーストーリーは独立して完了・テスト可能であるべき
- 各タスクまたは論理的なグループの後にコミット
- どのチェックポイントでも停止してストーリーを独立して検証可能
- 避けるべきこと: 曖昧なタスク、同一ファイルの競合、独立性を壊すストーリー間の依存関係

