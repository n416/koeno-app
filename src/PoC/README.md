# PoC 環境構築 README (Windows)

## 1\. 概要

このプロジェクトは、音声ファイル（`test.webm`）から「ターゲット（`my_voice.webm`）」と「それ以外（`[OTHER]`）」の声を分離し、両方を文字起こしする「話者分離AI」の技術検証（PoC）です。

## 2\. システム前提条件

- Windows 10 / 11
    
- **Python 3.12.x**
    
- **FFmpeg v7.x** (v8以降は `torchcodec` との互換性問題があるため非推奨)
    
- Hugging Face アカウント（Gated Model（制限付きAI）へのアクセスに必須）
    

## 3\. ステップ1: Python 3.12 のインストール

（環境イメージに基づき）Python 3.12.x がインストールされていることを確認してください。

Bash

```
# バージョン確認
py -3.12 --version
```

## 4\. ステップ2: FFmpeg v7.x のインストール

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
    

## 5\. ステップ3: Python 仮想環境の構築

プロジェクトフォルダ（`koeno-app`）で、仮想環境（`.venv`）を作成し、アクティベートします。

Bash

```
# 仮想環境の作成
py -3.12 -m venv .venv

# 仮想環境のアクティベート
.\.venv\Scripts\Activate.ps1
```

## 6\. ステップ4: Hugging Face 認証

AIモデルをダウンロードするための認証を行います。

1. **Hugging Face CLI のインストール:** （環境イメージに基づき、v1.0未満の古いバージョンを指定します）
    
    Bash
    
    ```
    pip install huggingface_hub==0.20.3
    ```
    
2. **ログイン:** ターミナルで `hf auth login` を実行し、Webブラウザで取得したトークン（`hf_...`）を貼り付けます。
    
3. **Gated Model への同意（最重要）:** `hf auth login` が完了したら、**必ず**以下の4つのAIモデルのWebページにアクセスし、利用規約（user conditions）に**すべて同意**してください。（これを怠ると、スクリプト実行時にダウンロードエラーが発生します）
    
    1. [pyannote/speaker-diarization-3.1](https://huggingface.co/pyannote/speaker-diarization-3.1)
        
    2. [pyannote/voice-activity-detection](https://huggingface.co/pyannote/voice-activity-detection)
        
    3. [pyannote/segmentation](https://huggingface.co/pyannote/segmentation)
        
    4. [pyannote/embedding](https://huggingface.co/pyannote/embedding)
        

## 7\. ステップ5: Python ライブラリのインストール

PoC（ステップ1c）を「完璧」に動作させた、この「黄金の環境」を `requirements.txt` として保存・インストールします。

#### `requirements.txt` (この内容でファイルを作成)

```
# ----------------------------------------------------
# PoC「黄金の環境」
# Python 3.12.x / FFmpeg v7.x / Windows
# ----------------------------------------------------

# --- メインAIライブラリ (pyannote 3.1.1 基準) ---
pyannote.audio==3.1.1
torch==2.2.0
torchaudio==2.2.0
numpy==1.26.4
huggingface_hub==0.20.3 # (v1.0 未満)

# --- PoC 1a/1c (Whisper) ---
openai-whisper

# --- PoC 1b/1c (Speechbrain) ---
speechbrain
scipy

# --- ユーティリティ (音声ロード) ---
pydub
```

#### インストール実行

ターミナル（`.venv` がアクベート済み）で、`requirements.txt` をインストールします。

Bash

```
pip install -r requirements.txt
```

## 8\. ステップ6: 実行

1. `record.html` を使い、以下の2ファイルを作成します。
    
    - `my_voice.webm`: あなたの声（ターゲット）を3〜5秒（「あいうえお、さしすせそ」など）録音。
        
    - `test.webm`: あなた（ターゲット）と、別の誰か（他人）が交互に話している会話を録音。
        
2. ターミナル（`.venv` がアクベート済み、かつ FFmpeg v7 のPATHが一時設定済み）で、PoC（ステップ1c）の最終スクリプトを実行します。
    
    Bash
    
    ```
    # (スクリプト名は、"完璧"になった最終版に合わせてください)
    py -3.12 .\verify_target.py 
    ``` 
    

**期待する結果:** `[Pass 3]` で、`[TARGET]` と `[OTHER]` に分離された文字起こし結果が出力されます。