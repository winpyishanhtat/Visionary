import { GoogleGenAI } from "@google/genai";
import { pcmToWav } from "../utils/audioUtils";
import { AnalysisResponse } from "../types";

const CONFIG = {
    visionModel: 'gemini-3-flash-preview', // Optimized for vision/OCR tasks
    translationModel: 'gemini-3-flash-preview',
    audioModel: 'gemini-2.5-flash-preview-tts',
};

const MAX_RETRIES = 3;
const INITIAL_BACKOFF = 1000;

const getClient = (apiKey: string | undefined, keyName: string) => {
    if (!apiKey) throw new Error(`${keyName} is missing.`);
    return new GoogleGenAI(apiKey);
};

async function withRetry<T>(operation: () => Promise<T>, retries = MAX_RETRIES, delay = INITIAL_BACKOFF): Promise<T> {
    try {
        return await operation();
    } catch (error: any) {
        const status = error?.status || error?.response?.status;
        const isRetryable = status === 429 || status === 503;
        if (isRetryable && retries > 0) {
            await new Promise(res => setTimeout(res, delay));
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

        const systemPrompt = `Analyze the image and follow these strict rules:
        1. DETECT: List ISO language codes for text found. Max 3. If more than 3, return "ERROR: Too many languages".
        2. IF NO TEXT: Tag as [VISUAL_ONLY]. Provide brief English description.
        3. IF 1 LANG (EN): Tag as [SINGLE_EN]. Provide OCR text + English description.
        4. IF 1 LANG (Non-EN): Tag as [SINGLE_NON_EN]. Provide OCR text + description in that language.
        5. IF 2-3 LANGS: Tag as [MULTILINGUAL]. 
           - Identify the most used (dominant) language.
           - List "ORIGINAL_TEXT": [The text exactly as it appears].
           - List "DOMINANT_BLOCK": [The text as it appears, but with non-dominant languages translated inline to the dominant language] + [A description in the dominant language].

        Output Format:
        LANG_CODES: [code1, code2]
        TYPE: [VISUAL_ONLY / SINGLE_EN / SINGLE_NON_EN / MULTILINGUAL]
        NARRATIVE:
        [Your content based on the rules above]`;

        const response = await model.generateContent([
            systemPrompt,
            { inlineData: { mimeType, data: base64Data } }
        ]);

        const rawText = response.response.text();
        const langCodesMatch = rawText.match(/LANG_CODES:\s*\[([^\]]*)\]/);
        const typeMatch = rawText.match(/TYPE:\s*(\w+)/);
        const narrativeMatch = rawText.match(/NARRATIVE:\s*([\s\S]*)/);

        let detectedLangs = langCodesMatch?.[1].split(',').map(s => s.trim().toLowerCase()).filter(Boolean) || [];
        const type = typeMatch?.[1] || "";
        let finalNarrative = narrativeMatch?.[1].trim() || rawText;

        // Validation: Reject more than 3 languages
        if (detectedLangs.length > 3) throw new Error("More than 3 languages detected. Process stopped.");

        /** 
         * LOGIC HANDLERS 
         **/

        // Rule 4: Single Non-English -> Translate whole thing to English
        if (type === "SINGLE_NON_EN" && detectedLangs[0] !== 'en') {
            const translation = await apiTranslate(finalNarrative, "en");
            finalNarrative = `${finalNarrative}\n\n---\nTranslation (English):\n${translation}`;
        }

        // Rule 6 & 7: Multilingual (2 or 3 languages)
        if (type === "MULTILINGUAL" && detectedLangs.length >= 2) {
            // Requirement: Translate the "Dominant Block" into the least used language.
            const leastUsedLang = detectedLangs[detectedLangs.length - 1];
            const translation = await apiTranslate(finalNarrative, leastUsedLang);
            finalNarrative = `${finalNarrative}\n\n---\nTranslation (${leastUsedLang}):\n${translation}`;
        }

        return {
            text: finalNarrative,
            detectedLangs: detectedLangs
        };
    });
};

export const apiTranslate = async (text: string, targetLang: string): Promise<string> => {
    return withRetry(async () => {
        const ai = getClient(process.env.GEMINI_FLASH_API_KEY, 'GEMINI_FLASH_API_KEY');
        const model = ai.getGenerativeModel({ model: CONFIG.translationModel });
        const prompt = `Translate the following text into the language with ISO code ${targetLang}. 
        Return ONLY the translated text without extra commentary: "${text}"`;
        
        const response = await model.generateContent(prompt);
        return response.response.text().trim();
    });
};

export const apiGenerateSpeech = async (text: string): Promise<Blob> => {
    if (!text) throw new Error("Empty text");
    return withRetry(async () => {
        const ai = getClient(process.env.GEMINI_TTS_API_KEY, 'GEMINI_TTS_API_KEY');
        const model = ai.getGenerativeModel({ model: CONFIG.audioModel });
        
        const response = await model.generateContent({
            contents: [{ role: 'user', parts: [{ text }] }],
            generationConfig: { responseModalities: ['AUDIO'] }
        });

        const pcmBase64 = response.response.candidates?.[0].content.parts[0].inlineData?.data;
        if (!pcmBase64) throw new Error("Audio generation failed.");
        return pcmToWav(pcmBase64, 24000);
    });
};
