
import React, { useEffect } from 'react';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  size?: 'md' | 'lg' | 'xl' | '2xl' | '3xl' | '4xl' | '5xl';
}

const CloseIcon = () => (
    <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
)

const Modal: React.FC<ModalProps> = ({ isOpen, onClose, title, children, footer, size = '2xl' }) => {
  useEffect(() => {
    const handleEsc = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      window.addEventListener('keydown', handleEsc);
    }
    return () => {
      document.body.style.overflow = 'unset';
      window.removeEventListener('keydown', handleEsc);
    };
  }, [isOpen, onClose]);

  if (!isOpen) {
    return null;
  }
  
  const sizeClasses = {
      md: 'max-w-md',
      lg: 'max-w-lg',
      xl: 'max-w-xl',
      '2xl': 'max-w-2xl',
      '3xl': 'max-w-3xl',
      '4xl': 'max-w-4xl',
      '5xl': 'max-w-5xl',
  }

  return (
    <div 
        className="fixed inset-0 z-[9999] flex items-start justify-center bg-black/60 backdrop-blur-sm p-4 sm:p-6 pt-10 sm:pt-12 overflow-hidden"
        onClick={onClose}
    >
      <div 
        className={`
            bg-white dark:bg-slate-800 rounded-xl shadow-2xl 
            w-full flex flex-col mt-4
            ${sizeClasses[size]}
        `}
        onClick={(e) => e.stopPropagation()}
        style={{ maxHeight: 'calc(100vh - 4rem)' }}
      >
        {/* Header - Fixed */}
        <div className="flex-shrink-0 flex justify-between items-center p-5 border-b border-gray-200 dark:border-slate-700">
          <h3 id="modal-title" className="text-lg font-bold text-gray-900 dark:text-white leading-6 truncate pr-4">
            {title}
          </h3>
          <button
            onClick={onClose}
            className="text-gray-400 bg-transparent hover:bg-gray-100 hover:text-gray-500 rounded-lg p-1.5 transition-colors dark:hover:bg-slate-700 dark:hover:text-gray-300 flex-shrink-0"
            aria-label="Close modal"
          >
            <CloseIcon />
          </button>
        </div>
        
        {/* Body - Scrollable */}
        <div className="flex-1 overflow-y-auto p-6 min-h-0 custom-scrollbar">
            <div className="space-y-4">
                {children}
            </div>
        </div>

        {/* Footer - Fixed */}
        {footer && (
            <div className="flex-shrink-0 p-5 border-t border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800/50 rounded-b-xl">
                {footer}
            </div>
        )}
      </div>
    </div>
  );
};

export default Modal;
