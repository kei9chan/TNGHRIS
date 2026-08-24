import React from 'react';
import { AwardDesign } from '../../types';
import { AwardBadgeIcon, getAwardBrandTheme } from './AwardVisualSystem';

interface CertificateRendererProps {
    design: AwardDesign;
    data: {
        employeeName: string;
        date: Date;
        awardTitle: string;
        citation?: string;
        position?: string;
        department?: string;
        businessUnit?: string;
        issuerName?: string;
        issuerTitle?: string;
        awardValue?: string;
    };
    scale?: number;
}

const formatDate = (date: Date) => date.toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' });

export const renderAwardTemplateText = (text: string, data: CertificateRendererProps['data']) => {
    const values: Record<string, string> = {
        employee_name: data.employeeName,
        date: formatDate(data.date),
        award_date: formatDate(data.date),
        award_title: data.awardTitle,
        citation: data.citation || '',
        reason: data.citation || '',
        award_reason: data.citation || '',
        position: data.position || '',
        department: data.department || '',
        business_unit: data.businessUnit || '',
        issuer_name: data.issuerName || '',
        issuer_title: data.issuerTitle || '',
        signatory_name: data.issuerName || '',
        signatory_title: data.issuerTitle || '',
        award_value: data.awardValue || '',
    };
    let rendered = (text || '').replace(/\\n/g, '\n');
    Object.entries(values).forEach(([key, value]) => {
        rendered = rendered
            .replace(new RegExp(`{{${key}}}`, 'g'), value)
            .replace(new RegExp(`{${key}}`, 'g'), value);
    });
    return rendered.replace(/\n{3,}/g, '\n\n').trim();
};

const LegacyCertificate: React.FC<CertificateRendererProps> = ({ design, data }) => {
    const containerStyle: React.CSSProperties = {
        width: '1000px', height: '700px', backgroundColor: design.backgroundColor,
        backgroundImage: design.backgroundImageUrl ? `url(${design.backgroundImageUrl})` : 'none',
        backgroundSize: 'cover', backgroundPosition: 'center', border: `${design.borderWidth}px solid ${design.borderColor}`,
        fontFamily: design.fontFamily, color: design.textColor, position: 'relative', display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', padding: '60px', boxSizing: 'border-box', overflow: 'hidden',
    };
    return (
        <div style={containerStyle} data-certificate-page="true">
            {design.logoUrl && <img src={design.logoUrl} alt="Logo" crossOrigin="anonymous" style={{ height: '100px', marginBottom: '20px', objectFit: 'contain' }} />}
            <h1 style={{ fontSize: '48px', fontWeight: 700, color: design.titleColor, marginBottom: '20px', textAlign: 'center', textTransform: 'uppercase', letterSpacing: '2px' }}>{design.headerText}</h1>
            <div style={{ fontSize: '24px', textAlign: 'center', whiteSpace: 'pre-wrap', lineHeight: 1.6, maxWidth: '800px', flexGrow: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                {renderAwardTemplateText(design.bodyText, data)}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-around', width: '100%', marginTop: '60px' }}>
                {(design.signatories || []).map((sig, index) => (
                    <div key={`${sig.name}-${index}`} style={{ textAlign: 'center', minWidth: '200px' }}>
                        {sig.signatureUrl && <img src={sig.signatureUrl} alt="Signature" crossOrigin="anonymous" style={{ height: '60px', display: 'block', margin: '0 auto', objectFit: 'contain' }} />}
                        <div style={{ borderTop: `1px solid ${design.textColor}`, marginTop: '5px', paddingTop: '5px', width: '100%' }}>
                            <p style={{ fontWeight: 700, fontSize: '18px', margin: 0 }}>{sig.name}</p>
                            <p style={{ fontSize: '14px', margin: 0 }}>{sig.title}</p>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};

const ModernCertificate: React.FC<CertificateRendererProps> = ({ design, data }) => {
    const orientation = design.orientation || 'portrait';
    const isLandscape = orientation === 'landscape';
    const width = isLandscape ? 1123 : 794;
    const height = isLandscape ? 794 : 1123;
    const theme = getAwardBrandTheme(design.brandName || data.businessUnit);
    const background = design.backgroundColor || theme.background;
    const accent = design.accentColor || theme.accent;
    const secondary = design.secondaryAccentColor || design.borderColor || theme.primary;
    const textColor = design.textColor || theme.text;
    const titleColor = design.titleColor || textColor;
    const body = renderAwardTemplateText(design.bodyText || 'For {{award_reason}}', data);
    const signatories = design.signatories?.length ? design.signatories : [{ name: data.issuerName || 'Authorized Signatory', title: data.issuerTitle || 'Management' }];
    const dark = ['#111318', '#111827', '#000000'].includes(background.toLowerCase());

    return (
        <div data-certificate-page="true" data-orientation={orientation} style={{
            width, height, background, color: textColor, fontFamily: design.fontFamily || 'Inter, ui-sans-serif, system-ui, sans-serif',
            position: 'relative', overflow: 'hidden', boxSizing: 'border-box', display: 'flex', flexDirection: 'column',
            padding: isLandscape ? '72px 82px 64px 118px' : '86px 70px 72px 104px',
        }}>
            <div style={{ position: 'absolute', inset: '0 auto 0 0', width: isLandscape ? 30 : 36, background: accent }} />
            <div style={{ position: 'absolute', right: -85, top: -85, width: 210, height: 210, borderRadius: '50%', background: secondary, opacity: dark ? 0.28 : 0.12 }} />
            <div style={{ position: 'absolute', left: isLandscape ? 30 : 36, bottom: 0, width: isLandscape ? 190 : 150, height: isLandscape ? 20 : 24, background: secondary }} />
            <div style={{ position: 'absolute', right: 55, bottom: 48, display: 'grid', gridTemplateColumns: 'repeat(3, 6px)', gap: 8, opacity: 0.7 }}>
                {Array.from({ length: 9 }).map((_, index) => <span key={index} style={{ width: 6, height: 6, borderRadius: '50%', background: index % 2 ? secondary : accent }} />)}
            </div>
            <header style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 32 }}>
                <div>
                    {design.logoUrl ? <img src={design.logoUrl} alt="Business unit logo" crossOrigin="anonymous" style={{ maxHeight: 78, maxWidth: 250, objectFit: 'contain', objectPosition: 'left top' }} /> : (
                        <div style={{ color: titleColor, whiteSpace: 'pre-line', fontWeight: 850, fontSize: isLandscape ? 30 : 34, lineHeight: 0.92, letterSpacing: '0.025em' }}>{design.wordmarkText || theme.wordmark}</div>
                    )}
                    <div style={{ marginTop: 15, width: 52, height: 3, background: accent }} />
                </div>
                <div style={{ width: 72, height: 72, borderRadius: '50%', border: `2px solid ${accent}`, color: accent, display: 'grid', placeItems: 'center' }}>
                    <AwardBadgeIcon badgeKey={design.badgeKey} className="h-9 w-9" />
                </div>
            </header>
            <main style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', maxWidth: isLandscape ? 810 : 610, paddingTop: 44, paddingBottom: 30 }}>
                <p style={{ margin: 0, color: accent, fontSize: 13, fontWeight: 750, letterSpacing: '0.24em', textTransform: 'uppercase' }}>Certificate of recognition</p>
                <h1 style={{ margin: '22px 0 0', color: titleColor, fontSize: isLandscape ? 48 : 50, lineHeight: 1.02, letterSpacing: '-0.035em', fontWeight: 850, textTransform: 'uppercase' }}>{design.headerText || data.awardTitle}</h1>
                <p style={{ margin: '54px 0 0', fontSize: 13, fontWeight: 700, letterSpacing: '0.22em', textTransform: 'uppercase', opacity: 0.74 }}>Presented to</p>
                <div style={{ marginTop: 14, fontSize: isLandscape ? 46 : 48, lineHeight: 1.08, fontWeight: 800, letterSpacing: '-0.025em', color: titleColor }}>{data.employeeName}</div>
                {body && <div style={{ marginTop: 24, maxWidth: 650, fontSize: 19, lineHeight: 1.55, whiteSpace: 'pre-line', opacity: 0.88 }}>{body}</div>}
                {data.awardValue && <div style={{ marginTop: 18, color: accent, fontSize: 16, fontWeight: 700 }}>{data.awardValue}</div>}
            </main>
            <footer style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 32, paddingRight: 50 }}>
                <div><p style={{ margin: 0, fontSize: 12, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', opacity: 0.62 }}>Awarded on</p><p style={{ margin: '7px 0 0', fontSize: 17, fontWeight: 650 }}>{formatDate(data.date)}</p></div>
                <div style={{ display: 'flex', gap: 28 }}>
                    {signatories.slice(0, 2).map((sig, index) => (
                        <div key={`${sig.name}-${index}`} style={{ width: 185, textAlign: 'left' }}>
                            {sig.signatureUrl && <img src={sig.signatureUrl} alt="Signature" crossOrigin="anonymous" style={{ height: 46, maxWidth: 170, objectFit: 'contain', objectPosition: 'left bottom' }} />}
                            <div style={{ borderTop: `1px solid ${dark ? 'rgba(255,255,255,.56)' : 'rgba(17,24,39,.42)'}`, paddingTop: 8 }}><p style={{ margin: 0, fontSize: 14, fontWeight: 750 }}>{sig.name}</p><p style={{ margin: '3px 0 0', fontSize: 11, opacity: 0.7 }}>{sig.title}</p></div>
                        </div>
                    ))}
                </div>
            </footer>
        </div>
    );
};

const CertificateRenderer: React.FC<CertificateRendererProps> = props => props.design.layoutVersion === 'modern-v2' ? <ModernCertificate {...props} /> : <LegacyCertificate {...props} />;

export default CertificateRenderer;
