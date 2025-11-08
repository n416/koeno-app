# KOENO-APP (v2.0) - PWA音声記録システム

## 1. 概要

KOENO-APP (v2.0) は、介護現場での音声記録とレビューを目的としたWebアプリケーションです。

* **PWA（スマホ）**: オフライン対応の録音インターフェース。録音データはローカルDB（Dexie.js）に保存され、オンライン時に自動でバックグラウンド同期されます。
* **PC版（レビュー）**: PCブラウザからアクセスするレビュー画面。AI（Whisper, Pyannote）によって文字起こし・話者分離された結果を確認・修正します。
* **管理者機能**: 介護士ID（NFC/PIN）のマスタ管理機能を提供します。

## 2. プロジェクト構成 (v2.0)

-   `src/api/` (Python/FastAPI)
    -   `main.py`: APIサーバー（認証, DB操作, ID管理）
    -   `run_worker.py`: AI処理ワーカー（文字起こし, 話者分離）
    -   `setup_initial_admin.py`: 初回管理者セットアップスクリプト
    -   `koeno_app.db`: SQLite データベース
-   `src/web-v2/` (React/TypeScript)
    -   v2.0のPWAフロントエンド（MUI + PWA (Vite) + Dexie.js）
-   `Caddyfile`: リバースプロキシ（Caddy）設定ファイル
-   `ngrok.yml`: ngrokトンネル設定ファイル

## 3. 開発環境の実行手順 (4ターミナル必須) (PO 4.2)

完全な開発・テスト環境には、以下の4つのターミナル（プロセス）を同時に起動する必要があります。

### ターミナル 1: APIサーバー (FastAPI)

1.  `cd src/api`
2.  `.\.venv\Scripts\Activate.ps1` (仮想環境を有効化)
3.  `py .\main.py` (APIサーバーを 127.0.0.1:8000 で起動)

### ターミナル 2: AIワーカー

1.  `cd src/api`
2.  `.\.venv\Scripts\Activate.ps1` (仮想環境を有効化)
3.  `$env:HF_TOKEN = "hf_YOUR_HUGGINGFACE_TOKEN"` (HuggingFaceトークンを設定)
4.  `py .\run_worker.py` (AIワーカーを起動)

### ターミナル 3: フロントエンド (Vite)

1.  `cd src/web-v2`
2.  `npm install` (初回のみ)
3.  `npm run dev` (Vite 開発サーバーを 192.168.0.16:5173 で起動)

### ターミナル 4: リバースプロキシ (Caddy & ngrok)

1.  `cd [プロジェクトルート]`
2.  (Caddyを起動) `caddy run --config Caddyfile`
3.  (別ターミナルまたはタブで ngrok を起動) `ngrok start --all --config ngrok.yml`
    * (ngrok.yml の `default` トンネルが起動します)

## 4. テスト環境 (リバースプロキシ) 構築手順 (PO 4.2)

スマホ（Android）からのWeb NFCテストや、`https://` 環境でのPWA（Service Worker）テストには、CaddyとngrokによるHTTPSリバースプロキシ環境が**必須**です。

### 4.1. 必要なツール

1.  **Caddy v2:**
    * インストール: `winget install Caddy` または公式サイトからダウンロード。
    * 設定: プロジェクトルートの `Caddyfile` に設定が定義済みです。Caddyは 192.168.0.16:80 で待機し、`/api` を T1（API）へ、他を T3（Vite）へ転送します。
2.  **ngrok:**
    * インストール: `winget install ngrok.ngrok` または公式サイトからダウンロード。
    * 認証 (初回のみ): `ngrok authtoken YOUR_NGROK_TOKEN` を実行。
    * 設定: プロジェクトルートの `ngrok.yml` に設定が定義済みです。Caddy (192.168.0.16:80) へのトンネルを定義しています。

### 4.2. 実行 (ターミナル 4)

1.  **Caddyの起動:**
    * プロジェクトルート（`Caddyfile` がある場所）で以下を実行します。
    * `caddy run --config Caddyfile`
2.  **ngrokの起動:**
    * プロジェクトルート（`ngrok.yml` がある場所）で以下を実行します。
    * `ngrok start --all --config ngrok.yml`

これにより発行された `https://...ngrok-free.dev` のURLにスマホからアクセスすることで、Web NFC を含むすべての機能がテスト可能になります。