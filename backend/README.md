# VXLAN Manager - Backend

FastAPI + asyncpg + PostgreSQL によるVXLANマシン管理システムのバックエンド実装

## セットアップ

### ローカル開発環境

```bash
# 仮想環境の作成
python3.11 -m venv venv
source venv/bin/activate

# 依存関係のインストール
pip install -e .[dev]

# 環境変数の設定
cp ../.env.example ../.env
# .envファイルを編集

# データベースマイグレーション
alembic upgrade head

# 開発サーバー起動
uvicorn src.main:app --reload --host 0.0.0.0 --port 8000
```

### Docker環境

```bash
# リポジトリルートで実行
docker-compose up -d backend
```

## テスト

```bash
# すべてのテスト
pytest

# ユニットテストのみ
pytest tests/unit -v

# 統合テスト
pytest tests/integration -v

# カバレッジ
pytest --cov=src --cov-report=html
```

## コードフォーマット

```bash
# Ruffによるリント
ruff check .

# 自動修正
ruff check . --fix
```

## API仕様

起動後、以下のURLでSwagger UIを確認できます:
- http://localhost:8000/docs
- http://localhost:8000/redoc
