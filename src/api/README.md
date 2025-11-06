# KOENO-APP API サーバー (`src/api/README.md`)

## 1\. 概要

このAPIサーバー（FastAPI）は、`src/poc/` フォルダで検証された話者分離（Diarization）および声紋認識（Verification）のAIロジックを、Webフロントエンドから利用可能な `POST /transcribe` エンドポイントとして提供します。

## 2\. システム前提条件

- **Windows 10 / 11**
    
- **Python 3.12.x**
    
- **FFmpeg v7.x** (v8以降は `torchcodec` との互換性問題があるため非推奨)
    
- **Hugging Face アカウント**（Gated Modelへのアクセスに必須）
    

## 3\. ステップ1: FFmpeg v7.x のインストール

AIライブラリ（`pyannote` / `torchcodec`）がWindowsで正しく動作するために、FFmpeg v7 が必要です。

1. **（もしv8が入っている場合）v8をアンインストール:**
    
    Bash
    
    ```
    winget uninstall ffmpeg
    ```
    
2. **v7 のダウンロード:** [Gyan.dev のリリースページ](https://www.google.com/search?q=https://www.gyan.dev/ffmpeg/builds/releases)から `ffmpeg-7.0`（または `7.1.1`）の `essentials_build.zip` をダウンロードします。
    
3. **v7 の配置:** Zipを解凍し、`C:\ffmpeg` などの固定パスに配置します。
    
4. **PATHの設定:** PowerShell（ターミナル）を開き、以下のコマンドで**一時的**にPATHを通します。（このPoCを実行するターミナルを開くたびに、このコマンドが必要になります）
    
    PowerShell
    
    ```
    # FFmpeg v7 を解凍した bin フォルダを指定
    $env:Path = "C:\ffmpeg\bin;" + $env:Path
    ```
    
5. **確認:** 同じターミナルで `ffmpeg -version` を実行し、`ffmpeg version 7.x.x...` と表示されることを確認します。
    

## 4\. ステップ2: Python 仮想環境の構築

`src/api/` フォルダ（このREADMEがある場所）で、仮想環境（`.venv`）を作成し、アクティベートします。

1. **仮想環境の作成**（初回のみ）:
    
    Bash
    
    ```
    py -3.12 -m venv .venv
    ```
    
2. **仮想環境のアクティベート**（ターミナルを開くたび）:
    
    PowerShell
    
    ```
    .\.venv\Scripts\Activate.ps1
    ```
    
    _(プロンプトの先頭に `(.venv)` と表示されれば成功です)_
    

## 5\. ステップ3: Hugging Face 認証

AIモデルをダウンロードするための認証を行います。（`src/poc/` で実行済みでも、`.venv` 環境で再度必要になる場合があります）

1. **Hugging Face CLI のインストール**（初回のみ）: （PoC環境で動作確認済みの `0.20.3` を指定）
    
    Bash
    
    ```
    pip install huggingface_hub==0.20.3
    ```
    
2. **ログイン**（初回のみ）: ターミナルで `hf auth login` を実行し、トークンを貼り付けます。
    
3. **Gated Model への同意（最重要）:** `hf auth login` が完了したら、**必ず**以下の4つのAIモデルのWebページにアクセスし、利用規約（user conditions）に**すべて同意**してください。（これを怠ると、サーバー起動時にダウンロードエラーが発生します）
    
    1. [pyannote/speaker-diarization-3.1](https://huggingface.co/pyannote/speaker-diarization-3.1)
        
    2. [pyannote/voice-activity-detection](https://huggingface.co/pyannote/voice-activity-detection)
        
    3. [pyannote/segmentation](https://huggingface.co/pyannote/segmentation)
        
    4. [pyannote/embedding](https://huggingface.co/pyannote/embedding)
        

## 6\. ステップ4: Python ライブラリのインストール

PoCで検証済みの「黄金の環境」に基づき、`requirements.txt` をインストールします。

1. **`src/api/requirements.txt` の内容:**
    
    Plaintext
    
    ```
    # ----------------------------------------------------
    # APIサーバー用 (Python 3.12 / FFmpeg v7)
    # ----------------------------------------------------
    
    # --- APIサーバー ---
    fastapi
    uvicorn[standard]
    
    # --- PoC 1a/1c (Whisper) ---
    openai-whisper
    
    # --- PoC 1a/1b/1c (pyannote & speechbrain) ---
    pyannote.audio==3.1.1
    torch==2.2.0
    torchaudio==2.2.0
    numpy==1.26.4
    huggingface_hub==0.20.3 
    speechbrain
    scipy
    
    # --- ユーティリティ (音声ロード) ---
    pydub
    ```
    
2. **インストールの実行**（初回のみ）:
    
    Bash
    
    ```
    pip install -r requirements.txt
    ```
    

## 7\. ステップ5: APIサーバーの起動

ターミナル（`.venv` がアクベート済み、かつ FFmpeg v7 のPATHが一時設定済み）で、`main.py` を実行します。

Bash

```
py .\main.py
```

- `AIモデルのロード完了。`
    
- `Uvicorn running on http://120.0.0.1:8000` と表示されれば、起動成功です。
    

## 8\. ステップ6: APIのテスト

サーバーが起動した状態で、ブラウザから `http://127.0.0.1:8000/docs` にアクセスします。

1. `POST /transcribe` をクリックし、「Try it out」を押します。
    
2. `target_voice`: `my_voice.webm`（ターゲットの声紋）をアップロードします。
    
3. `mixed_audio`: `test.webm`（会話録音）をアップロードします。
    
4. 「Execute」を押します。
    

**成功時のレスポンス（例）:**

JSON

```
{
  "transcription": [
    {
      "speaker": "OTHER",
      "start": 0.7,
      "end": 2.4,
      "text": "ランチはいかがでしょうか"
    },
    {
      "speaker": "TARGET",
      "start": 3,
      "end": 5.3,
      "text": "今日のランチは何にしましょうかね"
    }
  ],
  "debug_info": {
    "target_label": "SPEAKER_01",
    "cluster_similarities": {
      "SPEAKER_00": 0.5798526629805565,
      "SPEAKER_01": 0.8094804286956787
    }
  }
}
```

## 9\. ステップ7: 開発の終了

サーバー（`main.py`）を停止（`Ctrl+C`）したら、以下のコマンドで仮想環境を抜けます。

Bash

```
deactivate
```