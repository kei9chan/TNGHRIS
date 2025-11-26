import React, { useState, useRef, useImperativeHandle, forwardRef, useEffect, useCallback } from 'react';

type SignatureMode = 'type' | 'draw';

export interface SignaturePadRef {
  getSignatureDataUrl: () => string | null;
  isEmpty: () => boolean;
  clear: () => void;
}

interface SignaturePadProps {
    onEnd?: () => void;
}

const SignaturePad = forwardRef<SignaturePadRef, SignaturePadProps>(({ onEnd }, ref) => {
  const [mode, setMode] = useState<SignatureMode>('type');
  const [typedSignature, setTypedSignature] = useState('');
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isDrawingRef = useRef(false);
  const [isCanvasEmpty, setIsCanvasEmpty] = useState(true);

  const clearCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      ctx?.clearRect(0, 0, canvas.width, canvas.height);
      setIsCanvasEmpty(true);
      onEnd?.();
    }
  }, [onEnd]);
  
  // Expose methods to parent component
  useImperativeHandle(ref, () => ({
    clear: () => {
      if (mode === 'type') {
        setTypedSignature('');
      } else {
        clearCanvas();
      }
    },
    isEmpty: () => {
        if (mode === 'type') {
            return typedSignature.trim() === '';
        }
        return isCanvasEmpty;
    },
    getSignatureDataUrl: () => {
        const isDarkMode = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
        const bgColor = isDarkMode ? '#1f2937' : '#f9fafb';
        const fgColor = isDarkMode ? '#f3f4f6' : '#111827';

        if (mode === 'type') {
            if (!typedSignature.trim()) return null;
            const tempCanvas = document.createElement('canvas');
            tempCanvas.width = 500;
            tempCanvas.height = 150;
            const ctx = tempCanvas.getContext('2d');
            if (ctx) {
                ctx.fillStyle = bgColor;
                ctx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);
                ctx.fillStyle = fgColor;
                ctx.font = "italic 40px 'Brush Script MT', cursive";
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(typedSignature, tempCanvas.width / 2, tempCanvas.height / 2);
            }
            return tempCanvas.toDataURL();
        }

        if (mode === 'draw') {
            const canvas = canvasRef.current;
            if (!canvas || isCanvasEmpty) return null;
            
            const exportCanvas = document.createElement('canvas');
            exportCanvas.width = canvas.width;
            exportCanvas.height = canvas.height;
            const ctx = exportCanvas.getContext('2d');
            if (ctx) {
                ctx.fillStyle = bgColor;
                ctx.fillRect(0, 0, exportCanvas.width, exportCanvas.height);
                ctx.drawImage(canvas, 0, 0);
            }
            return exportCanvas.toDataURL('image/png');
        }
        return null;
    }
  }));

  // Simplified canvas setup and resize handling
  useEffect(() => {
    if (mode !== 'draw' || !canvasRef.current) {
      return;
    }
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    const setCanvasDimensionsAndStyles = () => {
      const ratio = Math.max(window.devicePixelRatio || 1, 1);
      const { width, height } = canvas.getBoundingClientRect();
      
      if (width === 0 || height === 0) return;
      
      canvas.width = width * ratio;
      canvas.height = height * ratio;
      ctx.scale(ratio, ratio);

      const isDarkMode = window.matchMedia('(prefers-color-scheme: dark)').matches;
      ctx.strokeStyle = isDarkMode ? '#f3f4f6' : '#111827';
      ctx.lineWidth = 2;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
    };

    setCanvasDimensionsAndStyles();
    clearCanvas();

    const darkModeMatcher = window.matchMedia('(prefers-color-scheme: dark)');
    const handleThemeChange = () => {
        if (canvas.getContext('2d')) {
            const isDarkMode = darkModeMatcher.matches;
            canvas.getContext('2d')!.strokeStyle = isDarkMode ? '#f3f4f6' : '#111827';
        }
    };
    
    const resizeObserver = new ResizeObserver(() => {
        setCanvasDimensionsAndStyles();
    });
    
    resizeObserver.observe(canvas);
    darkModeMatcher.addEventListener('change', handleThemeChange);

    return () => {
      resizeObserver.disconnect();
      darkModeMatcher.removeEventListener('change', handleThemeChange);
    };
  }, [mode, clearCanvas]);

  const getCoords = (event: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>): {x: number, y: number} => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    
    const clientX = 'touches' in event.nativeEvent ? event.nativeEvent.touches[0].clientX : event.nativeEvent.clientX;
    const clientY = 'touches' in event.nativeEvent ? event.nativeEvent.touches[0].clientY : event.nativeEvent.clientY;

    return {
        x: (clientX - rect.left),
        y: (clientY - rect.top)
    };
  };

  const startDrawing = useCallback((event: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    event.preventDefault();
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    const { x, y } = getCoords(event);
    isDrawingRef.current = true;
    ctx.beginPath();
    ctx.moveTo(x, y);
    setIsCanvasEmpty(false);
  }, []);

  const draw = useCallback((event: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    event.preventDefault();
    if (!isDrawingRef.current) return;
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    const { x, y } = getCoords(event);
    ctx.lineTo(x, y);
    ctx.stroke();
  }, []);

  const stopDrawing = useCallback(() => {
    if (isDrawingRef.current) {
        isDrawingRef.current = false;
        onEnd?.();
    }
  }, [onEnd]);

  const handleModeChange = (newMode: SignatureMode) => {
    if (mode === newMode) return;
    setMode(newMode);
    if (newMode === 'draw') {
      setTypedSignature('');
    } else {
      clearCanvas();
    }
    onEnd?.();
  };

  const buttonClass = (m: SignatureMode) => `w-full py-2 px-4 rounded-md font-semibold transition-colors ${mode === m ? 'bg-indigo-600 text-white' : 'bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 hover:bg-gray-300 dark:hover:bg-gray-600'}`;

  return (
    <div>
        <div className="grid grid-cols-2 gap-2 mb-2">
            <button type="button" onClick={() => handleModeChange('type')} className={buttonClass('type')}>Type</button>
            <button type="button" onClick={() => handleModeChange('draw')} className={buttonClass('draw')}>Draw</button>
        </div>
        <div className="relative border border-gray-300 dark:border-gray-600 rounded-md h-40 bg-gray-50 dark:bg-gray-900/50">
            {mode === 'type' ? (
                <div className="h-full flex items-center justify-center p-2">
                    <input 
                        type="text" 
                        value={typedSignature} 
                        onChange={(e) => {
                            setTypedSignature(e.target.value);
                            onEnd?.();
                        }}
                        placeholder="Type your signature"
                        className="w-full h-full text-center bg-transparent focus:outline-none text-4xl font-['Brush_Script_MT',_cursive] text-gray-800 dark:text-gray-200 placeholder:text-gray-400 dark:placeholder:text-gray-500"
                        aria-label="Type your signature"
                    />
                </div>
            ) : (
                <>
                    {isCanvasEmpty && (
                        <div className="absolute inset-0 flex items-center justify-center pointer-events-none text-gray-400 dark:text-gray-500 italic text-2xl font-['Brush_Script_MT',_cursive]">
                            Draw your signature
                        </div>
                    )}
                    <canvas 
                        ref={canvasRef} 
                        className="w-full h-full cursor-crosshair"
                        onMouseDown={startDrawing}
                        onMouseMove={draw}
                        onMouseUp={stopDrawing}
                        onMouseLeave={stopDrawing}
                        onTouchStart={startDrawing}
                        onTouchMove={draw}
                        onTouchEnd={stopDrawing}
                        aria-label="Draw your signature"
                    />
                    {!isCanvasEmpty && (
                        <div className="absolute bottom-1 right-2">
                            <button onClick={clearCanvas} type="button" className="text-sm text-indigo-600 dark:text-indigo-400 hover:underline">Clear</button>
                        </div>
                    )}
                </>
            )}
        </div>
    </div>
  );
});

SignaturePad.displayName = 'SignaturePad';
export default SignaturePad;