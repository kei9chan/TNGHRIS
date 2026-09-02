import React, { forwardRef, useMemo } from 'react';
import { COEEmployeeSnapshot, COERequest, COETemplate } from '../../types';
import { DEFAULT_COE_LAYOUT, renderCoeBody } from '../../services/coeDocument';

type COEDocumentPreviewProps = {
  template: COETemplate;
  request: COERequest;
  employee: COEEmployeeSnapshot;
  currency?: string;
  showSystemFooter?: boolean;
  bodyHtml?: string;
  bodyEditable?: boolean;
  onBodyInput?: (html: string) => void;
};

const COEDocumentPreview = forwardRef<HTMLDivElement, COEDocumentPreviewProps>(({
  template,
  request,
  employee,
  currency = 'PHP',
  showSystemFooter = true,
  bodyHtml,
  bodyEditable = false,
  onBodyInput,
}, ref) => {
  const layout = { ...DEFAULT_COE_LAYOUT, ...(template.layoutSettings || {}) };
  const renderedBody = useMemo(
    () => renderCoeBody(template, request, employee, currency),
    [template, request, employee, currency],
  );
  const body = bodyHtml ?? renderedBody;
  const primary = template.primaryColor || '#1e3a8a';
  const accent = template.accentColor || '#64748b';
  const styleKey = template.styleKey || 'classic-corporate';
  const logoJustify = layout.logoAlignment === 'left'
    ? 'flex-start'
    : layout.logoAlignment === 'right' ? 'flex-end' : 'center';

  return (
    <div
      ref={ref}
      data-coe-document
      className="relative overflow-hidden bg-white text-slate-950"
      style={{
        width: '210mm',
        minHeight: '297mm',
        fontFamily: template.fontFamily || 'Times New Roman',
        padding: `${layout.marginTopMm}mm ${layout.marginRightMm}mm ${layout.marginBottomMm}mm ${layout.marginLeftMm}mm`,
        boxSizing: 'border-box',
      }}
    >
      {styleKey === 'branded-accent' && (
        <>
          <div className="absolute left-0 top-0 h-full w-[7mm]" style={{ backgroundColor: primary }} />
          <div className="absolute right-0 top-0 h-[34mm] w-[34mm] rounded-bl-full opacity-80" style={{ backgroundColor: accent }} />
        </>
      )}
      {styleKey === 'business-unit-signature' && (
        <div className="absolute inset-x-0 top-0 h-[8mm]" style={{ backgroundColor: primary }} />
      )}

      <header
        className={`relative ${styleKey === 'modern-minimal' ? 'border-b pb-5' : 'pb-7'}`}
        style={{ borderColor: accent }}
      >
        <div className="flex" style={{ justifyContent: logoJustify }}>
          {template.logoUrl ? (
            <img
              src={template.logoUrl}
              alt={`${template.businessUnitName || employee.businessUnit} logo`}
              className="max-w-[70mm] object-contain"
              style={{ height: `${layout.logoHeightMm}mm` }}
            />
          ) : (
            <div className="text-lg font-bold tracking-wide" style={{ color: primary }}>
              {template.businessUnitName || employee.businessUnit}
            </div>
          )}
        </div>
        {(template.businessUnitName || employee.businessUnit) && template.logoUrl && (
          <p className={`mt-2 text-[11pt] font-semibold ${layout.logoAlignment === 'center' ? 'text-center' : ''}`} style={{ color: primary }}>
            {template.businessUnitName || employee.businessUnit}
          </p>
        )}
        {template.address && (
          <p className={`mt-1 text-[8.5pt] text-slate-500 ${layout.logoAlignment === 'center' ? 'text-center' : ''}`}>
            {template.address}
          </p>
        )}
      </header>

      <main className="relative pb-[48mm]">
        <h1
          className={`${styleKey === 'modern-minimal' ? 'mt-8 text-left' : 'mt-10 text-center'} text-[19pt] font-bold uppercase tracking-[0.14em]`}
          style={{ color: styleKey === 'classic-corporate' ? '#111827' : primary }}
        >
          {template.documentTitle || 'Certificate of Employment'}
        </h1>

        <div
          className={`coe-rich-body mt-10 text-[11.5pt] [&_p]:mb-5 [&_strong]:font-bold ${bodyEditable ? 'rounded-md ring-2 ring-indigo-400 ring-offset-4' : ''}`}
          style={{ lineHeight: layout.lineHeight, textAlign: layout.textAlignment }}
          contentEditable={bodyEditable}
          suppressContentEditableWarning={bodyEditable}
          onInput={bodyEditable ? event => onBodyInput?.(event.currentTarget.innerHTML) : undefined}
          dangerouslySetInnerHTML={{ __html: body }}
        />

        <section className="mt-14 flex justify-end">
          <div className="w-[72mm] text-center">
            {template.signatureUrl && (
              <img src={template.signatureUrl} alt="Authorized signature" className="mx-auto h-[18mm] max-w-[60mm] object-contain" />
            )}
            <div className={`${template.signatureUrl ? '-mt-1' : 'mt-[18mm]'} border-b`} style={{ borderColor: primary }} />
            <p className="mt-2 text-[10.5pt] font-bold uppercase">{template.signatoryName}</p>
            <p className="text-[9.5pt] text-slate-600">{template.signatoryPosition}</p>
          </div>
        </section>
      </main>

      <footer className="absolute bottom-[10mm] left-[20mm] right-[20mm] text-center text-[7.5pt] text-slate-500">
        <div className="mb-2 h-[1.5px] w-full" style={{ backgroundColor: styleKey === 'classic-corporate' ? '#cbd5e1' : primary }} />
        {template.footerText && <p>{template.footerText}</p>}
        {showSystemFooter && <p>Generated by TNG HRIS · Request ID: {request.id}</p>}
      </footer>
    </div>
  );
});

COEDocumentPreview.displayName = 'COEDocumentPreview';

export default COEDocumentPreview;
