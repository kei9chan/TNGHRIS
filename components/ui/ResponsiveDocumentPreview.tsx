import React, { useLayoutEffect, useRef, useState } from 'react';

interface ResponsiveDocumentPreviewProps {
  children: React.ReactNode;
  className?: string;
  documentWidth?: number;
  ariaLabel?: string;
}

const ResponsiveDocumentPreview: React.FC<ResponsiveDocumentPreviewProps> = ({
  children,
  className = '',
  documentWidth = 816,
  ariaLabel = 'Document preview',
}) => {
  const viewportRef = useRef<HTMLDivElement>(null);
  const documentRef = useRef<HTMLDivElement>(null);
  const [layout, setLayout] = useState({ scale: 1, height: 1056, offset: 0 });

  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    const documentElement = documentRef.current;
    if (!viewport || !documentElement) return;

    let frame = 0;
    const measure = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        const availableWidth = Math.max(0, viewport.clientWidth);
        if (!availableWidth) return;
        const scale = Math.min(1, availableWidth / documentWidth);
        const naturalHeight = Math.max(documentElement.scrollHeight, 1);
        const scaledWidth = documentWidth * scale;
        const nextLayout = {
          scale,
          height: Math.ceil(naturalHeight * scale),
          offset: Math.max(0, (availableWidth - scaledWidth) / 2),
        };
        setLayout(previous => (
          previous.scale === nextLayout.scale
          && previous.height === nextLayout.height
          && previous.offset === nextLayout.offset
            ? previous
            : nextLayout
        ));
      });
    };

    const resizeObserver = new ResizeObserver(measure);
    resizeObserver.observe(viewport);
    resizeObserver.observe(documentElement);
    const images = Array.from(documentElement.querySelectorAll<HTMLImageElement>('img'));
    images.forEach(image => image.addEventListener('load', measure));
    measure();

    return () => {
      window.cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      images.forEach(image => image.removeEventListener('load', measure));
    };
  }, [children, documentWidth]);

  return (
    <div
      ref={viewportRef}
      className={`relative w-full overflow-hidden ${className}`}
      style={{ height: `${layout.height}px` }}
      role="region"
      aria-label={ariaLabel}
    >
      <div
        ref={documentRef}
        style={{
          width: `${documentWidth}px`,
          marginLeft: `${layout.offset}px`,
          transform: `scale(${layout.scale})`,
          transformOrigin: 'top left',
        }}
      >
        {children}
      </div>
    </div>
  );
};

export default ResponsiveDocumentPreview;
