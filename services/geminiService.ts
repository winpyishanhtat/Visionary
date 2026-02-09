import { GoogleGenAI, Modality, Type, Schema } from "@google/genai";
import { pcmToWav } from "../utils/audioUtils";
import { SourceAnalysisResult } from "../types";

const CONFIG = {
  visionModel: 'gemini-3-flash-preview', 
  translationModel: 'gemini-3-flash-preview',
  audioModel: 'gemini-2.5-flash-preview-tts',
};

const MAX_RETRIES = 2;
const INITIAL_BACKOFF = 1000;

// API Key for Gemini 3 Flash (Vision & Translation)
const getFlashClient = () => {
  const apiKey = process.env.GEMINI_FLASH_API_KEY; 
  if (!apiKey) {
    throw new Error("API Key is missing. process.env.GEMINI_FLASH_API_KEY must be set.");
  }
  return new GoogleGenAI({ apiKey: apiKey });
};

// API Key for Gemini 2.5 Flash TTS (Audio)
const getTTSClient = () => {
  const apiKey = process.env.GEMINI_TTS_API_KEY; 
  if (!apiKey) {
    throw new Error("API Key is missing. process.env.GEMINI_TTS_API_KEY must be set.");
  }
  return new GoogleGenAI({ apiKey: apiKey });
};

async function withRetry<T>(operation: () => Promise<T>, retries = MAX_RETRIES, delay = INITIAL_BACKOFF): Promise<T> {
  try {
    return await operation();
  } catch (error: any) {
    const status = error?.status || error?.response?.status;
    const message = error?.message || '';
    
    // Check for common retryable errors
    const isRetryable = status === 429 || status === 503 || message.includes('429') || message.includes('quota') || message.includes('overloaded') || status === 500;

    if (isRetryable && retries > 0) {
      console.warn(`API Error ${status}. Retrying in ${delay}ms... (${retries} attempts left)`);
      await new Promise(resolve => setTimeout(resolve, delay));
      return withRetry(operation, retries - 1, delay * 2);
    }
    throw error;
  }
}

/**
 * Step 1-9: Analyze Image, Detect Dominant Language, OCR with Transliteration, and Describe in Original Language.
 */
export const apiAnalyzeSource = async (
  base64Data: string,
  mimeType: string
): Promise<SourceAnalysisResult> => {
  return withRetry(async () => {
    // Use Flash Client
    const ai = getFlashClient();

    const systemPrompt = `
    You are an intelligent vision assistant expert in English, Burmese (Myanmar), and Japanese.
    
    Process the image using this EXACT logic:

    1. **Analyze**: Look for text and visual content.
    2. **Detect Dominant Language**: Identify the primary language of the text and return its 2-letter ISO 639-1 code (e.g., 'en', 'my', 'ja').
    3. **Extract Text (OCR)**: Extract the text exactly as it appears.
    4. **Apply Mixed-Language Transliteration**: 
       - If the text contains words in a language *different* from the Dominant Language, you MUST insert the pronunciation or meaning in the Dominant Language inside brackets immediately after the foreign word.
    5. **Visual Description**: Generate a detailed visual description of the image in the **Dominant Language**.
    
    6. **Construct Output**:
       - Concatenate the [Transliterated OCR Text] and [Visual Description] into a single block.
       - Do NOT use separators like "OCR:", "Description:", or "---". 
       - Use double newlines (\\n\\n) to separate the OCR part from the description part.
    `;

    const responseSchema: Schema = {
        type: Type.OBJECT,
        properties: {
            hasText: { type: Type.BOOLEAN },
            detectedLanguage: { type: Type.STRING },
            primaryLabel: { type: Type.STRING },
            sourceText: { type: Type.STRING },
        },
        required: ["hasText", "detectedLanguage", "primaryLabel", "sourceText"],
    };

    const response = await ai.models.generateContent({
      model: CONFIG.visionModel,
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: mimeType,
              data: base64Data
            }
          },
          { text: "Analyze this image and output JSON." }
        ]
      },
      config: {
        responseMimeType: "application/json",
        responseSchema: responseSchema,
        systemInstruction: systemPrompt
      }
    });

    let rawText = response.text || "{}";
    
    try {
        // Robust JSON extraction: Find first '{' and last '}'
        const firstBrace = rawText.indexOf('{');
        const lastBrace = rawText.lastIndexOf('}');
        
        if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
            rawText = rawText.substring(firstBrace, lastBrace + 1);
        }

        const data = JSON.parse(rawText);
        return {
            hasText: !!data.hasText,
            detectedLanguage: data.detectedLanguage || "en",
            primaryLabel: data.primaryLabel || "English",
            sourceText: data.sourceText || "No content detected."
        };
    } catch (e) {
        console.error("Failed to parse Source Analysis JSON", rawText);
        throw new Error("Failed to parse analysis results.");
    }
  });
};

/**
 * Step 12: Translate the specific text to a target language.
 */
export const apiTranslate = async (
    text: string, 
    targetLanguage: string
): Promise<string> => {
    return withRetry(async () => {
        // Use Flash Client
        const ai = getFlashClient();
        
        const systemPrompt = `
        You are a professional translator expert in English, Burmese (Myanmar), and Japanese.
        Translate the input text to ${targetLanguage}.
        
        Rules:
        1. **Accuracy**: Translate the meaning accurately while maintaining the original tone.
        2. **Structure**: Maintain the original structure (OCR part followed by Description part).
        3. **Speech Optimisation**: Ensure the translation is natural, grammatically correct, and suitable for Text-to-Speech (TTS).
        4. **Output**: Return ONLY the raw translated text. No markdown, no prefixes.
        `;

        const response = await ai.models.generateContent({
            model: CONFIG.translationModel,
            contents: { parts: [{ text: text }] },
            config: {
                systemInstruction: systemPrompt
            }
        });

        return response.text || "";
    });
};

/**
 * Step 10 & 12: Generate Audio from Text.
 */
export const apiGenerateSpeech = async (text: string): Promise<Blob> => {
  if (!text || text.trim().length === 0) {
    throw new Error("Cannot generate speech: input text is empty.");
  }

  return withRetry(async () => {
    // Use TTS Client
    const ai = getTTSClient();

    const response = await ai.models.generateContent({
      model: CONFIG.audioModel,
      contents: { parts: [{ text: text }] },
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: "Aoede" }
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
