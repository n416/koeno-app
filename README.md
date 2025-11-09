# KOENO-APP (v2.2) - ハンズフリー音声記録to記録簿作成支援システム

## 1. 概要

KOENO-APP (v2.2) は、介護現場での「ハンズフリー」音声記録と、PCでの「高効率レビュー」を目的としたWebアプリケーションです。

* **PWA（スマホ）**: v2.2のコア機能。認証後、自動で録音が開始される「ハンズフリー」UIを提供します。録音データはローカルDB（Dexie.js）にJST（日本標準時）で保存され、オンライン時にバックグラウンド同期されます。
* **PC版（レビュー）**: PCブラウザからアクセスするレビュー画面。AI（Whisper, Pyannote）によって文字起こし・話者分離された結果を、入居者ごとに割り当て、Gemini APIによる要約・草案作成を行います。
* **管理者機能**: 介護士ID（NFC/PIN）のマスタ管理機能を提供します。

## 2. プロジェクト構成

* `src/api/` (Python/FastAPI)
    * `main.py`: APIサーバー（認証, DB操作, ID管理, レビューUI用API）
    * `run_worker.py`: AI処理ワーカー（文字起こし, 話者分離）
    * `setup_initial_admin.py`: 初回管理者セットアップスクリプト
    * `koeno_app.db`: SQLite データベース
* `src/web-v2/` (React/TypeScript)
    * v2.2のPWA（ハンズフリー録音） 兼 PCレビューUI
* `Caddyfile`: リバースプロキシ（Caddy）設定ファイル
* `ngrok.yml`: ngrokトンネル設定ファイル

## 3. システム前提条件

* Windows 10 / 11
* Python 3.12.x
* Node.js 20.x (LTS)
* **FFmpeg v7.x** (v8以降は `torchcodec` との互換性問題があるため非推奨)
* **Hugging Face アカウント**（AIモデルのダウンロードに必須）
* **ngrok アカウント**（スマホでのテストに必須）

## 4. 開発環境のセットアップ (初回のみ)

### ステップ 1: FFmpeg v7 の恒久インストール

AIライブラリ (pyannote) が音声ファイルを処理するために FFmpeg v7 が必要です。

1.  [Gyan.dev のリリースページ](https://www.gyan.dev/ffmpeg/builds/releases) から `ffmpeg-7.0`（または `7.1.1`）の `essentials_build.zip` をダウンロードします。
2.  Zipを解凍し、`C:\ffmpeg` などの固定パスに配置します。（`C:\ffmpeg\bin\ffmpeg.exe` となるように）
3.  Windowsの「システムのプロパティ」 > 「環境変数」を開き、「システム環境変数」の `Path` に、`C:\ffmpeg\bin` を追加します。
4.  ターミナルを**再起動**し、`ffmpeg -version` を実行して `ffmpeg version 7.x.x...` と表示されることを確認します。

### ステップ 2: バックエンド (Python) のセットアップ

1.  **仮想環境の作成:**
    ```bash
    cd src/api
    py -3.12 -m venv .venv
    ```
2.  **Hugging Face 認証:**
    ```powershell
    # 仮想環境のアクティベート
    .\.venv\Scripts\Activate.ps1
    # HF CLIのインストール
    pip install huggingface_hub==0.20.3
    # HF ログイン (トークンを貼り付け)
    hf auth login
    ```
3.  **Gated Model への同意（最重要）:** `hf auth login` が完了したら、**必ず**以下の4つのAIモデルのWebページにアクセスし、利用規約（user conditions）に**すべて同意**してください。
    * [pyannote/speaker-diarization-3.1](https://huggingface.co/pyannote/speaker-diarization-3.1)
    * [pyannote/voice-activity-detection](https://huggingface.co/pyannote/voice-activity-detection)
    * [pyannote/segmentation](https://huggingface.co/pyannote/segmentation)
    * [pyannote/embedding](https://huggingface.co/pyannote/embedding)
4.  **ライブラリのインストール:**
    ```bash
    pip install -r requirements.txt
    ```
5.  **初回管理者セットアップ:** サーバーを起動する前に、システムの「最初の管理者」を登録します。
    ```bash
    # (.venv をアクティベートした状態で)
    py .\setup_initial_admin.py
    ```
    (対話形式で、管理者ID（例: `admin-pin`）と名前を入力します)

### ステップ 3: フロントエンド (React) のセットアップ

1.  **ライブラリのインストール:**
    ```bash
    cd src/web-v2
    npm install
    ```
2.  **環境変数の設定:** `.env` ファイルが `VITE_API_BASE_URL=/api` となっていることを確認します。

## 5. 開発環境の実行手順 (4ターミナル必須)

開発・テスト環境には、以下の4つのターミナル（プロセス）を同時に起動する必要があります。

### ターミナル 1: APIサーバー (FastAPI)

```powershell
# 1. APIディレクトリへ移動
cd src/api
# 2. 仮想環境を有効化
.\.venv\Scripts\Activate.ps1
# 3. APIサーバーを起動 (127.0.0.1:8000)
py .\main.py
````

### ターミナル 2: AIワーカー

PowerShell

```
# 1. APIディレクトリへ移動
cd src/api
# 2. 仮想環境を有効化
.\.venv\Scripts\Activate.ps1
# 3. ★重要: HF_TOKEN を環境変数に設定
$env:HF_TOKEN = "hf_YOUR_HUGGINGFACE_TOKEN"
# 4. AIワーカーを起動
py .\run_worker.py
```

### ターミナル 3: フロントエンド (Vite)

Bash

```
# 1. フロントエンドディレクトリへ移動
cd src/web-v2
# 2. Vite 開発サーバーを起動 (192.168.0.16:5173 など)
npm run dev
```

### ターミナル 4: リバースプロキシ (Caddy & ngrok)

スマホでのPWAテスト（Web NFC、ハンズフリー録音）には、CaddyとngrokによるHTTPSリバースプロキシ環境が**必須**です。

1. **Caddyの起動:**
    
    - プロジェクトルート（`Caddyfile` がある場所）で以下を実行します。
        
    - `caddy run --config Caddyfile`
        
2. **ngrokの起動:**
    
    - （Caddyとは別のターミナルで）プロジェクトルート（`ngrok.yml` がある場所）で以下を実行します。
        
    - `ngrok start --all --config ngrok.yml`
        

これにより発行された `https://...ngrok-free.dev` のURLにスマホからアクセスすることで、すべての機能がテスト可能になります。