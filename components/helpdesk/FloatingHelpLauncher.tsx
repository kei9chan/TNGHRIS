import React, { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { helpWidgetEvent, helpWidgetKey } from '../../services/helpWidgetPreferences';

type Position = { x: number; y: number };
type Preference = { hidden: boolean; position: Position | null };
const size = 80;
const readPreference = (key: string): Preference => {
    try {
        const value = JSON.parse(localStorage.getItem(key) || 'null');
        return { hidden: value?.hidden === true, position: Number.isFinite(value?.position?.x) && Number.isFinite(value?.position?.y) ? value.position : null };
    } catch { return { hidden: false, position: null }; }
};

// Keep the complete control above the footer and inside the visible viewport.
function bounded(position: Position | null): Position {
    const viewport = window.visualViewport;
    const left = viewport?.offsetLeft || 0;
    const top = viewport?.offsetTop || 0;
    const width = viewport?.width || innerWidth;
    const height = viewport?.height || innerHeight;
    const footer = document.querySelector('[data-mobile-footer]')?.getBoundingClientRect();
    const bottom = footer?.height ? Math.min(top + height, footer.top) : top + height;
    const maxX = Math.max(left + 8, left + width - size - 8);
    const minY = top + 72;
    const maxY = Math.max(minY, bottom - size - 12);
    return { x: Math.min(maxX, Math.max(left + 8, position?.x ?? maxX - 8)), y: Math.min(maxY, Math.max(minY, position?.y ?? maxY)) };
}

export default function FloatingHelpLauncher({ open, onOpen, children }: { open: boolean; onOpen: () => void; children: React.ReactNode }) {
    const { user } = useAuth();
    const { pathname } = useLocation();
    const key = helpWidgetKey(user?.id);
    const [preference, setPreference] = useState<Preference>(() => readPreference(key));
    const [position, setPosition] = useState<Position>(() => bounded(preference.position));
    const positionRef = useRef(position);
    const drag = useRef<{ id: number; x: number; y: number; origin: Position; moved: boolean } | null>(null);
    const suppressClick = useRef(false);
    const place = (next: Position) => { positionRef.current = next; setPosition(next); };
    const save = (next: Preference) => {
        setPreference(next);
        try { localStorage.setItem(key, JSON.stringify(next)); } catch { /* Drag and dismiss still work without storage. */ }
    };

    useEffect(() => {
        const next = readPreference(key);
        setPreference(next);
        place(bounded(next.position));
        const show = () => { setPreference({ hidden: false, position: null }); place(bounded(null)); };
        window.addEventListener(helpWidgetEvent, show);
        return () => window.removeEventListener(helpWidgetEvent, show);
    }, [key]);

    useEffect(() => {
        const fit = () => place(bounded(positionRef.current));
        fit();
        window.addEventListener('resize', fit);
        window.visualViewport?.addEventListener('resize', fit);
        window.visualViewport?.addEventListener('scroll', fit);
        return () => {
            window.removeEventListener('resize', fit);
            window.visualViewport?.removeEventListener('resize', fit);
            window.visualViewport?.removeEventListener('scroll', fit);
        };
    }, [pathname]);

    if (preference.hidden || open) return null;
    return <div data-help-launcher className={`fixed z-40 h-20 w-20 ${(pathname === '/approvals' || pathname === '/dashboard') ? 'hidden md:block' : ''}`} style={{ left: position.x, top: position.y }}>
        <button type="button" aria-label="Open FAQ Bot" title="Drag to move. Use arrow keys to reposition."
            className="absolute bottom-0 left-0 flex h-16 w-16 touch-none select-none items-center justify-center rounded-full bg-indigo-600 text-white shadow-lg hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
            onPointerDown={event => {
                if (event.button !== 0) return;
                suppressClick.current = false;
                drag.current = { id: event.pointerId, x: event.clientX, y: event.clientY, origin: positionRef.current, moved: false };
                event.currentTarget.setPointerCapture(event.pointerId);
            }}
            onPointerMove={event => {
                const active = drag.current;
                if (!active || active.id !== event.pointerId) return;
                const dx = event.clientX - active.x, dy = event.clientY - active.y;
                if (Math.hypot(dx, dy) > 5) active.moved = true;
                if (active.moved) place(bounded({ x: active.origin.x + dx, y: active.origin.y + dy }));
            }}
            onPointerUp={event => {
                if (drag.current?.id !== event.pointerId) return;
                suppressClick.current = drag.current.moved;
                save({ hidden: false, position: positionRef.current });
                drag.current = null;
                event.currentTarget.releasePointerCapture(event.pointerId);
            }}
            onPointerCancel={() => { drag.current = null; suppressClick.current = true; }}
            onClick={() => { if (suppressClick.current) { suppressClick.current = false; return; } onOpen(); }}
            onKeyDown={event => {
                const direction: Record<string, Position> = { ArrowLeft: {x:-24,y:0}, ArrowRight: {x:24,y:0}, ArrowUp: {x:0,y:-24}, ArrowDown: {x:0,y:24} };
                const delta = direction[event.key];
                if (!delta) return;
                event.preventDefault();
                const next = bounded({ x: positionRef.current.x + delta.x, y: positionRef.current.y + delta.y });
                place(next);
                save({ hidden: false, position: next });
            }}>{children}</button>
        <button type="button" aria-label="Hide help button" title="Hide help button" onClick={() => save({ hidden: true, position: positionRef.current })}
            className="absolute right-0 top-0 flex h-11 w-11 items-center justify-center rounded-full focus:outline-none focus:ring-2 focus:ring-indigo-500">
            <span className="flex h-6 w-6 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 shadow-sm dark:border-slate-600 dark:bg-slate-800 dark:text-white" aria-hidden="true">×</span>
        </button>
    </div>;
}
