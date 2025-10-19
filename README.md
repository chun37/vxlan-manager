# VXLAN Machine Manager

VXLANネットワーク内のマシンを自動登録・監視し、接続状態をリアルタイムでWeb管理画面に表示するシステム

<img width="1698" height="1072" alt="image" src="https://github.com/user-attachments/assets/f5c82c6b-35d3-4758-b60f-bce0802b8c57" />

## 特徴

- **自動登録**: マシンから簡単なスクリプト実行で自動登録
- **リアルタイム監視**: ICMP pingによる死活監視 (最大1000台)
- **WebSocket通知**: 状態変化を即座にブラウザに通知
- **レスポンシブUI**: PC/スマートフォン両対応
- **Exponential Backoff**: 賢い監視間隔調整で効率的なリソース使用

## アーキテクチャ

- **Backend**: FastAPI + Python 3.11+ + asyncpg + PostgreSQL 14+
- **Frontend**: Next.js 15 + TypeScript + Tailwind CSS
- **Monitoring**: icmplib (非同期ICMP ping)
- **Real-time**: WebSocket通信

詳細は [docs/architecture.md](docs/architecture.md) を参照。

## クイックスタート

### Docker Compose (推奨)

```bash
# リポジトリのクローン
git clone <repository-url>
cd vxlan-manager

# 環境変数の設定
cp .env.example .env
# .envファイルを編集 (DATABASE_URLのパスワード変更など)

# サービス起動
docker-compose up -d

# ログ確認
docker-compose logs -f backend

# ブラウザでアクセス
open http://localhost:3000
```

### ローカル開発環境

詳細は [specs/001-vxlan-machine-manager/quickstart.md](specs/001-vxlan-machine-manager/quickstart.md) を参照。

## マシンの登録

各マシンから以下のスクリプトを実行:

```bash
# スクリプトのダウンロード
wget http://<manager-server-ip>:8000/static/register-machine.sh
chmod +x register-machine.sh

# 環境変数を設定して実行
export VXLAN_MANAGER_URL="http://192.168.100.1:8000"
./register-machine.sh
```

## ドキュメント

- **[Architecture](docs/architecture.md)**: システムアーキテクチャ
- **[Deployment](docs/deployment.md)**: デプロイメントガイド
- **[Quickstart](specs/001-vxlan-machine-manager/quickstart.md)**: 開発環境セットアップ
- **[Specification](specs/001-vxlan-machine-manager/spec.md)**: 機能仕様
- **[Implementation Plan](specs/001-vxlan-machine-manager/plan.md)**: 実装計画
- **[Tasks](specs/001-vxlan-machine-manager/tasks.md)**: タスクリスト

## API ドキュメント

起動後、以下のURLでSwagger UIを確認:

- http://localhost:8000/docs
- http://localhost:8000/redoc

## 主要機能

### User Story 1: マシン自動登録と一覧表示
- マシンからHTTP PUTで登録 (Upsert)
- Web画面で一覧表示
- ステータスフィルタ、ページネーション

### User Story 2: リアルタイム死活監視
- ICMP pingによる定期監視
- Exponential Backoff (60s→3600s)
- WebSocketでリアルタイム通知
- 3回連続失敗で「接続不可」判定

### User Story 3: モバイル対応とマシン削除
- レスポンシブデザイン (テーブル/カード切り替え)
- 接続不可マシンの削除機能
- 削除確認ダイアログ

## 開発

### フロントエンド開発

```bash
cd frontend

# 依存パッケージのインストール
npm install

# 開発サーバーの起動
npm run dev

# TypeScriptチェック
npx tsc --noEmit

# プロダクションビルド
npm run build
```

詳細は [frontend/README.md](frontend/README.md) を参照。

### バックエンドテスト

```bash
cd backend
source venv/bin/activate

# すべてのテスト
pytest

# ユニットテストのみ
pytest tests/unit -v

# カバレッジ
pytest --cov=src --cov-report=html
```

### コードフォーマット

```bash
cd backend
ruff check .
ruff check . --fix
```

## デプロイ

本番環境へのデプロイ手順は [docs/deployment.md](docs/deployment.md) を参照。

## ライセンス

MIT

## 貢献

Issue、Pull Requestを歓迎します。
