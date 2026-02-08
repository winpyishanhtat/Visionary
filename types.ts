
export interface ProcessingResult {
    label: string;
    text: string;
    audioBlob: Blob | null;
}

export interface ResultsMap {
    [key: string]: ProcessingResult;
}

export type AppStatus = 'idle' | 'processing' | 'playing' | 'paused';

export interface AnalysisResponse {
    hasText: boolean;
    detectedLanguage: string; // 'en', 'my', 'ja', etc.
    // The combined OCR (with transliteration) + Visual Description in source language
    primaryContent: string; 
    primaryLabel: string; // e.g., "English", "Burmese", "Japanese"
    translations: {
        en?: string;
        my?: string;
    };
}
