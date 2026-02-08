
import { useState } from 'react';
import { Eye, Sparkle, Copy } from 'phosphor-react';
import { MediaInput } from './components/MediaInput';
import { Visualizer } from './components/Visualizer';
import { ErrorBanner } from './components/ErrorBanner';
import { apiAnalyzeAndDetect, apiGenerateSpeech } from './services/geminiService';
import { AppStatus, ResultsMap } from './types';

function App() {
    const [status, setStatus] = useState<AppStatus>('idle');
    const [statusText, setStatusText] = useState('Idle');
    
    // Error State
    const [errorMessage, setErrorMessage] = useState<string | null>(null);

    // File State
    const [fileData, setFileData] = useState<string | null>(null);
    const [mimeType, setMimeType] = useState<string | null>(null);
    const [fileName, setFileName] = useState<string | null>(null);

    // Results State
    const [resultsMap, setResultsMap] = useState<ResultsMap>({});
    const [selectedLanguage, setSelectedLanguage] = useState<string | null>(null);
    
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
        setResultsMap({});
        setSelectedLanguage(null);
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

    const processWorkflow = async () => {
        if (!fileData || !mimeType) return;

        setStatus('processing');
        setStatusText('Analyzing content...');
        setResultsMap({}); // clear old results
        setErrorMessage(null);

        try {
            // 1. Vision Analysis (Rules 1-8 logic in service)
            const analysis = await apiAnalyzeAndDetect(fileData, mimeType);
            
            const newResults: ResultsMap = {};
            
            // 1a. Primary Content (The Source Language Tag: OCR + Description)
            // If it's pure visual (en), analysis.primaryLabel will be "English"
            const primaryKey = analysis.detectedLanguage === 'unknown' ? 'main' : analysis.detectedLanguage;
            
            newResults[primaryKey] = {
                label: `${analysis.primaryLabel} (Source)`,
                text: analysis.primaryContent,
                audioBlob: null
            };

            // 1b. Translations
            if (analysis.translations.en) {
                newResults['en'] = {
                    label: 'English (Translation)',
                    text: analysis.translations.en,
                    audioBlob: null
                };
            }
            if (analysis.translations.my) {
                newResults['my'] = {
                    label: 'Burmese (Translation)',
                    text: analysis.translations.my,
                    audioBlob: null
                };
            }

            setResultsMap(newResults);

            // 2. Generate Speech for each tab independently
            // Requirement: Send Full text (OCR+Description formatted as a one passage) to the Voice Model 
            // for both source and translated languages respectively.
            
            const keys = Object.keys(newResults);
            
            for (const key of keys) {
                const item = newResults[key];
                if (!item.text) continue;

                // Send the specific text for this language (OCR+Description) to the voice model
                const textForSpeech = item.text;

                setStatusText(`Generating audio for ${item.label}...`);
                try {
                    const blob = await apiGenerateSpeech(textForSpeech);
                    newResults[key].audioBlob = blob;
                    // Update state incrementally
                    setResultsMap({ ...newResults });
                } catch (e: any) {
                    console.warn(`Failed to generate speech for ${key}:`, e.message);
                }
            }

            // Finish
            // Default to primary key
            setSelectedLanguage(primaryKey);
            selectLanguage(primaryKey, newResults);
            setStatus('idle');
            setStatusText('Ready');
            
        } catch (error: any) {
            console.error("Workflow Error:", error);
            setStatus('idle');
            setStatusText('Error');
            setErrorMessage(error.message || "An unexpected error occurred. Please try again.");
        }
    };

    const selectLanguage = (key: string, map = resultsMap) => {
        setSelectedLanguage(key);
        const item = map[key];
        
        // Always stop current audio when switching tabs
        if (audioElement) {
            audioElement.pause();
            setAudioElement(null);
            setIsPlaying(false);
        }

        if (item && item.audioBlob) {
            const url = URL.createObjectURL(item.audioBlob);
            const audio = new Audio(url);
            audio.onended = () => {
                setIsPlaying(false);
                setStatus('idle');
                setStatusText('Finished');
            };
            setAudioElement(audio);
            // We do not auto-play on tab switch, only on initial load (handled implicitly via selectLanguage call in processWorkflow)
            // However, since selectLanguage is called at the end of processWorkflow, it will set the audio.
            // We can check if status is processing/analyzing to trigger auto-play if needed, or just let user play.
            // To match previous behavior of auto-playing the first result:
            if (status === 'processing' || statusText === 'Ready') {
                 audio.play().then(() => {
                    setIsPlaying(true);
                    setStatus('playing');
                    setStatusText('Speaking...');
                 }).catch(e => console.log("Auto-play blocked or failed", e));
            }
        } else {
             setAudioElement(null);
        }
    };

    const togglePlayback = () => {
        if (!audioElement) {
            // Re-create if missing (e.g. after stop)
            const item = selectedLanguage ? resultsMap[selectedLanguage] : null;
            if (item && item.audioBlob) {
               const url = URL.createObjectURL(item.audioBlob);
               const audio = new Audio(url);
               audio.onended = () => {
                   setIsPlaying(false);
                   setStatus('idle');
                   setStatusText('Finished');
               };
               setAudioElement(audio);
               audio.play();
               setIsPlaying(true);
               setStatus('playing');
               setStatusText('Speaking...');
            }
            return;
        }

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
    };

    const copyText = () => {
        if (selectedLanguage && resultsMap[selectedLanguage]) {
            navigator.clipboard.writeText(resultsMap[selectedLanguage].text);
        }
    };

    const currentResult = selectedLanguage ? resultsMap[selectedLanguage] : null;

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

                {/* Process Button */}
                <button 
                    onClick={processWorkflow}
                    disabled={status === 'processing' || !fileData}
                    className={`w-full py-4 rounded-2xl bg-white text-slate-900 font-bold text-sm tracking-wide shadow-[0_0_20px_rgba(255,255,255,0.2)] hover:scale-[1.02] transition-all duration-300 flex items-center justify-center gap-2 group ${
                        (status === 'processing' || !fileData) ? 'opacity-50 cursor-not-allowed' : ''
                    }`}
                >
                    <Sparkle weight="bold" /> Analyze & Narrate
                </button>

                {/* Results Area */}
                {Object.keys(resultsMap).length > 0 && currentResult && (
                    <div className="glass-panel rounded-2xl p-6 border-l-4 border-l-primary animate-fade-in-down">
                        <div className="flex justify-between items-center mb-3">
                            <span className="text-xs font-bold text-primary uppercase tracking-widest">
                                {currentResult.label}
                            </span>
                            <div className="flex items-center gap-4">
                                <select 
                                    value={selectedLanguage || ''} 
                                    onChange={(e) => selectLanguage(e.target.value)}
                                    className="bg-slate-800 border border-slate-700 rounded-md px-2 py-1 text-xs text-white focus:border-primary outline-none max-w-[150px]"
                                >
                                    {Object.keys(resultsMap).map(key => (
                                        <option key={key} value={key}>{resultsMap[key].label}</option>
                                    ))}
                                </select>
                                <button onClick={copyText} className="text-slate-400 hover:text-white text-xs flex items-center gap-1">
                                    <Copy weight="bold" /> Copy
                                </button>
                            </div>
                        </div>
                        <p className="text-sm text-slate-300 leading-relaxed font-sans whitespace-pre-wrap max-h-64 overflow-y-auto scrollbar-hide">
                            {currentResult.text}
                        </p>
                        <div className="mt-4 text-right border-t border-white/5 pt-2">
                            <div className="flex justify-between items-center">
                                <span className="text-[10px] text-slate-500">
                                    {resultsMap[selectedLanguage || '']?.audioBlob ? "Audio Ready" : "Text Only"}
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
