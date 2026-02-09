import React, { useRef, useState } from 'react';
import { Camera, Trash, Aperture, UploadSimple, FileText, X } from 'phosphor-react';

interface MediaInputProps {
    onFileSelect: (base64: string, mimeType: string, fileName?: string) => void;
    onClear: () => void;
    fileData: string | null;
    mimeType: string | null;
    fileName: string | null;
}

export const MediaInput: React.FC<MediaInputProps> = ({ onFileSelect, onClear, fileData, mimeType, fileName }) => {
    const videoRef = useRef<HTMLVideoElement>(null);
    const [isCameraActive, setIsCameraActive] = useState(false);
    const streamRef = useRef<MediaStream | null>(null);

    const toggleCamera = async () => {
        if (isCameraActive) {
            // Stop Camera
            if (streamRef.current) {
                streamRef.current.getTracks().forEach(t => t.stop());
                streamRef.current = null;
            }
            setIsCameraActive(false);
        } else {
            // Start Camera
            try {
                onClear(); // Clear existing file
                const stream = await navigator.mediaDevices.getUserMedia({
                    video: { facingMode: 'environment' }
                });
                streamRef.current = stream;
                if (videoRef.current) {
                    videoRef.current.srcObject = stream;
                }
                setIsCameraActive(true);
            } catch (e) {
                alert("Camera access denied or unavailable.");
            }
        }
    };

    const captureFrame = () => {
        if (videoRef.current && isCameraActive) {
            const canvas = document.createElement('canvas');
            canvas.width = videoRef.current.videoWidth;
            canvas.height = videoRef.current.videoHeight;
            canvas.getContext('2d')?.drawImage(videoRef.current, 0, 0);
            const dataUrl = canvas.toDataURL('image/jpeg');
            onFileSelect(dataUrl.split(',')[1], 'image/jpeg', 'Camera Snapshot');
            toggleCamera(); // Stop camera after capture
        }
    };

    const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        // Strict image check
        if (!file.type.startsWith('image/')) {
            alert("Please select a valid image file (JPG, PNG, WebP)");
            return;
        }

        const reader = new FileReader();
        reader.onload = (ev) => {
            const result = ev.target?.result as string;
            onFileSelect(result.split(',')[1], file.type, file.name);
        };
        reader.readAsDataURL(file);
    };

    const isImage = mimeType?.startsWith('image/');

    return (
        <div className="relative w-full aspect-[16/9] md:aspect-[2/1] rounded-3xl overflow-hidden border border-white/10 bg-slate-900/50 shadow-2xl group">
            {/* Video Element */}
            <video 
                ref={videoRef} 
                autoPlay 
                playsInline 
                className={`w-full h-full object-cover ${isCameraActive ? '' : 'hidden'}`} 
            />

            {/* File Preview */}
            {!isCameraActive && fileData && (
                <div className="w-full h-full flex flex-col items-center justify-center bg-slate-900/80">
                    {isImage ? (
                        <img src={`data:${mimeType};base64,${fileData}`} className="max-w-full max-h-full object-contain opacity-90" alt="Preview" />
                    ) : (
                        <div className="flex flex-col items-center gap-4">
                            <FileText size={64} className="text-primary" weight="duotone" />
                            <p className="text-sm font-mono text-slate-300">{fileName || "Document Loaded"}</p>
                        </div>
                    )}
                </div>
            )}

            {/* Empty State / Upload Trigger */}
            {!isCameraActive && !fileData && (
                <div className="absolute inset-0 flex flex-col items-center justify-center transition-all duration-300 hover:bg-white/5 cursor-pointer">
                    <input 
                        type="file" 
                        accept=".jpg, .jpeg, .png, .webp" 
                        onChange={handleFileInput}
                        className="absolute inset-0 opacity-0 cursor-pointer z-30" 
                    />
                    <div className="w-16 h-16 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center mb-4">
                        <UploadSimple size={32} className="text-slate-400" weight="duotone" />
                    </div>
                    <p className="text-sm font-medium text-slate-300">Drop image or tap to upload</p>
                    <p className="text-[10px] text-slate-500 mt-2">JPG, PNG, WebP</p>
                </div>
            )}

            {/* Controls */}
            <div className="absolute bottom-3 right-3 flex gap-2 z-30">
                {(fileData || isCameraActive) && (
                    <button 
                        onClick={isCameraActive ? toggleCamera : onClear} 
                        className="p-3 rounded-xl bg-slate-900/80 border border-white/10 text-red-400 hover:text-red-300 hover:bg-red-500/10 backdrop-blur-md transition"
                    >
                        {isCameraActive ? <X weight="bold" /> : <Trash weight="bold" />}
                    </button>
                )}
                
                <button 
                    onClick={toggleCamera} 
                    className="p-3 rounded-xl bg-slate-900/80 border border-white/10 text-slate-300 hover:text-white hover:bg-white/10 backdrop-blur-md transition"
                >
                    <Camera weight="bold" />
                </button>
                
                {isCameraActive && (
                    <button 
                        onClick={captureFrame} 
                        className="p-3 rounded-xl bg-slate-900/80 border border-white/10 text-blue-400 hover:text-blue-300 hover:bg-blue-500/10 backdrop-blur-md transition"
                    >
                        <Aperture weight="bold" />
                    </button>
                )}
            </div>
        </div>
    );
};