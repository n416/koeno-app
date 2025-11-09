//
// yorisoi-care-app の geminiApiClient.ts の内容をそのままコピーします。
// (generateIsolatedContent メソッドを含む)

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
    public conversationHistory: ConversationPart[] = []; // (v2.1では未使用だが移植)
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
        return this.#isKeyValid;
    }

    // ★★★★★ 修正: 会話履歴に影響しない、思考・判断用の新しいメソッド ★★★★★
    async generateIsolatedContent(prompt: string, modelId: string, systemPrompt: string | null = null): Promise<string> {
        if (!prompt?.trim()) throw new Error('プロンプトが空');
        if (!this.isAvailable || !this.#geminiApiKey) throw new Error('Gemini APIキー未設定/無効');
        if (!modelId) throw new Error('モデルID未指定');

        // 会話履歴(this.conversationHistory)を含めずにリクエストを作成
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
                const msg = this.#formatApiError(response.status, data as ApiError, modelId);
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

    // (v2.1では generateContent (履歴あり) は不要なため省略)

    static async listAvailableModels(apiKey: string): Promise<ApiModel[]> {
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
                        if (id.includes('vision') || id.includes('embedding') || id.includes('aqa')) {
                            return;
                        }
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

            models.sort((a, b) => {
                const tierOrder: Record<string, number> = { '高性能': 1, '高速': 2, '標準': 3 };
                const aTier = a.tier ? tierOrder[a.tier] : 99;
                const bTier = b.tier ? tierOrder[b.tier] : 99;
                if (aTier !== bTier) return aTier - bTier;
                return (a.displayName || '').localeCompare(b.displayName || '', 'ja');
            });

            return models;
        } catch (e) {
            console.error('[GeminiClient] モデルリスト読込エラー:', e);
            throw e;
        }
    }

    #formatApiError(status: number, errorData: ApiError, modelId = ''): string {
        const detail = errorData?.error?.message || '不明';
        let msg = `APIエラー (${status})`;
        if (modelId) msg += ` [${modelId}]`;
        msg += `: ${detail}`;
        if (status === 400) {
            if (detail.includes('API key not valid'))
                msg = `APIエラー(${status}): APIキー無効/権限不足`;
            else if (detail.includes('prompt was blocked'))
                msg = `APIエラー(${status}): プロンプトブロック`;
            else if (detail.includes('User location is not supported'))
                msg = `APIエラー(${status}): 地域非対応`;
            else msg = `APIエラー(${status}): リクエスト/入力不正 (${detail})`;
        } else if (status === 403) msg = `APIエラー(${status}): 権限不足 or API無効`;
        else if (status === 404) msg = `APIエラー(${status}): モデル '${modelId}' 未発見/利用不可`;
        else if (status === 429) msg = `APIエラー(${status}): Quota超過`;
        else if (status >= 500) msg = `APIエラー(${status}): Googleサーバーエラー`;
        return msg;
    }
}