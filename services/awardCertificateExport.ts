import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';

export type CertificateOrientation = 'portrait' | 'landscape';

const waitForImages = async (element: HTMLElement) => {
  const images = Array.from(element.querySelectorAll('img'));
  await Promise.all(images.map(image => image.complete ? Promise.resolve() : new Promise<void>(resolve => {
    image.addEventListener('load', () => resolve(), { once: true });
    image.addEventListener('error', () => resolve(), { once: true });
  })));
};

export const captureCertificatePng = async (host: HTMLElement): Promise<string> => {
  const source = (host.matches('[data-certificate-page]') ? host : host.querySelector('[data-certificate-page]')) as HTMLElement | null;
  if (!source) throw new Error('Certificate preview is not ready.');
  const clone = source.cloneNode(true) as HTMLElement;
  clone.style.position = 'fixed';
  clone.style.left = '-12000px';
  clone.style.top = '0';
  clone.style.transform = 'none';
  clone.style.transformOrigin = 'top left';
  document.body.appendChild(clone);
  try {
    await waitForImages(clone);
    const canvas = await html2canvas(clone, { scale: 2, useCORS: true, backgroundColor: null, logging: false });
    if (!canvas.width || !canvas.height) throw new Error('Certificate rendering returned a blank page.');
    return canvas.toDataURL('image/png', 1);
  } finally {
    clone.remove();
  }
};

export const downloadCertificatePdf = (imageData: string, fileName: string, orientation: CertificateOrientation = 'portrait') => {
  const pdf = new jsPDF({ orientation, unit: 'mm', format: 'a4', compress: true });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  pdf.addImage(imageData, 'PNG', 0, 0, pageWidth, pageHeight, undefined, 'FAST');
  pdf.save(fileName.endsWith('.pdf') ? fileName : `${fileName}.pdf`);
};

export const printCertificateImage = (imageData: string, orientation: CertificateOrientation = 'portrait') => {
  const printWindow = window.open('', '_blank', 'noopener,noreferrer');
  if (!printWindow) throw new Error('Allow pop-ups to print the certificate.');
  printWindow.document.write(`<!doctype html><html><head><title>Award certificate</title><style>@page{size:A4 ${orientation};margin:0}html,body{margin:0;width:100%;height:100%}img{display:block;width:100%;height:100%;object-fit:fill}</style></head><body><img src="${imageData}" alt="Award certificate" onload="window.print();window.close()"></body></html>`);
  printWindow.document.close();
};
