import type { OfferPackageDocument, OfferPackageDocumentType } from '../types';

const PACKAGE_DOCUMENT_TYPES: OfferPackageDocumentType[] = [
  'Resume',
  'Interview Rating',
  'Offer',
  'Other Supporting Document',
];

export const CANDIDATE_DOCUMENT_MIME_BY_EXTENSION: Record<string, string> = {
  pdf: 'application/pdf',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
};

export const normalizeOfferPackageDocumentType = (value: unknown): OfferPackageDocumentType => {
  const normalized = String(value || '').trim().toLowerCase();
  return PACKAGE_DOCUMENT_TYPES.find(type => type.toLowerCase() === normalized) || 'Other Supporting Document';
};

export const resolveCandidateDocumentMimeType = (file: Pick<File, 'name' | 'type'>): string => {
  const extension = file.name.split('.').pop()?.toLowerCase() || '';
  const extensionMimeType = CANDIDATE_DOCUMENT_MIME_BY_EXTENSION[extension];
  if (!extensionMimeType) throw new Error('Upload a PDF, JPG, PNG, DOC, or DOCX document.');

  const suppliedMimeType = String(file.type || '').trim().toLowerCase();
  if (!suppliedMimeType || suppliedMimeType === 'application/octet-stream') return extensionMimeType;
  const allowedMimeTypes = new Set(Object.values(CANDIDATE_DOCUMENT_MIME_BY_EXTENSION));
  if (!allowedMimeTypes.has(suppliedMimeType)) {
    throw new Error('The selected file type does not match a supported candidate document.');
  }
  if (suppliedMimeType !== extensionMimeType) {
    throw new Error('The document extension and MIME type do not match.');
  }
  return suppliedMimeType;
};

export interface SupabaseStorageLocation {
  bucket: string;
  path: string;
}

export const parseSupabaseStorageUrl = (value?: string): SupabaseStorageLocation | null => {
  if (!value) return null;
  try {
    const url = new URL(value);
    const marker = '/storage/v1/object/';
    const markerIndex = url.pathname.indexOf(marker);
    if (markerIndex < 0) return null;
    const parts = url.pathname.slice(markerIndex + marker.length).split('/');
    if (!['sign', 'public', 'authenticated'].includes(parts[0]) || parts.length < 3) return null;
    return {
      bucket: decodeURIComponent(parts[1]),
      path: parts.slice(2).map(part => decodeURIComponent(part)).join('/'),
    };
  } catch {
    return null;
  }
};

/**
 * Older application forms stored an object path such as `resumes/file.pdf` in
 * resume_url instead of filling resume_file_path. Treat only that known prefix
 * as a private recruitment-uploads object; normal web links stay external.
 */
export const resolveRecruitmentResumeStorageLocation = (value?: string): SupabaseStorageLocation | null => {
  const parsed = parseSupabaseStorageUrl(value);
  if (parsed) return parsed;

  const normalized = String(value || '').trim().replace(/^\/+/, '');
  if (!normalized.toLowerCase().startsWith('resumes/')) return null;
  return { bucket: 'recruitment-uploads', path: normalized };
};

const packageDocumentIdentity = (document: OfferPackageDocument): string => {
  if (document.storageBucket && document.storagePath) {
    return `storage:${document.storageBucket}:${document.storagePath}`.toLowerCase();
  }
  if (document.externalUrl) return `url:${document.externalUrl.trim()}`.toLowerCase();
  return `${document.source}:${document.sourceId}`.toLowerCase();
};

export const dedupeOfferPackageDocuments = (documents: OfferPackageDocument[]): OfferPackageDocument[] => {
  const seenIds = new Set<string>();
  const seenFiles = new Set<string>();
  return documents.filter(document => {
    const recordIdentity = `${document.source}:${document.sourceId}`.toLowerCase();
    const fileIdentity = packageDocumentIdentity(document);
    if (seenIds.has(recordIdentity) || seenFiles.has(fileIdentity)) return false;
    seenIds.add(recordIdentity);
    seenFiles.add(fileIdentity);
    return true;
  });
};

export const getDefaultOfferPackageDocumentIds = (documents: OfferPackageDocument[]): string[] => {
  const selectable = documents.filter(document => document.isSelectable !== false);
  const resume = selectable.find(document => document.documentType === 'Resume');
  const offer = selectable.find(document => document.source === 'offer')
    || selectable.find(document => document.documentType === 'Offer');
  const digitalRatings = selectable.filter(document => document.documentType === 'Interview Rating' && document.source === 'rating');
  const ratings = digitalRatings.length > 0
    ? digitalRatings
    : selectable.filter(document => document.documentType === 'Interview Rating');
  return Array.from(new Set([
    ...(resume ? [resume.id] : []),
    ...ratings.map(document => document.id),
    ...(offer ? [offer.id] : []),
  ]));
};
