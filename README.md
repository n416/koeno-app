# KOENO-APP (話者分離・文字起こしWebアプリ)

このリポジトリは、「特定の人の声」と「それ以外の人の声」を分離して文字起こしする「カルテアプリ」の技術検証（PoC）およびプロトタイプです。

モノレポ構成を採用しており、`src/api/`（バックエンド）と `src/web/`（フロントエンド）が含まれています。

## 📍 プロジェクト構成

* `src/api/`: **バックエンド API サーバー**
    * Python (3.12) + FastAPI
    * AIモデル (`pyannote`, `speechbrain`, `whisper`) をロードし、`/transcribe` エンドポイントを提供します。
    * 詳細は `src/api/README.md` を参照してください。
* `src/web/`: **フロントエンド Web アプリ**
    * React (Vite + TypeScript) + Redux Toolkit
    * 録音/アップロードUIを提供し、`/transcribe` API を呼び出して結果を表示します。
    * 詳細は `src/web/README.md` を参照してください。
* `src/poc/`: **初期技術検証（PoC）**
    * APIサーバーの核となるロジック（分離・比較・遡及判定）を検証したPythonスクリプト群が格納されています。
    * 詳細は `src/poc/README.md` を参照してください。

## 🚀 開発環境の実行手順（Windows）

このアプリを実行するには、**2つのターミナル**を同時に起動する必要があります。

### 共通の前提条件

1.  **Python 3.12**
2.  **Node.js** (npm)
3.  **FFmpeg v7.x** (v8以降は `pyannote/torchcodec` との互換性問題があるため非推奨。[詳細](src/api/README.md))
4.  **Hugging Face 認証** (`hf auth login` が完了しており、[必要な規約](src/api/README.md)に同意済みであること)

---

### ターミナル 1: APIサーバー (バックエンド) の起動

1.  `src/api/` フォルダに移動します。
    ```bash
    cd src/api
    ```
2.  （初回のみ）仮想環境のセットアップとライブラリのインストールを行います。
    ```bash
    py -3.12 -m venv .venv
    .\.venv\Scripts\Activate.ps1
    pip install -r requirements.txt
    ```
3.  （2回目以降）仮想環境に入り、FFmpeg v7 のPATHを通します。
    ```powershell
    .\.venv\Scripts\Activate.ps1
    $env:Path = "C:\ffmpeg\bin;" + $env:Path 
    ```
4.  サーバーを起動します。
    ```bash
    py -3.12 .\main.py
    ```
    * `Uvicorn running on http://127.0.0.1:8000` と表示されれば成功です。

---

### ターミナル 2: Webアプリ (フロントエンド) の起動

1.  **新しいターミナル**を開き、`src/web/` フォルダに移動します。
    ```bash
    cd src/web
    ```
2.  （初回のみ）ライブラリをインストールします。
    ```bash
    npm install
    ```
3.  （2回目以降）開発サーバーを起動します。
    ```bash
    npm run dev
    ```
    * `Local: http://localhost:5173/` と表示されれば成功です。

---

### 実行

ブラウザで `http://localhost:5173/` にアクセスし、UIの指示に従って操作してください。