
import React from 'react';
import { AwardDesign } from '../../types';

interface CertificateRendererProps {
    design: AwardDesign;
    data: {
        employeeName: string;
        date: Date;
        awardTitle: string;
        citation?: string;
    };
    scale?: number;
}

const CertificateRenderer: React.FC<CertificateRendererProps> = ({ design, data, scale = 1 }) => {
    const containerStyle: React.CSSProperties = {
        width: '1000px',
        height: '700px', // roughly A4 landscape ratio
        backgroundColor: design.backgroundColor,
        backgroundImage: design.backgroundImageUrl ? `url(${design.backgroundImageUrl})` : 'none',
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        border: `${design.borderWidth}px solid ${design.borderColor}`,
        fontFamily: design.fontFamily,
        color: design.textColor,
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '60px',
        boxSizing: 'border-box',
        transform: `scale(${scale})`,
        transformOrigin: 'top left',
        overflow: 'hidden' // Ensure content doesn't spill out during scaling
    };

    const processText = (text: string) => {
        return text
            .replace(/{{employee_name}}/g, data.employeeName)
            .replace(/{{date}}/g, data.date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }))
            .replace(/{{award_title}}/g, data.awardTitle)
            .replace(/{{citation}}/g, data.citation || '');
    };

    return (
        <div style={containerStyle} id="certificate-container">
            {design.logoUrl && (
                <img src={design.logoUrl} alt="Logo" style={{ height: '100px', marginBottom: '20px' }} />
            )}
            
            <h1 style={{ 
                fontSize: '48px', 
                fontWeight: 'bold', 
                color: design.titleColor, 
                marginBottom: '20px',
                textAlign: 'center',
                textTransform: 'uppercase',
                letterSpacing: '2px'
            }}>
                {design.headerText}
            </h1>

            <div style={{ 
                fontSize: '24px', 
                textAlign: 'center', 
                whiteSpace: 'pre-wrap',
                lineHeight: '1.6',
                maxWidth: '800px',
                flexGrow: 1,
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center'
            }}>
                {processText(design.bodyText)}
            </div>

            <div style={{ 
                display: 'flex', 
                justifyContent: 'space-around', 
                width: '100%', 
                marginTop: '60px' 
            }}>
                {design.signatories.map((sig, index) => (
                    <div key={index} style={{ textAlign: 'center', minWidth: '200px' }}>
                        {sig.signatureUrl && (
                            <img src={sig.signatureUrl} alt="Signature" style={{ height: '60px', display: 'block', margin: '0 auto' }} />
                        )}
                        <div style={{ borderTop: `1px solid ${design.textColor}`, marginTop: '5px', paddingTop: '5px', width: '100%' }}>
                            <p style={{ fontWeight: 'bold', fontSize: '18px', margin: 0 }}>{sig.name}</p>
                            <p style={{ fontSize: '14px', margin: 0 }}>{sig.title}</p>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};

export default CertificateRenderer;
