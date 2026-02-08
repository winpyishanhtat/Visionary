
import { GoogleGenAI, Modality } from "@google/genai";
import { pcmToWav } from "../utils/audioUtils";
import { AnalysisResponse } from "../types";

const CONFIG = {
  visionModel: 'gemini-3-flash-preview', 
  translationModel: 'gemini-3-flash-preview',
  audioModel: 'gemini-2.5-flash-preview-tts',
};

const MAX_RETRIES = 2;
const INITIAL_BACKOFF = 1000;

const getClient = () => {
  const apiKey = process.env.API_KEY; 
  if (!apiKey) {
    throw new Error("API Key is missing. process.env.API_KEY must be set.");
  }
  return new GoogleGenAI({ apiKey: apiKey });
};

async function withRetry<T>(operation: () => Promise<T>, retries = MAX_RETRIES, delay = INITIAL_BACKOFF): Promise<T> {
  try {
    return await operation();
  } catch (error: any) {
    const status = error?.status || error?.response?.status;
    const message = error?.message || '';
    
    const isRetryable = status === 429 || status === 503 || message.includes('429') || message.includes('quota') || message.includes('overloaded');

    if (isRetryable && retries > 0) {
      console.warn(`API Error ${status}. Retrying in ${delay}ms... (${retries} attempts left)`);
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
    const ai = getClient();

    const systemPrompt = `
    You are an intelligent vision assistant specialized in English, Burmese, and other languages.
    
    Follow this EXACT 8-step logic:

    1. **Analyze**: Check if the image contains text or is only visual.
    2. **Extract**: Get the raw text if present.
    3. **Detect Language**: Identify the primary language of the text.
    
    4. **Apply Mixed-Language Transliteration Rule (CRITICAL)**: 
       - If the text is primarily Myanmar/Burmese (or other languages) but contains words in foreign languages (English, Japanese, Kanji, etc.), you MUST insert the Myanmar pronunciation or meaning in brackets immediately after the foreign word.
       - Example Input: "ငါတို့小倉မှာNails Artသွားလုပ်ကြတယ်။"
       - Example Output: "ငါတို့ 小倉(ကိုခုရ) မှာNail Art(လက်သည်းအလှ) သွားလုပ်ကြတယ်။"
       - This applies to ALL detected languages where mixed script is found.

    5. **Construct "Source Content"**:
       - Create a single text block containing the "Transliterated OCR Text" followed by a "Visual Description" in the *Source Language*.
       - Format: "[OCR Text with brackets]\n\n[Visual Description in Source Language]"

    6. **English Logic**:
       - If detected language is English:
       - Primary Content = English OCR + English Description.
       - Translate entire Primary Content to **Burmese**.

    7. **Burmese Logic**:
       - If detected language is Burmese:
       - Primary Content = Burmese OCR (with mixed brackets) + Burmese Description.
       - Translate entire Primary Content to **English**.

    8. **Japanese/Other Logic**:
       - If detected language is Japanese or any other:
       - Primary Content = Source OCR (with mixed brackets) + Source Description.
       - Translate entire Primary Content to **English** AND **Burmese**.

    9. **Visual Only Logic**:
       - If NO text:
       - Primary Content = Visual Description in English.
       - Translate to **Burmese**.

    **OUTPUT JSON FORMAT ONLY**:
    {
      "hasText": boolean,
      "detectedLanguage": "en" | "my" | "ja" | "other",
      "primaryLabel": "string (e.g. English, Burmese, Japanese)",
      "primaryContent": "string (The combined OCR+Description text in source language)",
      "translations": {
        "en": "string (Required if source is not English)",
        "my": "string (Required if source is not Burmese)"
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
      config: {
        responseMimeType: "application/json" 
      }
    });

    const rawText = response.text || "{}";
    
    try {
        const data = JSON.parse(rawText);
        
        return {
            hasText: !!data.hasText,
            detectedLanguage: data.detectedLanguage || "unknown",
            primaryContent: data.primaryContent || "Analysis failed.",
            primaryLabel: data.primaryLabel || "Result",
            translations: data.translations || {}
        };
    } catch (e) {
        console.error("Failed to parse GenAI JSON response", rawText);
        return {
            hasText: false,
            detectedLanguage: "unknown",
            primaryContent: "Error processing image response.",
            primaryLabel: "Error",
            translations: {}
        };
    }
  });
};

export const apiGenerateSpeech = async (text: string): Promise<Blob> => {
  if (!text || text.trim().length === 0) {
    throw new Error("Cannot generate speech: input text is empty.");
  }

  return withRetry(async () => {
    const ai = getClient();

    const response = await ai.models.generateContent({
      model: CONFIG.audioModel,
      contents: { parts: [{ text: text }] },
      config: {
        responseModalities: [Modality.AUDIO],
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
