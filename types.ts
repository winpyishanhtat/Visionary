
export interface ProcessingResult {
    label: string;
    text: string;
    audioBlob: Blob | null;
}

export interface ResultsMap {
    [key: string]: ProcessingResult;
}

export type AppStatus = 'idle' | 'processing' | 'playing' | 'paused';

// Result from the initial image analysis
export interface SourceAnalysisResult {
    hasText: boolean;
    detectedLanguage: string; // ISO code of the dominant language found in image
    primaryLabel: string; // "Burmese", "English", etc.
    // The combined OCR (with mixed-script transliteration) + Visual Description in DOMINANT language
    sourceText: string; 
}

export interface CachedData {
    source: SourceAnalysisResult | null;
    sourceAudio: Blob | null;
    // Cache for translations: key = langCode, value = { text, audio }
    translations: Record<string, { text: string; audio: Blob | null }>;
}
