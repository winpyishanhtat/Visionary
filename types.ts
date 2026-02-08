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
    text: string;
    detectedLangs: string[];
}