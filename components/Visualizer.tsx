import React, { useEffect, useRef } from 'react';
import { DownloadSimple } from 'phosphor-react';

interface VisualizerProps {
    audioElement: HTMLAudioElement | null;
    isPlaying: boolean;
    statusText: string;
    statusMode: 'idle' | 'processing' | 'playing' | 'paused';
    downloadUrl: string | null;
    onTogglePlayback: () => void;
}

export const Visualizer: React.FC<VisualizerProps> = ({ 
    audioElement, 
    isPlaying, 
    statusText, 
    statusMode, 
    downloadUrl,
    onTogglePlayback 
}) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const animationRef = useRef<number | null>(null);
    const analyserRef = useRef<AnalyserNode | null>(null);
    const audioCtxRef = useRef<AudioContext | null>(null);
    const sourceRef = useRef<MediaElementAudioSourceNode | null>(null);

    // 1. Setup Audio Context and Source (Runs only when audio element instance changes)
    useEffect(() => {
        if (!audioElement) return;

        // Initialize AudioContext singleton
        if (!audioCtxRef.current) {
            const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
            audioCtxRef.current = new AudioContext();
            analyserRef.current = audioCtxRef.current.createAnalyser();
            analyserRef.current.fftSize = 256;
        }

        const ctx = audioCtxRef.current;
        const analyser = analyserRef.current!;

        // Create MediaElementSource
        try {
            // Disconnect old source if it exists
            if (sourceRef.current) {
                try { sourceRef.current.disconnect(); } catch (e) { /* ignore */ }
            }

            const source = ctx.createMediaElementSource(audioElement);
            source.connect(analyser);
            source.connect(ctx.destination);
            sourceRef.current = source;
        } catch (e) {
            // Reconnecting to same element can throw, usually fine
        }

        return () => {
            if (sourceRef.current) {
                try { sourceRef.current.disconnect(); } catch (e) { /* ignore */ }
                sourceRef.current = null;
            }
        };
    }, [audioElement]);

    // 2. Animation Loop (Runs when playback state changes)
    useEffect(() => {
        if (!canvasRef.current || !analyserRef.current) return;

        const canvas = canvasRef.current;
        const canvasCtx = canvas.getContext('2d')!;
        const analyser = analyserRef.current;
        const dataArray = new Uint8Array(analyser.frequencyBinCount);

        const render = () => {
            analyser.getByteFrequencyData(dataArray);
            
            const w = canvas.width;
            const h = canvas.height;
            const barWidth = (w / dataArray.length) * 2.5;
            
            canvasCtx.clearRect(0, 0, w, h);
            
            let x = 0;
            for (let i = 0; i < dataArray.length; i++) {
                const barHeight = (dataArray[i] / 255) * h * 0.8;
                canvasCtx.fillStyle = `rgb(${100 + dataArray[i]}, 92, 246)`;
                canvasCtx.fillRect(x, h - barHeight - 10, barWidth, barHeight);
                x += barWidth + 2;
            }

            if (isPlaying) {
                animationRef.current = requestAnimationFrame(render);
            }
        };

        if (isPlaying) {
            // Resume context if suspended (browser autoplay policy)
            if (audioCtxRef.current?.state === 'suspended') {
                audioCtxRef.current.resume();
            }
            render();
        } else {
            if (animationRef.current) {
                cancelAnimationFrame(animationRef.current);
            }
            // Clear canvas when stopped
            canvasCtx.clearRect(0, 0, canvas.width, canvas.height);
        }

        return () => {
            if (animationRef.current) cancelAnimationFrame(animationRef.current);
        };
    }, [isPlaying]);

    return (
        <div className="glass-panel rounded-3xl p-1 overflow-hidden relative group">
            <canvas 
                ref={canvasRef} 
                className="w-full h-32 md:h-40 bg-slate-900/40 rounded-[20px]" 
                width={800} 
                height={200} 
            />

            {/* Controls Bar */}
            <div className="absolute top-4 left-4 right-4 flex justify-between items-start pointer-events-none z-10">
                {/* Status Badge */}
                <div id="statusBadge" className="px-3 py-1 rounded-full bg-slate-900/80 border border-white/10 backdrop-blur-md flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full ${
                        statusMode === 'processing' ? 'bg-amber-400 animate-pulse' :
                        statusMode === 'playing' ? 'bg-emerald-400 animate-pulse' :
                        'bg-slate-500'
                    }`}></div>
                    <span className="text-xs font-mono text-slate-300">{statusText}</span>
                </div>

                {/* Download Button */}
                {downloadUrl && (
                    <a 
                        href={downloadUrl} 
                        download="visionary-audio.wav"
                        className="pointer-events-auto p-2 rounded-full bg-slate-900/80 border border-white/10 text-slate-300 hover:text-white hover:bg-white/10 backdrop-blur-md transition-colors flex items-center justify-center shadow-lg"
                        title="Download Audio"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <DownloadSimple size={20} weight="bold" />
                    </a>
                )}
            </div>

            {/* Play/Pause Overlay */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                {audioElement && (
                    <button 
                        onClick={onTogglePlayback}
                        className="pointer-events-auto w-16 h-16 rounded-full bg-white text-slate-900 flex items-center justify-center shadow-[0_0_30px_rgba(255,255,255,0.3)] hover:scale-105 transition-transform"
                    >
                        {isPlaying ? (
                            <i className="ph-fill ph-pause text-2xl"></i>
                        ) : (
                            <i className="ph-fill ph-play text-2xl ml-1"></i>
                        )}
                    </button>
                )}
            </div>
        </div>
    );
};