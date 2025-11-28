# KOENO-APP Frontend

フロントエンド（React/Vite）の起動・開発手順です。

## 1. 開発サーバーの起動

```bash
npm run dev
```

起動後、以下のローカルURLでアクセスできます（PCのみ）：

- <http://localhost:5173>

> **注意:** ログインや録音データのアップロードを行うには、別途 `src/api` でバックエンドサーバー（`python main.py`）が起動している必要があります。

---

## 2\. モバイル実機テスト / 外部アクセス (ngrok)

スマホでのNFC認証（Web NFC API）やHTTPS環境でのテストを行うには `ngrok` を使用します。 別ターミナルで以下を実行してください。

Bash

```
ngrok http 5173
```

実行すると、以下のような **Forwarding URL** が発行されます。

Plaintext

```
Forwarding    https://<ランダムな文字列>.ngrok-free.app -> http://localhost:5173
```

※ `<ランダムな文字列>` の部分（例: `collected-donte-oophytic` 等）は、ngrokを起動するたびに変わります。スマホからはこのURLを使ってアクセスしてください。

---

## 3\. 画面・URL一覧

| 画面 | パス | URL例 (ngrok利用時) | 用途 |
| --- | --- | --- | --- |
| **スマホ用** | `/` | `https://<...>.ngrok-free.app/` | 録音・PWA (NFC/PINログイン) |
| **PC管理者用** | `/review` | `https://<...>.ngrok-free.app/review` | 記録一覧・詳細・AI編集 |

Google スプレッドシートにエクスポート

### アクセス例

PCのレビュー画面を開く場合： `https://collected-donte-oophytic.ngrok-free.dev/review` （※ドメイン部分は発行されたものに置き換えてください）
