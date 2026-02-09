import { useState } from 'react';
import { Eye, Sparkle, Copy, Translate } from 'phosphor-react';
import { MediaInput } from './components/MediaInput';
import { Visualizer } from './components/Visualizer';
import { ErrorBanner } from './components/ErrorBanner';
import { apiAnalyzeSource, apiTranslate, apiGenerateSpeech } from './services/geminiService';
import { AppStatus, CachedData } from './types';

const LANGUAGES = [
    { code: 'my', name: 'Burmese' },
    { code: 'en', name: 'English' },
    { code: 'ja', name: 'Japanese' },
];

function App() {
    const [status, setStatus] = useState<AppStatus>('idle');
    const [statusText, setStatusText] = useState('Idle');
    
    const [errorMessage, setErrorMessage] = useState<string | null>(null);

    // File State
    const [fileData, setFileData] = useState<string | null>(null);
    const [mimeType, setMimeType] = useState<string | null>(null);
    const [fileName, setFileName] = useState<string | null>(null);

    // Cache State (stores Source and Translations for the current image)
    const [cache, setCache] = useState<CachedData>({
        source: null,
        sourceAudio: null,
        translations: {}
    });

    const [targetLangCode, setTargetLangCode] = useState<string>('en');
    
    // Audio State
    const [audioElement, setAudioElement] = useState<HTMLAudioElement | null>(null);
    const [isPlaying, setIsPlaying] = useState(false);

    // Reset workflow
    const handleClear = () => {
        if (audioElement) {
            audioElement.pause();
            setAudioElement(null);
        }
        setIsPlaying(false);
        setFileData(null);
        setMimeType(null);
        setFileName(null);
        // Clear cache explicitly when image is removed
        setCache({
            source: null,
            sourceAudio: null,
            translations: {}
        });
        setStatus('idle');
        setStatusText('Idle');
        setErrorMessage(null);
    };

    const handleFileSelect = (base64: string, type: string, name?: string) => {
        handleClear(); // clear previous results
        setFileData(base64);
        setMimeType(type);
        setFileName(name || 'Uploaded File');
    };

    // Helper to play audio blob
    const playAudioBlob = (blob: Blob | null) => {
        if (audioElement) {
            audioElement.pause();
            setAudioElement(null);
            setIsPlaying(false);
        }

        if (blob) {
            const url = URL.createObjectURL(blob);
            const audio = new Audio(url);
            audio.onended = () => {
                setIsPlaying(false);
                setStatus('idle');
                setStatusText('Finished');
            };
            setAudioElement(audio);
            audio.play().then(() => {
                setIsPlaying(true);
                setStatus('playing');
                setStatusText('Speaking...');
            }).catch(e => console.log("Auto-play blocked", e));
        }
    };

    // Step 1: Initial Source Analysis
    const performSourceAnalysis = async () => {
        if (!fileData || !mimeType) return;

        setErrorMessage(null);
        setStatus('processing');
        
        try {
            // Check cache first (though button usually hidden if cached)
            if (cache.source && cache.sourceAudio) {
                playAudioBlob(cache.sourceAudio);
                return;
            }

            setStatusText('Analyzing visual content...');
            // 1. Analyze Source
            const analysis = await apiAnalyzeSource(fileData, mimeType);
            
            // 2. Generate Source Audio
            setStatusText(`Generating audio (${analysis.primaryLabel})...`);
            const audio = await apiGenerateSpeech(analysis.sourceText);

            // 3. Save to Cache
            setCache(prev => ({
                ...prev,
                source: analysis,
                sourceAudio: audio
            }));

            // Set target language to source language initially so the UI reflects "Original" state
            // If the detected language isn't in our list, we might want to handle that, 
            // but for now, setting it allows us to know we are in "Source" mode if we match logic.
            setTargetLangCode(analysis.detectedLanguage);

            // 4. Play Source Audio
            setStatus('idle');
            setStatusText('Ready');
            playAudioBlob(audio);

        } catch (error: any) {
            console.error("Analysis Error:", error);
            setStatus('idle');
            setStatusText('Error');
            setErrorMessage(error.message || "Failed to analyze image.");
        }
    };

    // Step 2: Translation (Triggered by user selection)
    const handleTranslation = async (newLangCode: string) => {
        // Update selection state immediately
        setTargetLangCode(newLangCode);

        // If no source analyzed yet, do nothing (should not happen due to UI hiding)
        if (!cache.source) return;

        // If selecting the source language, just play source audio
        if (newLangCode === cache.source.detectedLanguage) {
            playAudioBlob(cache.sourceAudio);
            return;
        }

        // Check Cache for this translation
        if (cache.translations[newLangCode]) {
            playAudioBlob(cache.translations[newLangCode].audio);
            return;
        }

        // Perform Translation
        setErrorMessage(null);
        setStatus('processing');
        
        try {
            const targetLangName = LANGUAGES.find(l => l.code === newLangCode)?.name || newLangCode;
            
            setStatusText(`Translating to ${targetLangName}...`);
            const translatedText = await apiTranslate(cache.source.sourceText, targetLangName);

            setStatusText(`Generating audio (${targetLangName})...`);
            const translatedAudio = await apiGenerateSpeech(translatedText);

            // Save to Cache
            setCache(prev => ({
                ...prev,
                translations: {
                    ...prev.translations,
                    [newLangCode]: {
                        text: translatedText,
                        audio: translatedAudio
                    }
                }
            }));

            setStatus('idle');
            setStatusText('Ready');
            playAudioBlob(translatedAudio);

        } catch (error: any) {
            console.error("Translation Error:", error);
            setStatus('idle');
            setStatusText('Error');
            setErrorMessage(error.message || "Failed to translate.");
        }
    };

    const togglePlayback = () => {
        if (!audioElement && cache.source) {
            // If no active audio but we have content, replay current view
             const isSource = targetLangCode === cache.source.detectedLanguage;
             if (isSource) {
                 playAudioBlob(cache.sourceAudio);
             } else {
                 const trans = cache.translations[targetLangCode];
                 if (trans) playAudioBlob(trans.audio);
             }
             return;
        }

        if (audioElement) {
            if (audioElement.paused) {
                audioElement.play();
                setIsPlaying(true);
                setStatus('playing');
                setStatusText('Speaking...');
            } else {
                audioElement.pause();
                setIsPlaying(false);
                setStatus('paused');
                setStatusText('Paused');
            }
        }
    };

    // Determine what text/label to display
    const getDisplayData = () => {
        if (!cache.source) return null;

        const isSourceSameAsTarget = cache.source.detectedLanguage === targetLangCode;
        
        if (isSourceSameAsTarget) {
            return {
                label: `${cache.source.primaryLabel} (Original)`,
                text: cache.source.sourceText,
                isAudioReady: !!cache.sourceAudio
            };
        } else {
            const trans = cache.translations[targetLangCode];
            const langName = LANGUAGES.find(l => l.code === targetLangCode)?.name;
            if (trans) {
                return {
                    label: `${langName} (Translation)`,
                    text: trans.text,
                    isAudioReady: !!trans.audio
                };
            }
            // If we are here, it means we are waiting for translation or processing it
            return {
                label: `Translating to ${langName}...`,
                text: "...",
                isAudioReady: false
            };
        }
    };

    const displayData = getDisplayData();

    return (
        <div className="flex flex-col items-center py-6 px-4 md:px-6 overflow-x-hidden w-full max-w-2xl mx-auto">
            {/* Header */}
            <header className="w-full flex justify-between items-center mb-8">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-accent flex items-center justify-center shadow-lg shadow-primary/20">
                        <Eye className="text-white text-xl" weight="bold" />
                    </div>
                    <div>
                        <h1 className="text-xl font-bold tracking-tight text-white">Visionary</h1>
                        <p className="text-xs text-slate-400 font-mono">Contextual Analysis & Narrator</p>
                    </div>
                </div>
            </header>

            <main className="w-full flex flex-col gap-6 relative z-10">
                {/* Visualizer */}
                <Visualizer 
                    audioElement={audioElement} 
                    isPlaying={isPlaying} 
                    statusText={statusText} 
                    statusMode={status}
                    downloadUrl={audioElement ? audioElement.src : null}
                    onTogglePlayback={togglePlayback}
                />

                {/* Error Banner */}
                <ErrorBanner message={errorMessage} onClose={() => setErrorMessage(null)} />

                {/* Input Area */}
                <div className="relative">
                    <MediaInput 
                        onFileSelect={handleFileSelect} 
                        onClear={handleClear} 
                        fileData={fileData}
                        mimeType={mimeType}
                        fileName={fileName}
                    />
                    
                    {/* Scan Overlay during processing */}
                    {status === 'processing' && (
                         <div className="absolute inset-0 z-20 bg-primary/10 pointer-events-none rounded-3xl overflow-hidden">
                            <div className="absolute w-full h-1 bg-primary shadow-[0_0_20px_rgba(139,92,246,1)] animate-scan opacity-70"></div>
                        </div>
                    )}
                </div>

                {/* Process Button - Only show if we have data but NO source yet */}
                {!cache.source && fileData && (
                    <button 
                        onClick={performSourceAnalysis}
                        disabled={status === 'processing'}
                        className={`w-full py-4 rounded-2xl bg-white text-slate-900 font-bold text-sm tracking-wide shadow-[0_0_20px_rgba(255,255,255,0.2)] hover:scale-[1.02] transition-all duration-300 flex items-center justify-center gap-2 group ${
                            status === 'processing' ? 'opacity-50 cursor-not-allowed' : ''
                        }`}
                    >
                        <Sparkle weight="bold" /> Analyze & Narrate
                    </button>
                )}

                {/* Translation Selector - ONLY appear after source analysis is complete */}
                {cache.source && (
                    <div className="w-full animate-fade-in-down">
                        <div className="w-full flex items-center justify-between bg-white/5 rounded-2xl p-3 border border-white/10">
                            <div className="flex items-center gap-2 text-slate-400">
                                <Translate size={20} />
                                <span className="text-xs font-medium uppercase tracking-wider">Language:</span>
                            </div>
                            <select 
                                value={targetLangCode}
                                onChange={(e) => handleTranslation(e.target.value)}
                                className="bg-slate-900 border border-slate-700 text-white text-sm rounded-lg focus:ring-primary focus:border-primary block p-2 outline-none min-w-[140px]"
                                disabled={status === 'processing'}
                            >
                                {/* Option for the detected source language */}
                                <option value={cache.source.detectedLanguage}>
                                    {cache.source.primaryLabel} (Original)
                                </option>
                                
                                {/* Separator */}
                                <option disabled>──────────</option>

                                {/* Target Languages - Filter out source language if present */}
                                {LANGUAGES
                                    .filter(lang => lang.code !== cache.source?.detectedLanguage)
                                    .map((lang) => (
                                    <option key={lang.code} value={lang.code}>
                                        {lang.name}
                                    </option>
                                ))}
                            </select>
                        </div>
                    </div>
                )}

                {/* Results Area */}
                {displayData && (
                    <div className="glass-panel rounded-2xl p-6 border-l-4 border-l-primary animate-fade-in-down">
                        <div className="flex justify-between items-center mb-3">
                            <span className="text-xs font-bold text-primary uppercase tracking-widest">
                                {displayData.label}
                            </span>
                            <button 
                                onClick={() => navigator.clipboard.writeText(displayData.text)} 
                                className="text-slate-400 hover:text-white text-xs flex items-center gap-1"
                            >
                                <Copy weight="bold" /> Copy
                            </button>
                        </div>
                        <p className="text-sm text-slate-300 leading-relaxed font-sans whitespace-pre-wrap max-h-64 overflow-y-auto scrollbar-hide">
                            {displayData.text}
                        </p>
                        <div className="mt-4 text-right border-t border-white/5 pt-2">
                            <div className="flex justify-between items-center">
                                <span className="text-[10px] text-slate-500">
                                    {displayData.isAudioReady ? "Audio Ready" : "Processing..."}
                                </span>
                                <div>
                                    <p className="text-[10px] text-slate-400 uppercase tracking-wider">Voice Model</p>
                                    <p className="text-xs font-bold text-purple-300">gemini-2.5-flash-tts (Kore)</p>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </main>
        </div>
    );
}

export default App;