import { GoogleGenAI } from "@google/genai";
import { pcmToWav } from "../utils/audioUtils";
// Update your types.ts to match the new return structure (see bottom of code block)
import { AnalysisResponse } from "../types"; 

const CONFIG = {
  visionModel: 'gemini-2.0-flash', // Updated to latest stable flash or keep 'gemini-3-flash-preview'
  translationModel: 'gemini-2.0-flash',
  audioModel: 'gemini-2.0-flash-exp', // Or specific TTS model
};

const MAX_RETRIES = 3;
const INITIAL_BACKOFF = 1000;

// Helper to initialize client
const getClient = (apiKey: string | undefined, keyName: string) => {
  if (!apiKey) {
    throw new Error(`${keyName} is missing. Please check your .env file.`);
  }
  return new GoogleGenAI({ apiKey: apiKey });
};

// Retry logic (kept identical to your source)
async function withRetry<T>(operation: () => Promise<T>, retries = MAX_RETRIES, delay = INITIAL_BACKOFF): Promise<T> {
  try {
    return await operation();
  } catch (error: any) {
    const status = error?.status || error?.response?.status;
    const message = error?.message || '';
    
    const isRetryable = status === 429 || status === 503 || message.includes('429') || message.includes('quota');

    if (isRetryable && retries > 0) {
      console.warn(`API Error ${status}. Retrying in ${delay}ms... (${retries} attempts left)`);
      await new Promise(resolve => setTimeout(resolve, delay));
      return withRetry(operation, retries - 1, delay * 2);
    }

    if (status === 429 || message.includes('429')) {
      throw new Error("API Quota Exceeded. Please wait a moment or check your billing plan.");
    }
    throw error;
  }
}

/**
 * Main Logic Controller implementing Rules 0-7
 */
export const apiAnalyzeAndDetect = async (
  base64Data: string,
  mimeType: string
): Promise<AnalysisResponse> => {
  return withRetry(async () => {
    const ai = getClient(process.env.GEMINI_FLASH_API_KEY, 'GEMINI_FLASH_API_KEY');

    // Rules 0-7 are encoded into this System Prompt
    const systemPrompt = `
    You are an intelligent image analysis assistant supporting English, Burmese, and other languages.
    
    PERFORM THE FOLLOWING STEPS:
    
    1. **Visual Scan**: Analyze if the image contains text or is purely visual.
    
    2. **Text Extraction (OCR) & Rule 7**: 
       - Extract all visible text.
       - **RULE 7 (Mixed Language Transliteration)**: If text is in Myanmar but contains words in other languages (like English, Japanese, Kanji), immediately insert the Myanmar pronunciation or meaning in brackets.
         - Example Input: "ငါတို့小倉မှာNails Artသွားလုပ်ကြတယ်။"
         - Example Output: "ငါတို့ 小倉(ကိုခုရ) မှာNail Art(လက်သည်းအလှ) သွားလုပ်ကြတယ်။"
    
    3. **Language Detection**: Identify the primary language of the text.
    
    4. **Description & Translation Logic (Rules 4, 5, 6)**:
       
       - **IF ENGLISH DETECTED (Rule 4)**:
         - Visual Description: Write in **English**.
         - Translation: Translate the *OCR Text* into **Burmese**.
         
       - **IF BURMESE DETECTED (Rule 5)**:
         - Visual Description: Write in **Burmese**.
         - Translation: Translate the *OCR Text* into **English**.
         
       - **IF JAPANESE or OTHER DETECTED (Rule 6)**:
         - Visual Description: Write in **Japanese** (or the detected source language).
         - Translation 1: Translate *OCR Text* into **English**.
         - Translation 2: Translate *OCR Text* into **Burmese**.
         
       - **IF NO TEXT (VISUAL ONLY)**:
         - Visual Description: Write in English.
         - Translation: Provide a Burmese translation of that description.

    RETURN JSON ONLY:
    {
      "hasText": boolean,
      "detectedLanguage": "en" | "my" | "ja" | "other",
      "ocrText": "string (with Rule 7 applied)",
      "visualDescription": "string (in source language)",
      "translations": {
        "en": "string (optional)",
        "my": "string (optional)"
      }
    }
    `;

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
      },
      // Force JSON output for easier parsing
      config: {
        responseMimeType: "application/json" 
      }
    });

    const rawText = response.text || "{}";
    
    // Parse the structured JSON response
    try {
        const data = JSON.parse(rawText);
        
        return {
            hasText: data.hasText,
            detectedLanguage: data.detectedLanguage,
            // The OCR text (Rule 2 & 7)
            originalText: data.ocrText || "", 
            // The Image Description (Rule 4, 5, 6 part A)
            description: data.visualDescription || "",
            // The Translations (Rule 4, 5, 6 part B)
            translations: data.translations || {}
        };
    } catch (e) {
        console.error("Failed to parse GenAI JSON response", rawText);
        // Fallback or throw error depending on UI needs
        return {
            hasText: false,
            detectedLanguage: "unknown",
            originalText: "",
            description: "Error processing image",
            translations: {}
        };
    }
  });
};

// Simple standalone translator (if user wants to translate manually later)
export const apiTranslate = async (
  text: string,
  targetLang: string
): Promise<string> => {
  return withRetry(async () => {
    const ai = getClient(process.env.GEMINI_FLASH_API_KEY, 'GEMINI_FLASH_API_KEY');
    const prompt = `Translate the following text to ${targetLang}. Return ONLY the translation: "${text}"`;

    const response = await ai.models.generateContent({
      model: CONFIG.translationModel,
      contents: { parts: [{ text: prompt }] }
    });

    return response.text?.trim() || text;
  });
};

// TTS Generation
export const apiGenerateSpeech = async (text: string): Promise<Blob> => {
  if (!text || text.trim().length === 0) {
    throw new Error("Cannot generate speech: input text is empty.");
  }

  return withRetry(async () => {
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
      throw new Error(`Audio generation failed. Reason: ${reason}`);
    }

    return pcmToWav(pcmBase64, 24000);
  });
};
