import React from 'react';
import { WarningCircle, X } from 'phosphor-react';

interface ErrorBannerProps {
    message: string | null;
    onClose: () => void;
}

export const ErrorBanner: React.FC<ErrorBannerProps> = ({ message, onClose }) => {
    if (!message) return null;

    return (
        <div className="w-full animate-fade-in-down">
            <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 flex items-start gap-3 backdrop-blur-md shadow-lg shadow-red-900/10">
                <WarningCircle size={24} className="text-red-400 shrink-0 mt-0.5" weight="duotone" />
                <div className="flex-1">
                    <h3 className="text-sm font-bold text-red-200 mb-1">Processing Error</h3>
                    <p className="text-xs text-red-300/80 font-mono leading-relaxed">{message}</p>
                </div>
                <button 
                    onClick={onClose}
                    className="p-1 hover:bg-red-500/20 rounded-lg text-red-400 transition-colors"
                >
                    <X size={16} weight="bold" />
                </button>
            </div>
        </div>
    );
};