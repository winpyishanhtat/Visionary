import { GoogleGenAI } from "@google/genai";
import { pcmToWav } from "../utils/audioUtils";
import { AnalysisResponse } from "../types";

const CONFIG = {
    visionModel: 'gemini-3-flash-preview',
    translationModel: 'gemini-3-flash-preview',
    audioModel: 'gemini-2.5-flash-preview-tts',
};

const MAX_RETRIES = 3;
const INITIAL_BACKOFF = 1000; // 1 second

// Helper to initialize client with a specific key
const getClient = (apiKey: string | undefined, keyName: string) => {
    if (!apiKey) {
        throw new Error(`${keyName} is missing. Please check your .env file.`);
    }
    return new GoogleGenAI({ apiKey: apiKey });
};

/**
 * Executes an async operation with exponential backoff for 429 (Too Many Requests)
 * and 503 (Service Unavailable) errors.
 */
async function withRetry<T>(operation: () => Promise<T>, retries = MAX_RETRIES, delay = INITIAL_BACKOFF): Promise<T> {
    try {
        return await operation();
    } catch (error: any) {
        const status = error?.status || error?.response?.status;
        const message = error?.message || '';
        
        // Check for Quota Exceeded (429) or Server Overload (503)
        const isRetryable = status === 429 || status === 503 || message.includes('429') || message.includes('quota');

        if (isRetryable && retries > 0) {
            console.warn(`API Error ${status}. Retrying in ${delay}ms... (${retries} attempts left)`);
            await new Promise(resolve => setTimeout(resolve, delay));
            return withRetry(operation, retries - 1, delay * 2);
        }

        // Enhance error message for the UI
        if (status === 429 || message.includes('429')) {
            throw new Error("API Quota Exceeded. Please wait a moment or check your billing plan.");
        }

        throw error;
    }
}

export const apiAnalyzeAndDetect = async (
    base64Data: string,
    mimeType: string
): Promise<AnalysisResponse> => {
    return withRetry(async () => {
        // Use Flash Key for Analysis
        const ai = getClient(process.env.GEMINI_FLASH_API_KEY, 'GEMINI_FLASH_API_KEY');
        
        const systemPrompt = `Analyze the image.
1. EXTRACT: OCR all text visible in the image verbatim.
2. DESCRIBE: Provide a very brief, concise visual description (max 2 sentences).
3. DETECT: List ISO language codes for any text found.

Output strictly in this format:
LANG_CODES: [code1, code2]
NARRATIVE:
[OCR Text]
[Visual Description]`;

        const response = await ai.models.generateContent({
            model: CONFIG.visionModel,
            contents: {
                parts: [
                    { text: systemPrompt },
                    {
                        inlineData: {
                            mimeType: mimeType,
                            data: base64Data
                        }
                    }
                ]
            }
        });

        const rawText = response.text || "";

        const langCodesMatch = rawText.match(/LANG_CODES:\s*\[([^\]]*)\]/);
        const narrativeMatch = rawText.match(/NARRATIVE:\s*([\s\S]*)/);

        let detectedLangs: string[] = [];
        if (langCodesMatch && langCodesMatch[1]) {
            detectedLangs = langCodesMatch[1]
                .split(',')
                .map(code => code.trim().toLowerCase())
                .filter(code => code && code !== 'en');
        }

        const narrativeText = narrativeMatch ? narrativeMatch[1].trim() : rawText;

        return {
            text: narrativeText,
            detectedLangs: detectedLangs
        };
    });
};

export const apiTranslate = async (
    text: string,
    targetLang: string
): Promise<string> => {
    return withRetry(async () => {
        // Use Flash Key for Translation
        const ai = getClient(process.env.GEMINI_FLASH_API_KEY, 'GEMINI_FLASH_API_KEY');
        const prompt = `Translate the following narrative text into ${targetLang}. The text contains extracted text and a brief visual description. Translate it naturally as a single coherent piece. Return ONLY the translation:

"${text}"`;
        
        const response = await ai.models.generateContent({
            model: CONFIG.translationModel,
            contents: prompt
        });

        return response.text?.trim() || text;
    });
};

export const apiGenerateSpeech = async (
    text: string
): Promise<Blob> => {
    if (!text || text.trim().length === 0) {
        throw new Error("Cannot generate speech: input text is empty.");
    }

    return withRetry(async () => {
        // Use TTS Key for Audio Generation
        const ai = getClient(process.env.GEMINI_TTS_API_KEY, 'GEMINI_TTS_API_KEY');
        
        const response = await ai.models.generateContent({
            model: CONFIG.audioModel,
            contents: { parts: [{ text: text }] },
            config: {
                responseModalities: ['AUDIO'],
                speechConfig: {
                    voiceConfig: {
                        prebuiltVoiceConfig: { voiceName: "Kore" }
                    }
                }
            }
        });

        const candidate = response.candidates?.[0];
        const pcmBase64 = candidate?.content?.parts?.[0]?.inlineData?.data;

        if (!pcmBase64) {
            const reason = candidate?.finishReason || "Unknown Error";
            console.error("Speech generation failed. Model response:", response);
            throw new Error(`Audio generation failed. Reason: ${reason}`);
        }

        return pcmToWav(pcmBase64, 24000);
    });
};