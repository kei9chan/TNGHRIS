import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import { BusinessUnit, Permission } from '../../types';
import { usePermissions } from '../../hooks/usePermissions';
import { useAuth } from '../../hooks/useAuth';
import { supabase } from '../../services/supabaseClient';

const ASSET_BUCKET = 'application-page-assets';
const MAX_POSITIONS = 10;
const OUTPUT_SIZE = 1080;
const MAX_IMAGE_SIZE = 20 * 1024 * 1024;
const IMAGE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp'];
const BACKGROUND_HISTORY_KEY = 'tnghris:job-social-media-backgrounds:v1';

type TemplateStyle = {
    id: string;
    name: string;
    description: string;
    backgroundColor: string;
    textColor: string;
    accentColor: string;
    secondaryAccent: string;
    headlineColor: string;
    titleColor: string;
    subjectColor: string;
    ctaColor: string;
    fontFamily: 'Arial' | 'Georgia' | 'Trebuchet MS' | 'Verdana';
    decoration: 'tropical' | 'minimal' | 'corporate' | 'playful';
};

type SocialMediaTemplateRow = {
    id: string;
    name: string;
    business_unit_id: string | null;
    style: Partial<TemplateStyle> | null;
    headline: string;
    cta_line: string;
    subject_line: string;
    logo_url: string | null;
    background_url: string | null;
    background_fit: 'cover' | 'contain' | 'fill';
    overlay_opacity: number;
    contrast_helper: boolean;
    status: 'Active' | 'Archived';
    updated_at: string;
};

type BrandPageAsset = {
    businessUnitId: string;
    logoUrl: string;
    backgroundUrl: string;
};

type BackgroundAsset = {
    id: string;
    name: string;
    url: string;
    createdAt: string;
};

type GeneratedPost = {
    id: string;
    position: string;
    dataUrl: string;
};

const TEMPLATE_STYLES: TemplateStyle[] = [
    {
        id: 'tropical-modern',
        name: 'Tropical Modern',
        description: 'Bright, beach-ready layouts with playful tropical accents.',
        backgroundColor: '#ECFBF8',
        textColor: '#083B4C',
        accentColor: '#0BA7A5',
        secondaryAccent: '#F34D91',
        headlineColor: '#0BA7A5',
        titleColor: '#083B4C',
        subjectColor: '#0BA7A5',
        ctaColor: '#083B4C',
        fontFamily: 'Arial',
        decoration: 'tropical',
    },
    {
        id: 'minimal-clean',
        name: 'Minimal Clean',
        description: 'A calm, high-contrast layout for simple, polished hiring posts.',
        backgroundColor: '#F7F8FA',
        textColor: '#12233F',
        accentColor: '#1677A8',
        secondaryAccent: '#56B7A9',
        headlineColor: '#1677A8',
        titleColor: '#12233F',
        subjectColor: '#1677A8',
        ctaColor: '#12233F',
        fontFamily: 'Arial',
        decoration: 'minimal',
    },
    {
        id: 'bold-corporate',
        name: 'Bold Corporate',
        description: 'Strong typography and a confident dark brand foundation.',
        backgroundColor: '#0B1630',
        textColor: '#FFFFFF',
        accentColor: '#72E0D0',
        secondaryAccent: '#F7C45E',
        headlineColor: '#72E0D0',
        titleColor: '#FFFFFF',
        subjectColor: '#72E0D0',
        ctaColor: '#FFFFFF',
        fontFamily: 'Arial',
        decoration: 'corporate',
    },
    {
        id: 'fun-youthful',
        name: 'Fun Youthful',
        description: 'Colorful shapes and energetic accents for guest-facing teams.',
        backgroundColor: '#FFF3FA',
        textColor: '#3B175E',
        accentColor: '#F22574',
        secondaryAccent: '#7B46D8',
        headlineColor: '#F22574',
        titleColor: '#3B175E',
        subjectColor: '#F22574',
        ctaColor: '#3B175E',
        fontFamily: 'Arial',
        decoration: 'playful',
    },
];

const DEFAULT_POSITIONS = ['', '', '', '', '', '', '', '', '', ''];

const getRandomId = () => globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;

const normalizeName = (value: unknown) => String(value || '').trim().toLowerCase();

const HEX_COLOR_PATTERN = /^#[0-9A-F]{6}$/i;

const normalizeTemplateStyle = (value: Partial<TemplateStyle> | null | undefined, fallback: TemplateStyle): TemplateStyle => ({
    ...fallback,
    ...value,
    backgroundColor: HEX_COLOR_PATTERN.test(String(value?.backgroundColor || '')) ? String(value?.backgroundColor).toUpperCase() : fallback.backgroundColor,
    textColor: HEX_COLOR_PATTERN.test(String(value?.textColor || '')) ? String(value?.textColor).toUpperCase() : fallback.textColor,
    accentColor: HEX_COLOR_PATTERN.test(String(value?.accentColor || '')) ? String(value?.accentColor).toUpperCase() : fallback.accentColor,
    secondaryAccent: HEX_COLOR_PATTERN.test(String(value?.secondaryAccent || '')) ? String(value?.secondaryAccent).toUpperCase() : fallback.secondaryAccent,
    headlineColor: HEX_COLOR_PATTERN.test(String(value?.headlineColor || '')) ? String(value?.headlineColor).toUpperCase() : fallback.headlineColor,
    titleColor: HEX_COLOR_PATTERN.test(String(value?.titleColor || '')) ? String(value?.titleColor).toUpperCase() : fallback.titleColor,
    subjectColor: HEX_COLOR_PATTERN.test(String(value?.subjectColor || '')) ? String(value?.subjectColor).toUpperCase() : fallback.subjectColor,
    ctaColor: HEX_COLOR_PATTERN.test(String(value?.ctaColor || '')) ? String(value?.ctaColor).toUpperCase() : fallback.ctaColor,
});

const validateImageFile = (file: File): string => {
    const extensionAllowed = IMAGE_EXTENSIONS.some(extension => file.name.toLowerCase().endsWith(extension));
    if (!IMAGE_MIME_TYPES.includes(file.type) && !extensionAllowed) {
        return 'Unsupported image type. Use JPG, PNG, or WebP.';
    }
    if (file.size > MAX_IMAGE_SIZE) {
        return 'The image must be 20 MB or smaller.';
    }
    return '';
};

const loadImage = (src: string): Promise<HTMLImageElement | null> => new Promise(resolve => {
    if (!src) {
        resolve(null);
        return;
    }
    const image = new Image();
    if (/^https?:\/\//i.test(src)) image.crossOrigin = 'anonymous';
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = src;
});

const wrapText = (ctx: CanvasRenderingContext2D, value: string, maxWidth: number): string[] => {
    const words = value.trim().split(/\s+/).filter(Boolean);
    if (!words.length) return [];
    const lines: string[] = [];
    let current = '';
    words.forEach(word => {
        const pieces: string[] = [];
        let piece = '';
        for (const character of word) {
            const candidate = `${piece}${character}`;
            if (piece && ctx.measureText(candidate).width > maxWidth) {
                pieces.push(piece);
                piece = character;
            } else {
                piece = candidate;
            }
        }
        if (piece) pieces.push(piece);

        pieces.forEach((part, partIndex) => {
            const candidate = partIndex === 0 && current ? `${current} ${part}` : `${current}${part}`;
            if (current && ctx.measureText(candidate).width > maxWidth) {
                lines.push(current);
                current = part;
            } else {
                current = candidate;
            }
        });
    });
    if (current) lines.push(current);
    return lines;
};

const drawCenteredText = (
    ctx: CanvasRenderingContext2D,
    value: string,
    centerX: number,
    startY: number,
    maxWidth: number,
    font: string,
    color: string,
    lineHeight: number,
    maxLines?: number,
) => {
    if (!value.trim()) return startY;
    ctx.font = font;
    ctx.fillStyle = color;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    const lines = wrapText(ctx, value, maxWidth);
    const visibleLines = maxLines ? lines.slice(0, maxLines) : lines;
    visibleLines.forEach((line, index) => ctx.fillText(line, centerX, startY + index * lineHeight));
    return startY + visibleLines.length * lineHeight;
};

const fitTitleToBox = (ctx: CanvasRenderingContext2D, value: string, fontFamily: string) => {
    const maxWidth = 900;
    const maxHeight = 290;
    const maxLines = 4;
    const minimumFontSize = 32;
    let fontSize = 128;
    let lines: string[] = [];
    let lineHeight = 0;

    while (fontSize >= minimumFontSize) {
        ctx.font = `900 ${fontSize}px ${fontFamily}`;
        lines = wrapText(ctx, value, maxWidth);
        lineHeight = Math.round(fontSize * 0.9);
        if (lines.length <= maxLines && lines.length * lineHeight <= maxHeight) break;
        fontSize -= 4;
    }

    ctx.font = `900 ${fontSize}px ${fontFamily}`;
    lines = wrapText(ctx, value, maxWidth);
    lineHeight = Math.round(fontSize * 0.9);
    return { fontSize, lineHeight, lines };
};

const drawBackgroundImage = (
    ctx: CanvasRenderingContext2D,
    image: HTMLImageElement,
    fit: 'cover' | 'contain' | 'fill',
    width: number,
    height: number,
) => {
    if (fit === 'fill') {
        ctx.drawImage(image, 0, 0, width, height);
        return;
    }
    const scale = fit === 'contain'
        ? Math.min(width / image.width, height / image.height)
        : Math.max(width / image.width, height / image.height);
    const drawWidth = image.width * scale;
    const drawHeight = image.height * scale;
    const offsetX = (width - drawWidth) / 2;
    const offsetY = (height - drawHeight) / 2;
    ctx.drawImage(image, offsetX, offsetY, drawWidth, drawHeight);
};

const drawDecorations = (ctx: CanvasRenderingContext2D, style: TemplateStyle) => {
    const alpha = (color: string, opacity: number) => {
        const hex = color.replace('#', '');
        if (hex.length !== 6) return color;
        const red = parseInt(hex.slice(0, 2), 16);
        const green = parseInt(hex.slice(2, 4), 16);
        const blue = parseInt(hex.slice(4, 6), 16);
        return `rgba(${red}, ${green}, ${blue}, ${opacity})`;
    };

    if (style.decoration === 'tropical') {
        ctx.fillStyle = alpha(style.secondaryAccent, 0.22);
        ctx.beginPath();
        ctx.arc(100, 150, 180, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = alpha(style.accentColor, 0.2);
        ctx.beginPath();
        ctx.arc(1000, 930, 220, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = alpha(style.secondaryAccent, 0.65);
        ctx.lineWidth = 20;
        ctx.beginPath();
        ctx.arc(940, 165, 90, 0.25, 2.4);
        ctx.stroke();
    }

    if (style.decoration === 'minimal') {
        ctx.fillStyle = alpha(style.accentColor, 0.1);
        ctx.fillRect(0, 0, 28, OUTPUT_SIZE);
        ctx.fillRect(OUTPUT_SIZE - 28, 0, 28, OUTPUT_SIZE);
        ctx.strokeStyle = alpha(style.secondaryAccent, 0.7);
        ctx.lineWidth = 8;
        ctx.beginPath();
        ctx.moveTo(88, 210);
        ctx.lineTo(230, 210);
        ctx.stroke();
    }

    if (style.decoration === 'corporate') {
        const gradient = ctx.createLinearGradient(0, 0, OUTPUT_SIZE, OUTPUT_SIZE);
        gradient.addColorStop(0, alpha(style.accentColor, 0.25));
        gradient.addColorStop(1, alpha(style.secondaryAccent, 0));
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, OUTPUT_SIZE, OUTPUT_SIZE);
        ctx.fillStyle = alpha(style.accentColor, 0.2);
        ctx.fillRect(0, 0, 20, OUTPUT_SIZE);
        ctx.fillRect(OUTPUT_SIZE - 20, 0, 20, OUTPUT_SIZE);
    }

    if (style.decoration === 'playful') {
        ctx.fillStyle = alpha(style.secondaryAccent, 0.18);
        ctx.beginPath();
        ctx.arc(100, 920, 180, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = alpha(style.accentColor, 0.16);
        ctx.beginPath();
        ctx.arc(1015, 155, 170, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = alpha(style.accentColor, 0.8);
        ctx.lineWidth = 14;
        ctx.beginPath();
        ctx.moveTo(790, 935);
        ctx.bezierCurveTo(850, 885, 905, 985, 980, 925);
        ctx.stroke();
    }
};

const renderSocialPost = async ({
    position,
    headline,
    ctaLine,
    subjectLine,
    brandWordmark,
    logoImage,
    backgroundImage,
    style,
    backgroundFit,
    overlayOpacity,
    contrastHelper,
}: {
    position: string;
    headline: string;
    ctaLine: string;
    subjectLine: string;
    brandWordmark: string;
    logoImage: HTMLImageElement | null;
    backgroundImage: HTMLImageElement | null;
    style: TemplateStyle;
    backgroundFit: 'cover' | 'contain' | 'fill';
    overlayOpacity: number;
    contrastHelper: boolean;
}): Promise<string> => {
    const canvas = document.createElement('canvas');
    canvas.width = OUTPUT_SIZE;
    canvas.height = OUTPUT_SIZE;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Your browser could not create the social post image.');

    ctx.fillStyle = style.backgroundColor;
    ctx.fillRect(0, 0, OUTPUT_SIZE, OUTPUT_SIZE);
    if (backgroundImage) drawBackgroundImage(ctx, backgroundImage, backgroundFit, OUTPUT_SIZE, OUTPUT_SIZE);
    if (overlayOpacity > 0) {
        ctx.fillStyle = style.decoration === 'corporate' ? `rgba(11, 22, 48, ${overlayOpacity})` : `rgba(255, 255, 255, ${overlayOpacity})`;
        ctx.fillRect(0, 0, OUTPUT_SIZE, OUTPUT_SIZE);
    }
    drawDecorations(ctx, style);
    if (contrastHelper) {
        const helper = ctx.createLinearGradient(0, 180, 0, 860);
        helper.addColorStop(0, 'rgba(0,0,0,0.2)');
        helper.addColorStop(0.45, 'rgba(0,0,0,0.05)');
        helper.addColorStop(1, 'rgba(0,0,0,0.25)');
        ctx.fillStyle = helper;
        ctx.fillRect(0, 0, OUTPUT_SIZE, OUTPUT_SIZE);
    }

    const isLightBackground = style.decoration !== 'corporate';
    const textColor = contrastHelper && !isLightBackground ? '#FFFFFF' : style.textColor;
    const titleColor = contrastHelper && !isLightBackground ? '#FFFFFF' : style.titleColor;
    const ctaColor = contrastHelper && !isLightBackground ? '#FFFFFF' : style.ctaColor;
    const accentColor = style.accentColor;
    const fontFamily = `"${style.fontFamily}", Arial, sans-serif`;

    if (logoImage) {
        const maxWidth = 330;
        const maxHeight = 130;
        const scale = Math.min(maxWidth / logoImage.width, maxHeight / logoImage.height, 1);
        const width = logoImage.width * scale;
        const height = logoImage.height * scale;
        ctx.drawImage(logoImage, (OUTPUT_SIZE - width) / 2, 58, width, height);
    } else {
        drawCenteredText(ctx, brandWordmark.toUpperCase(), OUTPUT_SIZE / 2, 82, 800, `800 42px ${fontFamily}`, textColor, 50, 2);
    }

    const headlineY = logoImage ? 260 : 220;
    drawCenteredText(ctx, headline.toUpperCase() || 'WE ARE HIRING', OUTPUT_SIZE / 2, headlineY, 880, `800 54px ${fontFamily}`, style.headlineColor, 68, 2);

    const title = position.toUpperCase();
    const { fontSize: titleFontSize, lineHeight: titleLineHeight, lines: titleLines } = fitTitleToBox(ctx, title, fontFamily);
    const titleY = headlineY + 145;
    drawCenteredText(ctx, title, OUTPUT_SIZE / 2, titleY, 900, `900 ${titleFontSize}px ${fontFamily}`, titleColor, titleLineHeight, titleLines.length);

    ctx.strokeStyle = accentColor;
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.moveTo(180, 700);
    ctx.lineTo(900, 700);
    ctx.stroke();

    const resolvedSubject = subjectLine.replace(/\[POSITION\]/gi, position.toUpperCase());
    if (resolvedSubject.trim()) {
        drawCenteredText(ctx, resolvedSubject.toUpperCase(), OUTPUT_SIZE / 2, 748, 850, `800 28px ${fontFamily}`, style.subjectColor, 38, 2);
    }

    const normalizedCta = ctaLine.trim();
    const ctaStart = resolvedSubject.trim() ? 862 : 810;
    if (normalizedCta) {
        const looksLikeEmailOnly = normalizedCta.includes('@') && !/(send|email|contact|apply|cv|resume)/i.test(normalizedCta);
        if (looksLikeEmailOnly) {
            drawCenteredText(ctx, 'SEND YOUR CV TO:', OUTPUT_SIZE / 2, ctaStart, 850, `800 30px ${fontFamily}`, style.subjectColor, 38, 1);
            drawCenteredText(ctx, normalizedCta, OUTPUT_SIZE / 2, ctaStart + 44, 900, `700 34px ${fontFamily}`, ctaColor, 42, 2);
        } else {
            drawCenteredText(ctx, normalizedCta.toUpperCase(), OUTPUT_SIZE / 2, ctaStart, 900, `700 32px ${fontFamily}`, ctaColor, 44, 3);
        }
    }

    return canvas.toDataURL('image/png');
};

const readBackgroundHistory = (): BackgroundAsset[] => {
    try {
        const raw = localStorage.getItem(BACKGROUND_HISTORY_KEY);
        const parsed = raw ? JSON.parse(raw) : [];
        return Array.isArray(parsed) ? parsed.filter(item => item?.url).slice(0, 8) : [];
    } catch {
        return [];
    }
};

const ColorControl: React.FC<{ label: string; value: string; onChange: (value: string) => void }> = ({ label, value, onChange }) => (
    <label className="block rounded-lg border border-gray-200 bg-white p-2.5 dark:border-slate-700 dark:bg-slate-900">
        <span className="block text-xs font-semibold text-gray-600 dark:text-gray-300">{label}</span>
        <span className="mt-2 flex items-center gap-2">
            <input type="color" value={value} onChange={event => onChange(event.target.value.toUpperCase())} className="h-9 w-11 cursor-pointer rounded border border-gray-300 bg-white p-1 dark:border-slate-600 dark:bg-slate-800" aria-label={`${label} color`} />
            <span className="font-mono text-xs font-semibold text-gray-700 dark:text-gray-200">{value.toUpperCase()}</span>
        </span>
    </label>
);

const JobSocialMediaPostGenerator: React.FC = () => {
    const { can, getAccessibleBusinessUnits } = usePermissions();
    const { user } = useAuth();
    const canManage = can('JobPosts', Permission.Manage);
    const [businessUnits, setBusinessUnits] = useState<BusinessUnit[]>([]);
    const [brandAssets, setBrandAssets] = useState<BrandPageAsset[]>([]);
    const [savedTemplateRows, setSavedTemplateRows] = useState<any[]>([]);
    const [socialTemplateRows, setSocialTemplateRows] = useState<SocialMediaTemplateRow[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [loadError, setLoadError] = useState('');
    const [businessUnitId, setBusinessUnitId] = useState('');
    const [templateId, setTemplateId] = useState(TEMPLATE_STYLES[0].id);
    const [editableStyle, setEditableStyle] = useState<TemplateStyle>(TEMPLATE_STYLES[0]);
    const [templateName, setTemplateName] = useState(`${TEMPLATE_STYLES[0].name} Custom`);
    const [isSavingTemplate, setIsSavingTemplate] = useState(false);
    const [templateSaveStatus, setTemplateSaveStatus] = useState('');
    const [logoUrl, setLogoUrl] = useState('');
    const [logoSource, setLogoSource] = useState<'auto' | 'custom'>('auto');
    const [backgroundSelection, setBackgroundSelection] = useState('template');
    const [backgroundHistory, setBackgroundHistory] = useState<BackgroundAsset[]>(readBackgroundHistory);
    const [headline, setHeadline] = useState('WE ARE HIRING');
    const [ctaLine, setCtaLine] = useState('careers.inflatableisland@gmail.com');
    const [subjectLine, setSubjectLine] = useState('Subject: [POSITION] - [FULL NAME]');
    const [positions, setPositions] = useState<string[]>(DEFAULT_POSITIONS);
    const [backgroundFit, setBackgroundFit] = useState<'cover' | 'contain' | 'fill'>('cover');
    const [overlayOpacity, setOverlayOpacity] = useState(0.08);
    const [contrastHelper, setContrastHelper] = useState(false);
    const [generatedPosts, setGeneratedPosts] = useState<GeneratedPost[]>([]);
    const [showAllPosts, setShowAllPosts] = useState(false);
    const [isGenerating, setIsGenerating] = useState(false);
    const [isUploading, setIsUploading] = useState<'logo' | 'background' | null>(null);
    const [generationError, setGenerationError] = useState('');
    const [generationNotice, setGenerationNotice] = useState('');
    const generationId = useRef(0);
    const logoInputRef = useRef<HTMLInputElement>(null);
    const backgroundInputRef = useRef<HTMLInputElement>(null);
    const ctaEditedRef = useRef(false);

    const accessibleBusinessUnits = useMemo(
        () => getAccessibleBusinessUnits(businessUnits),
        [businessUnits, getAccessibleBusinessUnits]
    );
    const selectedBusinessUnit = useMemo(
        () => accessibleBusinessUnits.find(unit => unit.id === businessUnitId),
        [accessibleBusinessUnits, businessUnitId]
    );
    const selectedStyle = editableStyle;
    const selectedSavedTemplate = useMemo(
        () => socialTemplateRows.find(template => `saved:${template.id}` === templateId),
        [socialTemplateRows, templateId]
    );
    const selectedBrandAsset = useMemo(() => {
        const current = brandAssets.find(asset => asset.businessUnitId === businessUnitId);
        const currentName = normalizeName(selectedBusinessUnit?.name);
        const templateAsset = savedTemplateRows.find(row => normalizeName(row.business_unit) === currentName && (row.background_image || row.logo_image));
        return {
            logoUrl: current?.logoUrl || templateAsset?.logo_image || '',
            backgroundUrl: current?.backgroundUrl || templateAsset?.background_image || '',
        };
    }, [brandAssets, businessUnitId, savedTemplateRows, selectedBusinessUnit?.name]);
    const activeBackgroundUrl = backgroundSelection === 'template' ? selectedBrandAsset.backgroundUrl : backgroundSelection;
    const brandWordmark = selectedBusinessUnit?.name || 'TNG HRIS';
    const filledPositions = useMemo(() => positions.filter(position => position.trim()), [positions]);
    const filledCount = filledPositions.length;

    const persistBackgroundHistory = useCallback((items: BackgroundAsset[]) => {
        setBackgroundHistory(items);
        try {
            localStorage.setItem(BACKGROUND_HISTORY_KEY, JSON.stringify(items));
        } catch {
            // The generator continues to work even when browser storage is blocked.
        }
    }, []);

    const loadGeneratorData = useCallback(async () => {
        setIsLoading(true);
        setLoadError('');
        try {
            const [buResult, pageResult, templateResult, socialTemplateResult] = await Promise.all([
                supabase.from('business_units').select('id,name,code,color').order('name'),
                supabase.from('applicant_page_themes').select('business_unit_id,logo_url,hero_image_url').order('updated_at', { ascending: false }),
                supabase.from('job_post_templates').select('business_unit,background_image,logo_image').order('updated_at', { ascending: false }),
                supabase.from('job_social_media_templates').select('*').eq('status', 'Active').order('updated_at', { ascending: false }),
            ]);
            if (buResult.error) throw buResult.error;
            setBusinessUnits((buResult.data || []) as BusinessUnit[]);
            setBrandAssets((pageResult.data || []).map((row: any) => ({
                businessUnitId: row.business_unit_id,
                logoUrl: row.logo_url || '',
                backgroundUrl: row.hero_image_url || '',
            })));
            if (templateResult.error) {
                console.warn('Saved visual templates could not be loaded for generator defaults', templateResult.error);
                setSavedTemplateRows([]);
            } else {
                setSavedTemplateRows(templateResult.data || []);
            }
            if (socialTemplateResult.error) {
                console.warn('Reusable social media templates could not be loaded', socialTemplateResult.error);
                setSocialTemplateRows([]);
            } else {
                setSocialTemplateRows((socialTemplateResult.data || []) as SocialMediaTemplateRow[]);
            }
        } catch (error: any) {
            console.error('Failed to load job social post generator assets', error);
            setLoadError(error?.message || 'Business units could not be loaded. Please try again.');
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        if (canManage) loadGeneratorData();
        else setIsLoading(false);
    }, [canManage, loadGeneratorData]);

    useEffect(() => {
        if (!businessUnitId && accessibleBusinessUnits.length) {
            const preferred = accessibleBusinessUnits.find(unit => normalizeName(unit.name).includes('inflatable island')) || accessibleBusinessUnits[0];
            setBusinessUnitId(preferred.id);
        }
    }, [accessibleBusinessUnits, businessUnitId]);

    useEffect(() => {
        if (logoSource === 'auto') setLogoUrl(selectedBrandAsset.logoUrl);
    }, [logoSource, selectedBrandAsset.logoUrl]);

    useEffect(() => {
        if (!selectedBusinessUnit || ctaEditedRef.current) return;
        const name = normalizeName(selectedBusinessUnit.name);
        if (name.includes('inflatable island')) setCtaLine('careers.inflatableisland@gmail.com');
        else setCtaLine('recruitment@thenextperience.com');
    }, [selectedBusinessUnit]);

    const applyTemplateSelection = (nextTemplateId: string) => {
        setTemplateId(nextTemplateId);
        setTemplateSaveStatus('');
        const builtIn = TEMPLATE_STYLES.find(style => style.id === nextTemplateId);
        if (builtIn) {
            setEditableStyle({ ...builtIn });
            setTemplateName(`${builtIn.name} Custom`);
            return;
        }
        const saved = socialTemplateRows.find(template => `saved:${template.id}` === nextTemplateId);
        if (!saved) return;
        const fallback = TEMPLATE_STYLES.find(style => style.id === saved.style?.id) || TEMPLATE_STYLES[0];
        setEditableStyle(normalizeTemplateStyle(saved.style, fallback));
        setTemplateName(saved.name);
        setBusinessUnitId(saved.business_unit_id || businessUnitId);
        setHeadline(saved.headline || 'WE ARE HIRING');
        setCtaLine(saved.cta_line || '');
        ctaEditedRef.current = true;
        setSubjectLine(saved.subject_line || '');
        setLogoUrl(saved.logo_url || '');
        setLogoSource(saved.logo_url ? 'custom' : 'auto');
        setBackgroundSelection(saved.background_url || 'template');
        setBackgroundFit(saved.background_fit || 'cover');
        setOverlayOpacity(Number(saved.overlay_opacity ?? 0.08));
        setContrastHelper(Boolean(saved.contrast_helper));
        setGenerationNotice(`Loaded editable template “${saved.name}”.`);
    };

    const updateStyle = <K extends keyof TemplateStyle>(key: K, value: TemplateStyle[K]) => {
        setEditableStyle(previous => ({ ...previous, [key]: value }));
        setTemplateSaveStatus('Unsaved template changes');
    };

    const saveReusableTemplate = async (saveAsCopy = false) => {
        const trimmedName = templateName.trim();
        if (!trimmedName) {
            setGenerationError('Enter a template name before saving.');
            return;
        }
        if (!businessUnitId) {
            setGenerationError('Select a business unit before saving the template.');
            return;
        }
        setIsSavingTemplate(true);
        setGenerationError('');
        setTemplateSaveStatus('Saving template…');
        const payload = {
            name: trimmedName,
            business_unit_id: businessUnitId,
            style: editableStyle,
            headline,
            cta_line: ctaLine,
            subject_line: subjectLine,
            logo_url: logoSource === 'custom' ? logoUrl || null : null,
            background_url: backgroundSelection === 'template' ? null : backgroundSelection,
            background_fit: backgroundFit,
            overlay_opacity: overlayOpacity,
            contrast_helper: contrastHelper,
            status: 'Active',
            created_by_user_id: user?.id || null,
        };
        try {
            const shouldUpdate = selectedSavedTemplate && !saveAsCopy;
            const request = shouldUpdate
                ? supabase.from('job_social_media_templates').update(payload).eq('id', selectedSavedTemplate.id).select('*').single()
                : supabase.from('job_social_media_templates').insert(payload).select('*').single();
            const { data, error } = await request;
            if (error) throw error;
            const saved = data as SocialMediaTemplateRow;
            setSocialTemplateRows(previous => [saved, ...previous.filter(item => item.id !== saved.id)]);
            setTemplateId(`saved:${saved.id}`);
            setTemplateName(saved.name);
            setTemplateSaveStatus('Template saved just now');
            setGenerationNotice(`Reusable template “${saved.name}” saved.`);
        } catch (error: any) {
            console.error('Failed to save social media template', error);
            setTemplateSaveStatus('Unable to save template');
            setGenerationError(error?.message || 'The template could not be saved. Please try again.');
        } finally {
            setIsSavingTemplate(false);
        }
    };

    const uploadAsset = async (file: File, kind: 'logo' | 'background') => {
        const validationError = validateImageFile(file);
        if (validationError) {
            setGenerationError(validationError);
            return;
        }
        const authUserId = user?.authUserId || user?.id;
        if (!authUserId) {
            setGenerationError('You must be signed in to upload an image.');
            return;
        }

        setGenerationError('');
        setIsUploading(kind);
        const extension = file.name.split('.').pop()?.toLowerCase() || 'png';
        const path = `hero/${authUserId}/job-social-media/${getRandomId()}-${kind}.${extension}`;
        try {
            const { data, error } = await supabase.storage.from(ASSET_BUCKET).upload(path, file, {
                cacheControl: '31536000',
                contentType: file.type,
                upsert: false,
            });
            if (error) throw error;
            const { data: publicUrlData } = supabase.storage.from(ASSET_BUCKET).getPublicUrl(data?.path || path);
            const publicUrl = publicUrlData?.publicUrl;
            if (!publicUrl) throw new Error('The image uploaded, but its public URL could not be created.');

            if (kind === 'logo') {
                setLogoSource('custom');
                setLogoUrl(publicUrl);
                setGenerationNotice('Custom logo uploaded.');
            } else {
                const asset: BackgroundAsset = { id: getRandomId(), name: file.name, url: publicUrl, createdAt: new Date().toISOString() };
                persistBackgroundHistory([asset, ...backgroundHistory.filter(item => item.url !== publicUrl)].slice(0, 8));
                setBackgroundSelection(publicUrl);
                setGenerationNotice('Background uploaded and selected for this batch.');
            }
        } catch (error: any) {
            console.error(`Failed to upload ${kind}`, error);
            setGenerationError(error?.message || `${kind === 'logo' ? 'Logo' : 'Background'} upload failed. Please try again.`);
            setGenerationNotice('');
        } finally {
            setIsUploading(null);
        }
    };

    const drawPosts = useCallback(async (items: string[], mode: 'preview' | 'all'): Promise<GeneratedPost[]> => {
        if (!items.length) {
            setGenerationError('Enter at least one position before generating.');
            return [];
        }

        const requestId = ++generationId.current;
        setIsGenerating(true);
        setGenerationError('');
        setGenerationNotice(mode === 'all' ? 'Generating your hiring images…' : 'Updating preview…');
        try {
            const [logoImage, backgroundImage] = await Promise.all([loadImage(logoUrl), loadImage(activeBackgroundUrl)]);
            const assetWarnings: string[] = [];
            if (logoUrl && !logoImage) assetWarnings.push('The logo could not be loaded, so the business-unit wordmark was used.');
            if (activeBackgroundUrl && !backgroundImage) assetWarnings.push('The background could not be loaded, so the template color was used.');
            const rendered = await Promise.all(items.map(async position => ({
                id: getRandomId(),
                position,
                dataUrl: await renderSocialPost({
                    position,
                    headline,
                    ctaLine,
                    subjectLine,
                    brandWordmark,
                    logoImage,
                    backgroundImage,
                    style: selectedStyle,
                    backgroundFit,
                    overlayOpacity,
                    contrastHelper,
                }),
            })));
            if (requestId !== generationId.current) return [];
            setGeneratedPosts(rendered);
            setShowAllPosts(mode === 'all');
            setGenerationNotice(assetWarnings.length ? assetWarnings.join(' ') : `${rendered.length} image${rendered.length === 1 ? '' : 's'} ready.`);
            return rendered;
        } catch (error: any) {
            if (requestId === generationId.current) setGenerationError(error?.message || 'The images could not be generated. Please try again.');
            return [];
        } finally {
            if (requestId === generationId.current) setIsGenerating(false);
        }
    }, [activeBackgroundUrl, backgroundFit, brandWordmark, contrastHelper, ctaLine, headline, logoUrl, overlayOpacity, selectedStyle, subjectLine]);

    const previewSignature = useMemo(() => JSON.stringify({
        businessUnitId,
        templateId,
        logoUrl,
        activeBackgroundUrl,
        headline,
        ctaLine,
        subjectLine,
        positions,
        backgroundFit,
        overlayOpacity,
        contrastHelper,
        selectedStyle,
    }), [activeBackgroundUrl, backgroundFit, businessUnitId, contrastHelper, ctaLine, headline, logoUrl, overlayOpacity, positions, selectedStyle, subjectLine, templateId]);

    useEffect(() => {
        if (!filledCount) {
            generationId.current += 1;
            setGeneratedPosts([]);
            setGenerationNotice('Add positions to see a live preview.');
            setGenerationError('');
            return;
        }
        const timer = window.setTimeout(() => {
            drawPosts(filledPositions.slice(0, 3), 'preview');
        }, 450);
        return () => window.clearTimeout(timer);
    }, [drawPosts, filledCount, filledPositions, previewSignature]);

    const updatePosition = (index: number, value: string) => {
        setPositions(previous => previous.map((position, positionIndex) => positionIndex === index ? value : position));
    };

    const downloadPost = (post: GeneratedPost) => {
        const link = document.createElement('a');
        link.download = `Job_Post_${post.position.trim().replace(/[^a-z0-9]+/gi, '_') || 'Position'}.png`;
        link.href = post.dataUrl;
        link.click();
    };

    const handleDownloadAll = async () => {
        const posts = generatedPosts.length === filledCount && showAllPosts
            ? generatedPosts
            : await drawPosts(filledPositions, 'all');
        if (!posts.length) return;
        posts.forEach((post, index) => window.setTimeout(() => downloadPost(post), index * 140));
        setGenerationNotice(`Started ${posts.length} downloads. If your browser asks, allow multiple downloads for TNG HRIS.`);
    };

    const activeBackgroundPreview = activeBackgroundUrl || '';
    const displayedPosts = showAllPosts ? generatedPosts : generatedPosts.slice(0, 3);

    if (!canManage) {
        return <Card><div className="p-6 text-gray-600 dark:text-gray-300">You do not have permission to generate job social media posts.</div></Card>;
    }

    return (
        <div className="space-y-6">
            <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
                <div>
                    <div className="mb-2 flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400"><span>Recruitment</span><span aria-hidden="true">›</span><span>Job Posts</span></div>
                    <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Job Social Media Post Generator</h1>
                    <p className="mt-1 text-gray-600 dark:text-gray-400">Generate one 1080 × 1080 hiring image per position in one click.</p>
                </div>
                <div className="rounded-full bg-teal-50 px-4 py-2 text-sm font-semibold text-teal-700 dark:bg-teal-900/30 dark:text-teal-300">Max {MAX_POSITIONS} positions per batch</div>
            </div>

            {loadError && <div className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950/30 dark:text-red-200">{loadError}</div>}

            <div className="grid items-start gap-6 xl:grid-cols-[minmax(360px,0.78fr)_minmax(0,1.22fr)]">
                <Card className="!p-0">
                    <div className="border-b border-gray-200 p-5 dark:border-slate-700">
                        <h2 className="text-lg font-bold text-gray-900 dark:text-white">Create hiring posts</h2>
                        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Choose a style, add your brand assets, then enter the positions you need.</p>
                    </div>
                    <div className="space-y-5 p-5">
                        <div className="grid gap-4 sm:grid-cols-2">
                            <label className="block text-sm font-semibold text-gray-700 dark:text-gray-200">
                                Business Unit
                                <select value={businessUnitId} onChange={event => { setBusinessUnitId(event.target.value); setLogoSource('auto'); }} disabled={isLoading} className="mt-1.5 w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 font-normal text-gray-900 outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-200 dark:border-slate-600 dark:bg-slate-900 dark:text-white">
                                    <option value="">{isLoading ? 'Loading business units…' : 'Select business unit'}</option>
                                    {accessibleBusinessUnits.map(unit => <option key={unit.id} value={unit.id}>{unit.name}</option>)}
                                </select>
                            </label>
                            <label className="block text-sm font-semibold text-gray-700 dark:text-gray-200">
                                Template
                                <select value={templateId} onChange={event => applyTemplateSelection(event.target.value)} className="mt-1.5 w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 font-normal text-gray-900 outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-200 dark:border-slate-600 dark:bg-slate-900 dark:text-white">
                                    <optgroup label="Built-in starting points">
                                        {TEMPLATE_STYLES.map(style => <option key={style.id} value={style.id}>{style.name}</option>)}
                                    </optgroup>
                                    {socialTemplateRows.length > 0 && <optgroup label="Saved editable templates">
                                        {socialTemplateRows.map(template => <option key={template.id} value={`saved:${template.id}`}>{template.name}{template.business_unit_id && template.business_unit_id !== businessUnitId ? ' · Other business unit' : ''}</option>)}
                                    </optgroup>}
                                </select>
                                <span className="mt-1 block text-xs font-normal text-gray-500 dark:text-gray-400">{selectedStyle.description}</span>
                            </label>
                        </div>

                        <div className="rounded-xl border border-teal-200 bg-teal-50/40 p-4 dark:border-teal-900/60 dark:bg-teal-950/10">
                            <div className="flex flex-wrap items-start justify-between gap-3">
                                <div>
                                    <p className="text-sm font-bold text-gray-900 dark:text-white">Edit template & text colors</p>
                                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Changes update the preview immediately. Save a reusable copy when you want to use the design again.</p>
                                </div>
                                {templateSaveStatus && <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${templateSaveStatus.includes('Unable') ? 'bg-red-100 text-red-700' : templateSaveStatus.includes('Unsaved') ? 'bg-amber-100 text-amber-700' : 'bg-green-100 text-green-700'}`}>{templateSaveStatus}</span>}
                            </div>
                            <div className="mt-4 grid gap-3 sm:grid-cols-2">
                                <ColorControl label="Background" value={selectedStyle.backgroundColor} onChange={value => updateStyle('backgroundColor', value)} />
                                <ColorControl label="Brand wordmark text" value={selectedStyle.textColor} onChange={value => updateStyle('textColor', value)} />
                                <ColorControl label="Job title text" value={selectedStyle.titleColor} onChange={value => updateStyle('titleColor', value)} />
                                <ColorControl label="Headline text" value={selectedStyle.headlineColor} onChange={value => updateStyle('headlineColor', value)} />
                                <ColorControl label="Subject text" value={selectedStyle.subjectColor} onChange={value => updateStyle('subjectColor', value)} />
                                <ColorControl label="Contact / CTA text" value={selectedStyle.ctaColor} onChange={value => updateStyle('ctaColor', value)} />
                                <ColorControl label="Lines & accents" value={selectedStyle.accentColor} onChange={value => updateStyle('accentColor', value)} />
                                <ColorControl label="Decorative accent" value={selectedStyle.secondaryAccent} onChange={value => updateStyle('secondaryAccent', value)} />
                                <label className="block rounded-lg border border-gray-200 bg-white p-2.5 text-xs font-semibold text-gray-600 dark:border-slate-700 dark:bg-slate-900 dark:text-gray-300">
                                    Font family
                                    <select value={selectedStyle.fontFamily} onChange={event => updateStyle('fontFamily', event.target.value as TemplateStyle['fontFamily'])} className="mt-2 w-full rounded-md border border-gray-300 bg-white px-2.5 py-2 text-sm font-normal text-gray-900 dark:border-slate-600 dark:bg-slate-800 dark:text-white">
                                        <option value="Arial">Arial</option>
                                        <option value="Georgia">Georgia</option>
                                        <option value="Trebuchet MS">Trebuchet</option>
                                        <option value="Verdana">Verdana</option>
                                    </select>
                                </label>
                            </div>
                            <div className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-end">
                                <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300">Template name<input value={templateName} onChange={event => { setTemplateName(event.target.value); setTemplateSaveStatus('Unsaved template changes'); }} placeholder={`${selectedStyle.name} Custom`} maxLength={120} className="mt-1.5 w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm font-normal text-gray-900 outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-200 dark:border-slate-600 dark:bg-slate-900 dark:text-white" /></label>
                                <Button type="button" onClick={() => saveReusableTemplate(false)} disabled={isSavingTemplate} isLoading={isSavingTemplate}>{selectedSavedTemplate ? 'Update Template' : 'Save Template'}</Button>
                                {selectedSavedTemplate && <Button type="button" variant="secondary" onClick={() => saveReusableTemplate(true)} disabled={isSavingTemplate}>Save Copy</Button>}
                            </div>
                        </div>

                        <div className="rounded-xl border border-gray-200 p-4 dark:border-slate-700">
                            <div className="flex items-center justify-between gap-3">
                                <div><p className="text-sm font-semibold text-gray-800 dark:text-gray-100">Logo</p><p className="text-xs text-gray-500 dark:text-gray-400">Uses the selected business unit logo when available.</p></div>
                                <button type="button" onClick={() => logoInputRef.current?.click()} className="rounded-lg border border-gray-300 px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50 dark:border-slate-600 dark:text-gray-200 dark:hover:bg-slate-800">{isUploading === 'logo' ? 'Uploading…' : 'Upload logo'}</button>
                                <input ref={logoInputRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={event => { const file = event.target.files?.[0]; if (file) uploadAsset(file, 'logo'); event.currentTarget.value = ''; }} />
                            </div>
                            <div className="mt-3 flex h-20 items-center justify-center overflow-hidden rounded-lg bg-gray-50 p-2 dark:bg-slate-900">
                                {logoUrl ? <img src={logoUrl} alt="Selected business unit logo" className="max-h-full max-w-[230px] object-contain" /> : <span className="text-center text-sm font-black uppercase tracking-[0.16em] text-gray-500 dark:text-gray-400">{brandWordmark}</span>}
                            </div>
                            {logoSource === 'custom' && <button type="button" onClick={() => { setLogoSource('auto'); setLogoUrl(selectedBrandAsset.logoUrl); }} className="mt-2 text-xs font-semibold text-teal-700 hover:underline dark:text-teal-300">Use business-unit logo instead</button>}
                        </div>

                        <div className="grid gap-4 sm:grid-cols-2">
                            <label className="block text-sm font-semibold text-gray-700 dark:text-gray-200">Headline<input value={headline} onChange={event => setHeadline(event.target.value)} placeholder="WE ARE HIRING" className="mt-1.5 w-full rounded-lg border border-gray-300 px-3 py-2.5 font-normal text-gray-900 outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-200 dark:border-slate-600 dark:bg-slate-900 dark:text-white" /></label>
                            <label className="block text-sm font-semibold text-gray-700 dark:text-gray-200">Contact / CTA line<input value={ctaLine} onChange={event => { ctaEditedRef.current = true; setCtaLine(event.target.value); }} placeholder="Send your CV to: careers@example.com" className="mt-1.5 w-full rounded-lg border border-gray-300 px-3 py-2.5 font-normal text-gray-900 outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-200 dark:border-slate-600 dark:bg-slate-900 dark:text-white" /></label>
                        </div>
                        <label className="block text-sm font-semibold text-gray-700 dark:text-gray-200">Optional subject line<span className="ml-2 text-xs font-normal text-gray-500">Use [POSITION] to insert the role name</span><input value={subjectLine} onChange={event => setSubjectLine(event.target.value)} placeholder="Subject: [POSITION] - [FULL NAME]" className="mt-1.5 w-full rounded-lg border border-gray-300 px-3 py-2.5 font-normal text-gray-900 outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-200 dark:border-slate-600 dark:bg-slate-900 dark:text-white" /></label>

                        <div className="rounded-xl border border-gray-200 p-4 dark:border-slate-700">
                            <div className="flex flex-wrap items-start justify-between gap-3">
                                <div><p className="text-sm font-semibold text-gray-800 dark:text-gray-100">Background</p><p className="text-xs text-gray-500 dark:text-gray-400">Use the saved business-unit/template background or upload one for this batch.</p></div>
                                <button type="button" onClick={() => backgroundInputRef.current?.click()} className="rounded-lg border border-gray-300 px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50 dark:border-slate-600 dark:text-gray-200 dark:hover:bg-slate-800">{isUploading === 'background' ? 'Uploading…' : 'Upload background'}</button>
                                <input ref={backgroundInputRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={event => { const file = event.target.files?.[0]; if (file) uploadAsset(file, 'background'); event.currentTarget.value = ''; }} />
                            </div>
                            <div className="mt-3 grid gap-3 sm:grid-cols-[minmax(0,1fr)_132px]">
                                <select value={backgroundSelection} onChange={event => setBackgroundSelection(event.target.value)} className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-900 outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-200 dark:border-slate-600 dark:bg-slate-900 dark:text-white">
                                    <option value="template">Template / business-unit default</option>
                                    {backgroundHistory.map(asset => <option key={asset.id} value={asset.url}>{asset.name}</option>)}
                                </select>
                                <div className="h-24 overflow-hidden rounded-lg border border-gray-200 dark:border-slate-700" style={{ backgroundColor: selectedStyle.backgroundColor }}>{activeBackgroundPreview && <img src={activeBackgroundPreview} alt="Background preview" className={`h-full w-full ${backgroundFit === 'contain' ? 'object-contain' : backgroundFit === 'fill' ? 'object-fill' : 'object-cover'}`} />}</div>
                            </div>
                            <div className="mt-4 grid gap-4 sm:grid-cols-2">
                                <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Image fit<select value={backgroundFit} onChange={event => setBackgroundFit(event.target.value as 'cover' | 'contain' | 'fill')} className="mt-1.5 w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm font-normal normal-case tracking-normal text-gray-900 dark:border-slate-600 dark:bg-slate-900 dark:text-white"><option value="cover">Cover / crop</option><option value="contain">Contain / letterbox</option><option value="fill">Stretch to square</option></select></label>
                                <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Overlay opacity<span className="ml-2 normal-case tracking-normal">{Math.round(overlayOpacity * 100)}%</span><input type="range" min="0" max="0.65" step="0.01" value={overlayOpacity} onChange={event => setOverlayOpacity(Number(event.target.value))} className="mt-3 w-full accent-teal-600" /></label>
                            </div>
                            <label className="mt-3 flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300"><input type="checkbox" checked={contrastHelper} onChange={event => setContrastHelper(event.target.checked)} className="h-4 w-4 rounded border-gray-300 text-teal-600 focus:ring-teal-500" />Add a subtle contrast helper overlay</label>
                        </div>

                        <div>
                            <div className="mb-3 flex items-center justify-between gap-3"><div><p className="text-sm font-semibold text-gray-800 dark:text-gray-100">Positions</p><p className="text-xs text-gray-500 dark:text-gray-400">Only filled positions generate images.</p></div><span className="rounded-full bg-teal-50 px-2.5 py-1 text-xs font-semibold text-teal-700 dark:bg-teal-900/30 dark:text-teal-300">{filledCount} / {MAX_POSITIONS} filled</span></div>
                            <div className="grid gap-x-4 gap-y-2 sm:grid-cols-2">
                                {positions.map((position, index) => <label key={index} className="flex items-center gap-2 text-xs font-semibold text-gray-500 dark:text-gray-400"><span className="w-5 text-right">{index + 1}</span><input value={position} onChange={event => updatePosition(index, event.target.value)} placeholder="Enter position" className="min-w-0 flex-1 rounded-lg border border-gray-300 px-3 py-2.5 text-sm font-normal text-gray-900 outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-200 dark:border-slate-600 dark:bg-slate-900 dark:text-white" /></label>)}
                            </div>
                        </div>

                        <div className="flex flex-col gap-3 border-t border-gray-200 pt-4 dark:border-slate-700 sm:flex-row sm:items-center">
                            <label className="block flex-1 text-sm font-semibold text-gray-700 dark:text-gray-200">Output size<select disabled value="1080" className="mt-1.5 w-full rounded-lg border border-gray-300 bg-gray-50 px-3 py-2.5 text-sm font-normal text-gray-700 dark:border-slate-600 dark:bg-slate-800 dark:text-gray-300"><option value="1080">Social Media Square (1080 × 1080)</option></select></label>
                            <div className="flex flex-wrap gap-2 sm:pt-5"><Button onClick={() => drawPosts(filledPositions, 'all')} disabled={isGenerating || !filledCount} isLoading={isGenerating}>Generate All</Button><Button variant="secondary" onClick={handleDownloadAll} disabled={isGenerating || !filledCount || !generatedPosts.length}>Download All</Button><Button variant="secondary" onClick={() => drawPosts(filledPositions.slice(0, 3), 'preview')} disabled={isGenerating || !filledCount}>Preview</Button></div>
                        </div>
                        {generationError && <p role="alert" className="text-sm font-medium text-red-600 dark:text-red-300">{generationError}</p>}
                        {generationNotice && <p role="status" className="text-sm text-gray-500 dark:text-gray-400">{generationNotice}</p>}
                    </div>
                </Card>

                <Card className="!p-0 xl:sticky xl:top-6">
                    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 p-5 dark:border-slate-700"><div><h2 className="text-lg font-bold text-gray-900 dark:text-white">Preview ({Math.min(generatedPosts.length, 3)} of {filledCount})</h2><p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Every filled position becomes its own posting-ready square image.</p></div>{filledCount > 3 && <button type="button" onClick={() => { if (!showAllPosts) drawPosts(filledPositions, 'all'); else setShowAllPosts(false); }} className="text-sm font-semibold text-teal-700 hover:underline dark:text-teal-300">{showAllPosts ? 'Show first 3' : `View all ${filledCount} generated`}</button>}</div>
                    <div className="p-5">
                        {!filledCount ? <div className="flex min-h-[440px] items-center justify-center rounded-xl border border-dashed border-gray-300 bg-gray-50 p-8 text-center text-sm text-gray-500 dark:border-slate-700 dark:bg-slate-900/60 dark:text-gray-400">Enter one or more positions on the left to see your live preview.</div> : displayedPosts.length === 0 || isGenerating ? <div className="flex min-h-[440px] items-center justify-center rounded-xl border border-dashed border-gray-300 bg-gray-50 p-8 text-center text-sm text-gray-500 dark:border-slate-700 dark:bg-slate-900/60 dark:text-gray-400">{isGenerating ? 'Rendering branded images…' : 'Preparing preview…'}</div> : <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{displayedPosts.map(post => <div key={post.id} className="group relative overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900"><img src={post.dataUrl} alt={`Generated hiring post for ${post.position}`} className="aspect-square w-full object-cover" /><div className="flex items-center justify-between gap-2 p-3"><span className="truncate text-sm font-semibold text-gray-800 dark:text-gray-100">{post.position}</span><button type="button" onClick={() => downloadPost(post)} className="shrink-0 rounded-lg bg-teal-50 px-2.5 py-1.5 text-xs font-semibold text-teal-700 hover:bg-teal-100 dark:bg-teal-900/30 dark:text-teal-300" aria-label={`Download ${post.position}`}>Download</button></div></div>)}</div>}
                        <div className="mt-5 flex items-center gap-3 rounded-xl border border-teal-100 bg-teal-50/70 p-4 text-sm text-teal-800 dark:border-teal-900/50 dark:bg-teal-950/20 dark:text-teal-200"><svg className="h-5 w-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M13 16h-1v-4h-1m1-4h.01M12 21a9 9 0 100-18 9 9 0 000 18z" /></svg><span>One click. Multiple posts. The exported files are fixed at 1080 × 1080 for Facebook, Instagram, and LinkedIn.</span></div>
                    </div>
                </Card>
            </div>
        </div>
    );
};

export default JobSocialMediaPostGenerator;
