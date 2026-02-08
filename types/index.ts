// project/types/index.ts

export interface AnalysisResponse {
  hasText: boolean;
  detectedLanguage: string;
  originalText: string; 
  description: string;
  translations: {
    en?: string;
    my?: string;
  };
}
