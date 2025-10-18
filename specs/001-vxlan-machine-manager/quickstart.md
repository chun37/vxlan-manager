# Quickstart Guide: VXLAN Machine Manager

**Feature**: VXLANマシン管理システム
**Date**: 2025-10-18

このガイドでは、VXLAN Machine Managerの開発環境をローカルで構築し、基本的な動作確認を行う手順を説明します。

## Prerequisites

### Required Software

- **Python**: 3.11以上
- **PostgreSQL**: 14以上
- **Node.js**: 18以上(フロントエンド開発用)
- **Git**: バージョン管理
- **Docker & Docker Compose**: (推奨) コンテナ環境での実行

### System Requirements

- **OS**: Linux (Ubuntu 22.04推奨), macOS 12+, Windows 11 (WSL2使用)
- **RAM**: 最低4GB、推奨8GB
- **Disk**: 最低5GB空き容量

## Setup Steps

### Option 1: Docker Compose (推奨)

最も簡単な方法は、Docker Composeを使用してすべてのサービスをコンテナで起動することです。

#### 1. リポジトリのクローン

```bash
git clone <repository-url>
cd vxlan-manager
git checkout 001-vxlan-machine-manager
```

#### 2. 環境変数の設定

```bash
cp .env.example .env
# .envファイルを編集(必要に応じて)
```

`.env`ファイルの例:

```env
# Database
POSTGRES_USER=vxlan_admin
POSTGRES_PASSWORD=changeme_secure_password
POSTGRES_DB=vxlan_manager
DATABASE_URL=postgresql+asyncpg://vxlan_admin:changeme_secure_password@db:5432/vxlan_manager

# Application
API_HOST=0.0.0.0
API_PORT=8000
PING_INTERVAL=60
MAX_PARALLEL_PINGS=100
MAX_MACHINES=1000

# Logging
LOG_LEVEL=INFO
```

#### 3. Docker Composeで起動

```bash
docker-compose up -d
```

これにより以下のサービスが起動します:
- **backend**: FastAPIバックエンド (ポート8000)
- **frontend**: 静的ファイルサーバー (ポート3000)
- **db**: PostgreSQL 14 (ポート5432)

#### 4. データベースマイグレーション

```bash
docker-compose exec backend alembic upgrade head
```

#### 5. 動作確認

ブラウザで `http://localhost:3000` を開き、管理画面が表示されることを確認します。

---

### Option 2: ローカル開発環境(Python仮想環境)

Docker Composeを使わず、ローカル環境で直接実行する場合の手順です。

#### 1. PostgreSQLのインストールと起動

**Ubuntu/Debian**:
```bash
sudo apt update
sudo apt install postgresql-14 postgresql-contrib
sudo systemctl start postgresql
sudo systemctl enable postgresql
```

**macOS (Homebrew)**:
```bash
brew install postgresql@14
brew services start postgresql@14
```

#### 2. データベースとユーザーの作成

```bash
sudo -u postgres psql
```

PostgreSQLプロンプトで:
```sql
CREATE USER vxlan_admin WITH PASSWORD 'your_secure_password';
CREATE DATABASE vxlan_manager OWNER vxlan_admin;
GRANT ALL PRIVILEGES ON DATABASE vxlan_manager TO vxlan_admin;
\q
```

#### 3. Pythonバックエンドのセットアップ

```bash
cd backend

# 仮想環境の作成
python3.11 -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate

# 依存関係のインストール
pip install --upgrade pip
pip install -r requirements.txt

# 環境変数の設定
cp .env.example .env
# .envファイルを編集してDATABASE_URLを設定

# データベースマイグレーション
alembic upgrade head
```

#### 4. バックエンドの起動

```bash
# 開発モード(ホットリロード有効)
uvicorn src.main:app --reload --host 0.0.0.0 --port 8000
```

#### 5. フロントエンドのセットアップと起動

```bash
cd ../frontend

# 依存関係のインストール
npm install

# 開発サーバー起動
npm run dev
```

#### 6. 動作確認

- バックエンドAPI: http://localhost:8000/docs (Swagger UI)
- フロントエンド: http://localhost:3000

---

## Basic Usage

### 1. マシンの登録(マシン側から実行)

各マシンから以下のコマンドを実行してマシン情報を登録します:

```bash
#!/bin/bash
# register-machine.sh

MANAGER_URL="http://192.168.100.1:8000"  # VXLANマネージャーのIP
HOSTNAME=$(hostname)
IP_ADDRESS=$(hostname -I | awk '{print $1}')
MAC_ADDRESS=$(ip link show | grep -A1 'state UP' | grep link | awk '{print $2}')

curl -X PUT "${MANAGER_URL}/api/machines/${IP_ADDRESS}" \
  -H "Content-Type: application/json" \
  -d "{\"hostname\": \"${HOSTNAME}\", \"mac_address\": \"${MAC_ADDRESS}\"}"
```

スクリプトを実行可能にして実行:

```bash
chmod +x register-machine.sh
./register-machine.sh
```

### 2. Web管理画面でマシン一覧を確認

ブラウザで管理画面を開くと、登録されたマシンが一覧表示されます:

- **接続中**: 緑色の●マーク
- **接続不可**: 赤色の○マーク

### 3. リアルタイム状態更新の確認

管理画面を開いたまま、マシンの電源を切るかネットワークを切断します。
約12分後(60秒 + 120秒 + 240秒の3回のpingリトライ後)、該当マシンのステータスが「接続不可」に変わります。

### 4. マシンの削除

接続不可のマシンの右側にある「削除」ボタンをクリックすると、確認ダイアログが表示されます。
「削除」を確定すると、マシンが一覧から削除されます。

---

## Testing

### ユニットテストの実行

```bash
cd backend
source venv/bin/activate
pytest tests/unit -v
```

### 統合テストの実行

```bash
pytest tests/integration -v
```

### E2Eテストの実行(フロントエンド)

```bash
cd frontend
npm run test:e2e
```

### APIコントラクトテスト

```bash
cd backend
pytest tests/contract -v
```

---

## Verification Checklist

開発環境が正しくセットアップされたことを確認するチェックリスト:

- [ ] PostgreSQLが起動している(`psql -U vxlan_admin -d vxlan_manager`で接続可能)
- [ ] データベースマイグレーションが完了している(machinesテーブルが存在)
- [ ] バックエンドAPIが起動している(`curl http://localhost:8000/health`が200 OK)
- [ ] Swagger UIが表示される(http://localhost:8000/docs)
- [ ] フロントエンドが表示される(http://localhost:3000)
- [ ] マシン登録APIが動作する(`curl -X PUT http://localhost:8000/api/machines/192.168.1.100 ...`が成功)
- [ ] マシン一覧APIが動作する(`curl http://localhost:8000/api/machines`がJSON返却)
- [ ] WebSocket接続が確立できる(ブラウザコンソールでWebSocketエラーなし)
- [ ] すべてのユニットテストがパスする(`pytest tests/unit`)

---

## Troubleshooting

### Q: PostgreSQL接続エラーが発生する

**A**: 以下を確認してください:
1. PostgreSQLが起動しているか: `sudo systemctl status postgresql`
2. `.env`ファイルの`DATABASE_URL`が正しいか
3. ファイアウォールでポート5432が開いているか

### Q: Ping監視が動作しない

**A**: 以下を確認してください:
1. バックエンドプロセスがroot権限で実行されているか(ICMP pingにはroot権限が必要な場合がある)
2. `icmplib`ライブラリがインストールされているか: `pip list | grep icmplib`
3. ログにエラーが出ていないか: `docker-compose logs backend`

### Q: WebSocket接続が切断される

**A**: 以下を確認してください:
1. ファイアウォールがWebSocket(ポート8000)をブロックしていないか
2. プロキシサーバーがWebSocketアップグレードをサポートしているか
3. ブラウザのコンソールにエラーメッセージが表示されていないか

### Q: フロントエンドが表示されない

**A**: 以下を確認してください:
1. Nginxまたは開発サーバーが起動しているか
2. ポート3000が他のプロセスで使用されていないか: `lsof -i :3000`
3. CORSエラーが出ていないか(バックエンドの`middleware.py`でCORS設定確認)

---

## Next Steps

開発環境が正常に動作したら、以下のステップに進んでください:

1. **実装開始**: `/speckit.tasks`コマンドでタスクリストを生成し、実装を開始
2. **コードレビュー**: 憲章準拠チェック(`.specify/memory/constitution.md`参照)
3. **テスト追加**: 各機能の統合テストを追加
4. **デプロイ準備**: `docs/deployment.md`を参照してVXLANネットワーク内サーバーへのデプロイ準備

---

## Resources

- **API仕様**: `specs/001-vxlan-machine-manager/contracts/api-spec.yaml`
- **データモデル**: `specs/001-vxlan-machine-manager/data-model.md`
- **実装計画**: `specs/001-vxlan-machine-manager/plan.md`
- **憲章**: `.specify/memory/constitution.md`
