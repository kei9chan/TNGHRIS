import type { Application } from '../types';

export type ApplicantDocumentLink = { label: string; url: string };
export function applicantDocumentLinks(applications: Application[], portfolio: string | undefined, linkedin: string | undefined, publicResumeUrl: (path: string) => string): ApplicantDocumentLink[] {
  const links = new Map<string, ApplicantDocumentLink>();
  const add = (value: string | undefined, label: string) => {
    if (!value?.trim()) return;
    const path = value.trim().replace(/^\/+/, '');
    const isResumePath = path.startsWith('resumes/') && !path.split('/').some(part => !part || part === '.' || part === '..');
    try {
      const url = new URL(isResumePath ? publicResumeUrl(path) : value.trim());
      if (url.protocol !== 'https:' && url.protocol !== 'http:') return;
      if (!links.has(url.href)) links.set(url.href, { label, url: url.href });
    } catch { /* An invalid historical value is not a clickable link. */ }
  };
  for (const application of applications) {
    add(application.resumeFilePath, 'Uploaded resume');
    add(application.resumeFileUrl, 'Uploaded resume');
    add(application.resumeLink, 'Resume link');
    add(application.resumeUrl, 'Resume');
  }
  add(portfolio, 'Portfolio / supporting link');
  add(linkedin, 'LinkedIn / portfolio');
  return [...links.values()];
}
