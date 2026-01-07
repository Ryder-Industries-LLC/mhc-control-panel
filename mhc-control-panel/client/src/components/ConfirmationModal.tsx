import React, { useState, useEffect, useRef } from 'react';

export interface ConfirmationModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  confirmVariant?: 'danger' | 'primary';
  requireTypedConfirmation?: string; // If set, user must type this to confirm
  onConfirm: () => void;
  onCancel: () => void;
}

export const ConfirmationModal: React.FC<ConfirmationModalProps> = ({
  isOpen,
  title,
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  confirmVariant = 'primary',
  requireTypedConfirmation,
  onConfirm,
  onCancel,
}) => {
  const [typedValue, setTypedValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setTypedValue('');
      if (requireTypedConfirmation && inputRef.current) {
        setTimeout(() => inputRef.current?.focus(), 100);
      }
    }
  }, [isOpen, requireTypedConfirmation]);

  if (!isOpen) return null;

  const canConfirm = requireTypedConfirmation
    ? typedValue.toLowerCase() === requireTypedConfirmation.toLowerCase()
    : true;

  const confirmButtonClasses = confirmVariant === 'danger'
    ? 'bg-red-500 hover:bg-red-600 text-white'
    : 'bg-mhc-primary hover:bg-mhc-primary-dark text-white';

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-mhc-surface border border-white/10 rounded-lg shadow-2xl w-full max-w-md">
        {/* Header */}
        <div className="p-5 border-b border-white/10">
          <h3 className="text-xl font-semibold text-white">{title}</h3>
        </div>

        {/* Body */}
        <div className="p-5">
          <p className="text-white/80 mb-4">{message}</p>

          {requireTypedConfirmation && (
            <div className="mt-4">
              <label className="block text-sm text-white/60 mb-2">
                Type <span className="font-mono text-red-400">{requireTypedConfirmation}</span> to confirm:
              </label>
              <input
                ref={inputRef}
                type="text"
                value={typedValue}
                onChange={(e) => setTypedValue(e.target.value)}
                className="w-full px-4 py-2 bg-mhc-surface-light border border-white/20 rounded-lg text-white placeholder-white/40 focus:outline-none focus:border-mhc-primary"
                placeholder={requireTypedConfirmation}
              />
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-5 border-t border-white/10 flex justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white font-medium rounded-lg transition-colors"
          >
            {cancelText}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={!canConfirm}
            className={`px-4 py-2 font-medium rounded-lg transition-colors ${
              canConfirm
                ? confirmButtonClasses
                : 'bg-white/10 text-white/40 cursor-not-allowed'
            }`}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConfirmationModal;
