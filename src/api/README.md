# KOENO-APP API サーバー (v2.0) (src/api/README.md)

## 1. 概要

この `src/api` フォルダは、KOENO-APP (v2.0) のバックエンド機能を提供します。
PWA（`web-v2`）からの録音データ（`.webm`）を受け取り、データベース（SQLite）に保存し、AIワーカーが非同期で文字起こし処理を行います。

- **`main.py`**: FastAPI サーバー。認証 (`/authenticate`)、録音アップロード (`/upload_recording`)、レビュー取得 (`/my_records`)、ID管理 (`/admin/caregivers`) のAPIを提供します。
- **`run_worker.py`**: AIワーカー。DBを監視し、`pending` 状態の録音をAI（Whisper, Pyannote）で処理します。
- **`setup_initial_admin.py`**: 初回管理者セットアップ用の対話型スクリプトです。

## 2. システム前提条件

- **Windows 10 / 11**
- **Python 3.12.x**
- **FFmpeg v7.x** (v8以降は `torchcodec` との互換性問題があるため非推奨)
- **Hugging Face アカウント**（AIモデルのダウンロードに必須）

## 3. ステップ1: FFmpeg v7.x の恒久インストール (PO 4.1)

AIライブラリ (pyannote) が音声ファイルを処理するために FFmpeg v7 が必要です。

1.  [Gyan.dev のリリースページ](https://www.gyan.dev/ffmpeg/builds/releases) から `ffmpeg-7.0`（または `7.1.1`）の `essentials_build.zip` をダウンロードします。
2.  Zipを解凍し、`C:\ffmpeg` などの固定パスに配置します。（`C:\ffmpeg\bin\ffmpeg.exe` となるように）
3.  **【恒久設定】** Windowsの「システムのプロパティ」 > 「環境変数」を開き、「システム環境変数」の `Path` に、`C:\ffmpeg\bin` を追加します。
4.  ターミナルを**再起動**し、`ffmpeg -version` を実行して `ffmpeg version 7.x.x...` と表示されることを確認します。

## 4. ステップ2: Python 仮想環境の構築

`src/api/` フォルダ（このREADMEがある場所）で、仮想環境（`.venv`）を作成し、アクティベートします。

1.  **仮想環境の作成**（初回のみ）:
    ```bash
    py -3.12 -m venv .venv
    ```
2.  **仮想環境のアクティベート**（ターミナルを開くたび）:
    ```powershell
    .\.venv\Scripts\Activate.ps1
    ```

## 5. ステップ3: Hugging Face 認証 (PO 4.1)

AIワーカー (`run_worker.py`) がAIモデル（特に `pyannote/speaker-diarization-3.1`）をダウンロードするために、Hugging Face (HF) の認証が必要です。

1.  **Hugging Face CLI のインストール**（初回のみ）:
    ```bash
    pip install huggingface_hub==0.20.3
    ```
2.  **ログイン**（初回のみ）: ターミナルで `hf auth login` を実行し、トークンを貼り付けます。
3.  **Gated Model への同意（最重要）:** `hf auth login` が完了したら、必ず以下の4つのAIモデルのWebページにアクセスし、利用規約（user conditions）に**すべて同意**してください。
    1.  [pyannote/speaker-diarization-3.1](https://huggingface.co/pyannote/speaker-diarization-3.1)
    2.  [pyannote/voice-activity-detection](https://huggingface.co/pyannote/voice-activity-detection)
    3.  [pyannote/segmentation](https://huggingface.co/pyannote/segmentation)
    4.  [pyannote/embedding](https://huggingface.co/pyannote/embedding)
4.  **【重要】環境変数の設定:** `run_worker.py` は、`HF_TOKEN` 環境変数を参照します。サーバーを起動するターミナル（ステップ7）で、HFトークン（`hf_...`）を環境変数に設定する必要があります。

## 6. ステップ4: Python ライブラリのインストール

`requirements.txt` にAPIサーバーとAIワーカーに必要なライブラリが定義されています。

```bash
pip install -r requirements.txt
## 7\. ステップ5: 【重要】初回管理者セットアップ (PO 4.1)

サーバーを起動する前に、Task 8 で作成した `setup_initial_admin.py` を**一度だけ**実行し、システムの「最初の管理者」を登録する必要があります。

Bash

```
# (.venv をアクティベートした状態で)
py .\setup_initial_admin.py
```

対話形式で、管理者として使用したいID（例: `admin-pin`）と名前を入力してください。

## 8\. ステップ6: サーバーの起動 (PO 4.1)

本番運用には、**「APIサーバー」と「AIワーカー」の2つのプロセスを同時に起動**する必要があります。2つのターミナルを準備してください。

**ターミナル 1: APIサーバー (main.py) の起動**

PowerShell

```
# (.venv をアクティベートした状態で)
py .\main.py
```

(Uvicorn が 127.0.0.1:8000 で起動します)

**ターミナル 2: AIワーカー (run\_worker.py) の起動**

PowerShell

```
# (.venv をアクティベートした状態で)

# ★ PO 4.1: HF_TOKEN を環境変数に設定 (Windows PowerShell の場合)
$env:HF_TOKEN = "hf_YOUR_HUGGINGFACE_TOKEN"

py .\run_worker.py
```

(AIモデルのロードが開始され、DBの 'pending' 監視が始まります)

## 9\. ステップ7: 開発の終了

サーバー（`main.py`）とワーカー（`run_worker.py`）を停止（`Ctrl+C`）したら、以下のコマンドで仮想環境を抜けます。

PowerShell

```
deactivate
```