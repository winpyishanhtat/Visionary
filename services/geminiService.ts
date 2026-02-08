import { GoogleGenAI } from "@google/genai";
import { pcmToWav } from "../utils/audioUtils";
import { AnalysisResponse } from "../types";

const CONFIG = {
    visionModel: 'gemini-3-flash-preview', // Recommended for OCR/Vision
    translationModel: 'gemini-3-flash-preview',
    audioModel: 'gemini-2.5-flash-preview-tts', // Corrected model string
};

const MAX_RETRIES = 3;
const INITIAL_BACKOFF = 1000;

const getClient = (apiKey: string | undefined, keyName: string) => {
    if (!apiKey) {
        throw new Error(`${keyName} is missing. Please check your .env file.`);
    }
    return new GoogleGenAI(apiKey);
};

async function withRetry<T>(operation: () => Promise<T>, retries = MAX_RETRIES, delay = INITIAL_BACKOFF): Promise<T> {
    try {
        return await operation();
    } catch (error: any) {
        const status = error?.status || error?.response?.status;
        const message = error?.message || '';
        const isRetryable = status === 429 || status === 503 || message.includes('429') || message.includes('quota');

        if (isRetryable && retries > 0) {
            await new Promise(resolve => setTimeout(resolve, delay));
            return withRetry(operation, retries - 1, delay * 2);
        }
        throw error;
    }
}

export const apiAnalyzeAndDetect = async (
    base64Data: string,
    mimeType: string
): Promise<AnalysisResponse> => {
    return withRetry(async () => {
        const ai = getClient(process.env.GEMINI_FLASH_API_KEY, 'GEMINI_FLASH_API_KEY');
        const model = ai.getGenerativeModel({ model: CONFIG.visionModel });

        // Revised Prompt: Forces analysis into the image's own dominant language
        const systemPrompt = `Analyze the image and perform the following:
1. DETECT: Identify the languages used in the image text. Provide the top 2 ISO codes.
2. OCR: Extract all text visible in the image.
3. DESCRIBE: Provide a brief visual description (max 2 sentences).
4. LANGUAGE MATCH: Write both the OCR text and the visual description in the MOST USED language detected in the image.

Output strictly in this format:
LANG_CODES: [code1, code2]
NARRATIVE:
[OCR Text and Visual Description in the dominant language]`;

        const result = await model.generateContent([
            systemPrompt,
            {
                inlineData: {
                    mimeType: mimeType,
                    data: base64Data
                }
            }
        ]);

        const rawText = result.response.text();

        const langCodesMatch = rawText.match(/LANG_CODES:\s*\[([^\]]*)\]/);
        const narrativeMatch = rawText.match(/NARRATIVE:\s*([\s\S]*)/);

        let detectedLangs: string[] = [];
        if (langCodesMatch && langCodesMatch[1]) {
            detectedLangs = langCodesMatch[1]
                .split(',')
                .map(code => code.trim().toLowerCase())
                .filter(code => code !== "")
                .slice(0, 2); // Only take top 2
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
    targetLang: string = 'en' // Fallback to English
): Promise<string> => {
    return withRetry(async () => {
        const ai = getClient(process.env.GEMINI_FLASH_API_KEY, 'GEMINI_FLASH_API_KEY');
        const model = ai.getGenerativeModel({ model: CONFIG.translationModel });

        const prompt = `Translate the following text into the language with ISO code "${targetLang}". 
Keep the tone natural and preserve the meaning of both the image description and the extracted text. 
Return ONLY the translated text:

"${text}"`;
        
        const result = await model.generateContent(prompt);
        return result.response.text().trim() || text;
    });
};

export const apiGenerateSpeech = async (
    text: string
): Promise<Blob> => {
    if (!text || text.trim().length === 0) {
        throw new Error("Cannot generate speech: input text is empty.");
    }

    return withRetry(async () => {
        const ai = getClient(process.env.GEMINI_TTS_API_KEY, 'GEMINI_TTS_API_KEY');
        const model = ai.getGenerativeModel({ model: CONFIG.audioModel });
        
        // Note: Check Gemini 2.0+ documentation for specific TTS structure
        const result = await model.generateContent({
            contents: [{ role: 'user', parts: [{ text: text }] }],
            generationConfig: {
                responseMimeType: "audio/wav", // Requesting specific format if supported
            }
        });

        // Use standard content fetching for the audio blob
        const response = await result.response;
        const audioPart = response.candidates?.[0].content.parts.find(p => p.inlineData);

        if (!audioPart?.inlineData?.data) {
            throw new Error("Audio generation failed. No audio data returned.");
        }

        return pcmToWav(audioPart.inlineData.data, 24000);
    });
};
