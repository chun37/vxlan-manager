# VXLAN Machine Manager - Frontend (Next.js)

Next.js + TypeScript + Tailwind CSSで実装されたフロントエンドアプリケーション。

## 技術スタック

- **Next.js 15** - Reactフレームワーク (App Router)
- **TypeScript** - 型安全性
- **Tailwind CSS** - ユーティリティファーストCSSフレームワーク
- **WebSocket** - リアルタイム通信

## 主な機能

- マシン一覧表示（テーブル/カード切り替え）
- WebSocketによるリアルタイム状態更新
- マシン削除機能
- 状態フィルタリング（全て/接続中/接続不可）
- レスポンシブデザイン（デスクトップ/モバイル対応）

## 開発環境のセットアップ

### ローカル開発

```bash
# 依存パッケージのインストール
npm install

# 環境変数の設定
cp .env.local.example .env.local

# 開発サーバーの起動
npm run dev
```

ブラウザで http://localhost:3000 にアクセス

### Docker開発環境

```bash
# プロジェクトルートで実行
docker-compose -f docker-compose.yml -f docker-compose.dev.yml up frontend
```

## プロダクションビルド

```bash
# ビルド
npm run build

# 本番サーバーの起動
npm start
```

### Dockerプロダクションビルド

```bash
# プロジェクトルートで実行
docker-compose up --build frontend
```

## プロジェクト構造

```
frontend/
├── app/                    # Next.js App Router
│   ├── layout.tsx         # ルートレイアウト
│   ├── page.tsx           # ダッシュボードページ
│   └── globals.css        # グローバルスタイル
├── components/            # Reactコンポーネント
│   ├── ConnectionStatus.tsx
│   ├── StatusFilter.tsx
│   ├── MachineList.tsx
│   └── MachineCard.tsx
├── hooks/                 # カスタムReactフック
│   ├── useMachines.ts
│   └── useWebSocket.ts
├── lib/                   # ユーティリティとクライアント
│   ├── api.ts            # REST APIクライアント
│   ├── websocket.ts      # WebSocketクライアント
│   └── utils.ts          # ヘルパー関数
├── types/                 # TypeScript型定義
│   └── machine.ts
└── public/               # 静的ファイル
```

## 環境変数

`.env.local` ファイルで以下の環境変数を設定:

```env
NEXT_PUBLIC_API_URL=http://localhost:8000
NEXT_PUBLIC_WS_URL=ws://localhost:8000
```

## API統合

バックエンドAPIエンドポイント:

- `GET /api/machines` - マシン一覧取得
- `DELETE /api/machines/:id` - マシン削除
- `WS /ws/status` - WebSocket接続（リアルタイム更新）

## スタイリング

Tailwind CSSを使用したユーティリティファーストアプローチ。

主なカスタマイズ:
- レスポンシブブレークポイント: sm, md, lg, xl
- カスタムカラー: status-active, status-unreachable
- アニメーション: status-changed (ハイライト効果)

## トラブルシューティング

### WebSocket接続エラー

- バックエンドが起動しているか確認
- `NEXT_PUBLIC_WS_URL` が正しく設定されているか確認
- ブラウザのコンソールでエラーメッセージを確認

### APIリクエストエラー

- バックエンドのCORS設定を確認
- `NEXT_PUBLIC_API_URL` が正しく設定されているか確認
