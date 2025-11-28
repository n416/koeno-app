// src/lib/geminiApiClient.ts

// --- 型定義 ---
export interface ApiModel {
    id: string;
    displayName: string;
    description: string;
    tier: string | null;
}

interface ApiModelInfo {
    tier: string;
    description: string;
}

interface GenerateContentResponse {
    candidates?: [{
        content: {
            parts: [{ text: string }];
        };
        finishReason?: string;
    }];
    promptFeedback?: {
        blockReason: string;
    };
}

interface ApiError {
    error: {
        code: number;
        message: string;
        status: string;
    };
}

interface ConversationPart {
    role: 'user' | 'model';
    parts: [{ text: string }];
}

interface RequestBody {
    contents: ConversationPart[];
    system_instruction?: {
        parts: [{ text: string }];
    };
}

export class GeminiApiClient {
    #geminiApiKey: string | null = null;
    #textBaseUrl = 'https://generativelanguage.googleapis.com/v1beta/models/';
    public conversationHistory: ConversationPart[] = [];
    #isKeyValid = false;

    constructor(apiKey: string | null = null) {
        try {
            const keyToUse = apiKey || localStorage.getItem('geminiApiKey');
            if (keyToUse && keyToUse !== 'YOUR_API_KEY' && keyToUse.startsWith('AIza')) {
                this.#geminiApiKey = keyToUse;
                this.#isKeyValid = true;
            } else {
                this.#geminiApiKey = null;
                this.#isKeyValid = false;
            }
        } catch (e) {
            console.error('[GeminiClient] Constructor: Error accessing localStorage for API Key:', e);
            this.#geminiApiKey = null;
            this.#isKeyValid = false;
        }
    }

    get hasApiKey(): boolean {
        return !!this.#geminiApiKey;
    }

    get isAvailable(): boolean {
        // ★ バックドアモードならキー無効でもOKとする
        if (localStorage.getItem('noApiMode') === 'true') return true;
        return this.#isKeyValid;
    }

    // ★★★ [移植] ノンブロッキング入力フォーム生成 (DOM直接操作) ★★★
    private async waitForManualInput(): Promise<string> {
        return new Promise((resolve, reject) => {
            // オーバーレイ
            const overlay = document.createElement('div');
            Object.assign(overlay.style, {
                position: 'fixed', top: '0', left: '0', width: '100%', height: '100%',
                backgroundColor: 'rgba(0,0,0,0.5)', zIndex: '99999',
                display: 'flex', justifyContent: 'center', alignItems: 'center'
            });

            // ダイアログ
            const dialog = document.createElement('div');
            Object.assign(dialog.style, {
                backgroundColor: 'white', padding: '20px', borderRadius: '8px',
                width: '500px', maxWidth: '90%', boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
                display: 'flex', flexDirection: 'column', gap: '10px'
            });

            // タイトル
            const title = document.createElement('h3');
            title.textContent = '🛠️ APIなしモード (Developer Backdoor)';
            title.style.margin = '0 0 10px 0';
            title.style.color = '#ed6c02';

            // 説明
            const desc = document.createElement('p');
            desc.innerHTML = 'プロンプトはクリップボードにコピー済みです。<br>AIに貼り付けて実行し、結果をここに貼り付けてください。<br>(JSON形式でなくても可)';
            desc.style.fontSize = '0.9rem';
            desc.style.color = '#666';

            // テキストエリア
            const textarea = document.createElement('textarea');
            textarea.placeholder = 'AIの回答をここに貼り付け...';
            textarea.rows = 10;
            Object.assign(textarea.style, {
                width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #ccc',
                fontFamily: 'monospace', fontSize: '0.8rem'
            });

            // ボタン
            const btnContainer = document.createElement('div');
            Object.assign(btnContainer.style, { display: 'flex', gap: '10px', justifyContent: 'flex-end' });

            const submitBtn = document.createElement('button');
            submitBtn.textContent = '完了 (Resolve)';
            Object.assign(submitBtn.style, {
                padding: '8px 16px', cursor: 'pointer', backgroundColor: '#1976d2', color: 'white', border: 'none', borderRadius: '4px', fontWeight: 'bold'
            });

            const cancelBtn = document.createElement('button');
            cancelBtn.textContent = 'キャンセル';
            Object.assign(cancelBtn.style, {
                padding: '8px 16px', cursor: 'pointer', backgroundColor: 'transparent', border: '1px solid #ccc', borderRadius: '4px'
            });

            const cleanup = () => document.body.removeChild(overlay);

            submitBtn.onclick = () => {
                const val = textarea.value.trim();
                if (!val) { alert('テキストを入力してください。'); return; }
                cleanup();
                resolve(val);
            };

            cancelBtn.onclick = () => {
                cleanup();
                reject(new Error('手動入力がキャンセルされました。'));
            };

            btnContainer.appendChild(cancelBtn);
            btnContainer.appendChild(submitBtn);
            dialog.appendChild(title);
            dialog.appendChild(desc);
            dialog.appendChild(textarea);
            dialog.appendChild(btnContainer);
            overlay.appendChild(dialog);
            document.body.appendChild(overlay);
            textarea.focus();
        });
    }

    // ★★★ 修正: 思考・判断用のメソッド (バックドア対応) ★★★
    async generateIsolatedContent(prompt: string, modelId: string, systemPrompt: string | null = null): Promise<string> {
        if (!prompt?.trim()) throw new Error('プロンプトが空');
        
        // ★ バックドア判定
        const isNoApiMode = localStorage.getItem('noApiMode') === 'true';
        if (isNoApiMode) {
            console.log("--- [No API Mode] Generated Prompt ---");
            console.log(`[System]: ${systemPrompt}`);
            console.log(`[User]: ${prompt}`);
            console.log("--------------------------------------");

            // プロンプトを結合してコピー
            const fullPrompt = systemPrompt ? `【役割設定】\n${systemPrompt}\n\n【指示】\n${prompt}` : prompt;
            try {
                await navigator.clipboard.writeText(fullPrompt);
            } catch (err) {
                console.error("Clipboard write failed", err);
            }
            return await this.waitForManualInput();
        }

        // --- 以下、通常のAPI呼び出し ---
        if (!this.isAvailable || !this.#geminiApiKey) throw new Error('Gemini APIキー未設定/無効');
        if (!modelId) throw new Error('モデルID未指定');

        const requestBody: RequestBody = { contents: [{ role: 'user', parts: [{ text: prompt }] }] };

        if (systemPrompt && typeof systemPrompt === 'string') {
            requestBody.system_instruction = { parts: [{ text: systemPrompt }] };
        }

        const apiUrl = `${this.#textBaseUrl}${modelId}:generateContent?key=${this.#geminiApiKey}`;

        try {
            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(requestBody),
            });
            const data: GenerateContentResponse | ApiError = await response.json();

            if (!response.ok) {
                const msg = this.#formatApiError(response.status, data as ApiError);
                throw new Error(msg);
            }

            const responseData = data as GenerateContentResponse;
            if (responseData.candidates?.[0]?.content?.parts?.[0]?.text) {
                return responseData.candidates[0].content.parts[0].text;
            } else if (responseData.promptFeedback?.blockReason) {
                return `ブロック: ${responseData.promptFeedback.blockReason}`;
            }
            return `(空応答)`;

        } catch (e) {
            console.error('[GeminiClient][Isolated] Error:', e);
            throw e;
        }
    }

    // (listAvailableModels は変更なし)
    static async listAvailableModels(apiKey: string): Promise<ApiModel[]> {
        if (localStorage.getItem('noApiMode') === 'true') {
             return [
                { id: 'manual-mode', displayName: '手動入力モード (API不使用)', description: 'Debug', tier: 'Debug' }
             ];
        }
        if (!apiKey || apiKey === 'YOUR_API_KEY') throw new Error('APIキー未設定');
        const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;

        try {
            const response = await fetch(url);
            const data = await response.json();

            if (!response.ok) {
                const errorMessage = (data as ApiError)?.error?.message || response.statusText;
                throw new Error(`モデルリスト取得エラー (${response.status}): ${errorMessage}`);
            }

            const models: ApiModel[] = [];
            if (data.models?.length) {
                const info: Record<string, ApiModelInfo> = {
                    'gemini-1.5-pro-latest': { tier: '高性能', description: '...' },
                    'gemini-1.5-flash-latest': { tier: '高速', description: '...' },
                    'gemini-pro': { tier: '標準', description: '...' },
                };

                data.models.forEach((m: any) => {
                    if (m.supportedGenerationMethods?.includes('generateContent')) {
                        const id = m.name.replace('models/', '');
                        if (id.includes('vision') || id.includes('embedding') || id.includes('aqa')) return;
                        const i = info[id];
                        models.push({
                            id,
                            displayName: m.displayName || id,
                            description: m.description || i?.description || '',
                            tier: i?.tier || null,
                        });
                    }
                });
            }
            return models;
        } catch (e) {
            console.error('[GeminiClient] モデルリスト読込エラー:', e);
            throw e;
        }
    }

    #formatApiError(status: number, errorData: ApiError): string {
        // (省略: 既存のまま)
        const detail = errorData?.error?.message || '不明';
        return `APIエラー (${status}): ${detail}`;
    }
}