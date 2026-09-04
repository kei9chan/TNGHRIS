import { supabase } from './supabaseClient';
import {
  Application,
  ApplicationStage,
  Candidate,
  InterviewRatingAttachment,
  InterviewRatingRecord,
  Offer,
  OfferApprovalRequestSummary,
  OfferApprovalStatus,
  OfferApprovalTrailEntry,
  OfferBuilderDetails,
  OfferPackageDocument,
  OfferPackageDocumentType,
} from '../types';
import {
  fetchInterviewRating,
  fetchInterviewRatingAttachments,
  getInterviewRatingAttachmentUrl,
  isInterviewRatingSubmitted,
  mapInterviewRatingAttachment,
  mapInterviewRatingRecord,
  downloadInterviewRatingPdf,
} from './interviewRatingService';
import { createInterviewRatingSummary } from './interviewRatingSummary';
import { downloadOfferPdf } from '../components/recruitment/offerPdf';
import { mapJobOfferRow } from './jobOfferMapper';
import {
  CANDIDATE_DOCUMENT_MIME_BY_EXTENSION,
  dedupeOfferPackageDocuments,
  getDefaultOfferPackageDocumentIds,
  normalizeOfferPackageDocumentType,
  parseSupabaseStorageUrl,
  resolveRecruitmentResumeStorageLocation,
  resolveCandidateDocumentMimeType,
} from './offerApprovalDocuments';

export {
  dedupeOfferPackageDocuments,
  getDefaultOfferPackageDocumentIds,
  normalizeOfferPackageDocumentType,
  parseSupabaseStorageUrl,
  resolveRecruitmentResumeStorageLocation,
  resolveCandidateDocumentMimeType,
} from './offerApprovalDocuments';

export { mapJobOfferRow as mapApprovalOfferRow } from './jobOfferMapper';

export const CANDIDATE_DOCUMENT_BUCKET = 'candidate-recruitment-documents';

export interface OfferApprovalAssignment {
  id: string;
  requestId: string;
  approverUserId: string;
  approverRole: string;
  approvalStage: string;
  status: string;
  assignedAt: Date;
  decidedAt?: Date;
  comments?: string;
}

export interface OfferApprovalPackageData {
  request: OfferApprovalRequestSummary;
  offer: Offer;
  application: Application;
  candidate: Candidate;
  ratings: InterviewRatingRecord[];
  ratingAttachments: InterviewRatingAttachment[];
  candidateDocuments: OfferPackageDocument[];
  assignments: OfferApprovalAssignment[];
  approvalTrail: OfferApprovalTrailEntry[];
}

const dateOrUndefined = (value?: string | null) => value ? new Date(value) : undefined;

export const mapCandidateRow = (row: any): Candidate => ({
  id: row.id,
  firstName: row.first_name || '',
  lastName: row.last_name || '',
  email: row.email || '',
  phone: row.phone || '',
  source: row.source,
  tags: Array.isArray(row.tags) ? row.tags : [],
  portfolioUrl: row.portfolio_url || undefined,
  consentAt: dateOrUndefined(row.consent_at),
  currentCity: row.current_city || undefined,
  currentEmployer: row.current_employer || undefined,
  yearsRelevantExperience: row.years_relevant_experience || undefined,
  earliestStartDate: row.earliest_start_date || undefined,
  linkedinUrl: row.linkedin_url || undefined,
});

export const mapApplicationRow = (row: any): Application => ({
  id: row.id,
  candidateId: row.candidate_id,
  jobPostId: row.job_post_id,
  requisitionId: row.requisition_id,
  stage: row.stage as ApplicationStage,
  ownerUserId: row.owner_user_id || undefined,
  createdAt: new Date(row.created_at || Date.now()),
  updatedAt: new Date(row.updated_at || row.created_at || Date.now()),
  notes: row.notes || row.cover_letter || '',
  referrer: row.referrer || '',
  roleId: row.role_id || undefined,
  roleSlug: row.role_slug || undefined,
  roleTitleSnapshot: row.role_title_snapshot || undefined,
  departmentSnapshot: row.department_snapshot || undefined,
  locationSnapshot: row.location_snapshot || undefined,
  employmentTypeSnapshot: row.employment_type_snapshot || undefined,
  workArrangementSnapshot: row.work_arrangement_snapshot || undefined,
  roleAnswers: row.role_answers || undefined,
  sourceApplicationPage: row.source_application_page || undefined,
  applicationReference: row.application_reference || undefined,
  submissionToken: row.submission_token || undefined,
  resumeLink: row.resume_link || row.resume_url || undefined,
  resumeFileUrl: row.resume_file_url || undefined,
  resumeFilePath: row.resume_file_path || undefined,
  coverLetter: row.cover_letter || undefined,
});

const mapCandidateDocument = (row: any): OfferPackageDocument => ({
  id: row.id,
  candidateId: row.candidate_id,
  applicationId: row.application_id || undefined,
  documentType: normalizeOfferPackageDocumentType(row.document_type),
  fileName: row.file_name,
  mimeType: row.mime_type || 'application/octet-stream',
  source: 'candidate_document',
  sourceId: row.id,
  uploadedAt: dateOrUndefined(row.uploaded_at),
  storageBucket: row.storage_bucket || undefined,
  storagePath: row.storage_path || undefined,
  externalUrl: row.external_url || undefined,
  isSelectable: row.archived_at == null,
  description: row.metadata?.description || undefined,
});

const mapSnapshotDocument = (row: any): OfferPackageDocument => ({
  id: row.id || `${row.source || 'document'}:${row.sourceId || crypto.randomUUID()}`,
  candidateId: row.candidateId || row.candidate_id || '',
  applicationId: row.applicationId || row.application_id || undefined,
  documentType: normalizeOfferPackageDocumentType(row.documentType || row.document_type),
  fileName: row.fileName || row.file_name || 'Package document',
  mimeType: row.mimeType || row.mime_type || 'application/octet-stream',
  source: row.source,
  sourceId: row.sourceId || row.source_id,
  ratingId: row.ratingId || row.rating_id || undefined,
  offerId: row.offerId || row.offer_id || undefined,
  reviewerName: row.reviewerName || row.reviewer_name || undefined,
  reviewerPosition: row.reviewerPosition || row.reviewer_position || undefined,
  storageBucket: row.storageBucket || row.storage_bucket || undefined,
  storagePath: row.storagePath || row.storage_path || undefined,
  externalUrl: row.externalUrl || row.external_url || undefined,
  isSelectable: true,
});

const ratingDocument = (rating: InterviewRatingRecord): OfferPackageDocument => ({
  id: `rating:${rating.id}`,
  candidateId: rating.candidateId,
  applicationId: rating.applicationId,
  documentType: 'Interview Rating',
  fileName: `${rating.reviewerNameSnapshot} · ${rating.interviewRound} · Digital rating.pdf`,
  mimeType: 'application/pdf',
  source: 'rating',
  sourceId: rating.id,
  ratingId: rating.id,
  reviewerName: rating.reviewerNameSnapshot,
  reviewerPosition: rating.reviewerPositionSnapshot,
  uploadedAt: rating.submittedAt || rating.updatedAt,
  status: rating.status,
  isSelectable: isInterviewRatingSubmitted(rating.status),
});

const ratingAttachmentDocument = (rating: InterviewRatingRecord, attachment: InterviewRatingAttachment): OfferPackageDocument => ({
  id: `rating-attachment:${attachment.id}`,
  candidateId: rating.candidateId,
  applicationId: rating.applicationId,
  documentType: 'Interview Rating',
  fileName: attachment.fileName,
  mimeType: attachment.mimeType,
  source: 'rating_attachment',
  sourceId: attachment.id,
  ratingId: rating.id,
  reviewerName: rating.reviewerNameSnapshot,
  reviewerPosition: rating.reviewerPositionSnapshot,
  uploadedAt: attachment.createdAt,
  status: rating.status,
  storageBucket: 'interview-rating-attachments',
  storagePath: attachment.storagePath,
  isSelectable: isInterviewRatingSubmitted(rating.status),
});

export const fetchCandidatePackageDocuments = async (
  candidate: Candidate,
  application: Application,
  offer: Offer,
  ratings: InterviewRatingRecord[],
): Promise<OfferPackageDocument[]> => {
  const submittedRatings = ratings.filter(rating => isInterviewRatingSubmitted(rating.status));
  const [documentResult, applicationResult, attachmentGroups] = await Promise.all([
    supabase
      .from('job_candidate_documents')
      .select('*')
      .eq('candidate_id', candidate.id)
      .is('archived_at', null)
      .order('is_primary', { ascending: false })
      .order('uploaded_at', { ascending: false }),
    supabase
      .from('job_applications')
      .select('id, candidate_id, resume_file_url, resume_file_path, resume_link, resume_url')
      .eq('id', application.id)
      .eq('candidate_id', candidate.id)
      .maybeSingle(),
    Promise.all(submittedRatings.map(async rating => ({
      rating,
      attachments: await fetchInterviewRatingAttachments(rating.id),
    }))),
  ]);
  if (documentResult.error) throw documentResult.error;
  if (applicationResult.error) throw applicationResult.error;

  const documents: OfferPackageDocument[] = [];
  const currentApplication = applicationResult.data;
  const resumeFilePath = currentApplication?.resume_file_path || application.resumeFilePath;
  const resumeUrl = currentApplication?.resume_file_url
    || currentApplication?.resume_link
    || currentApplication?.resume_url
    || application.resumeFileUrl
    || application.resumeLink;
  const resumeStorage = resumeFilePath
    ? { bucket: 'recruitment-uploads', path: resumeFilePath }
    : resolveRecruitmentResumeStorageLocation(resumeUrl);
  if (resumeStorage || resumeUrl) {
    const resumeNameSource = resumeStorage?.path || resumeUrl || '';
    const encodedFileName = resumeNameSource.split('/').pop()?.split('?')[0] || '';
    let resumeFileName = encodedFileName || 'Candidate resume';
    try { resumeFileName = decodeURIComponent(resumeFileName); } catch { /* retain the stored name */ }
    documents.push({
      id: `resume:${application.id}`,
      candidateId: candidate.id,
      applicationId: application.id,
      documentType: 'Resume',
      fileName: resumeFileName,
      mimeType: CANDIDATE_DOCUMENT_MIME_BY_EXTENSION[resumeFileName.split('.').pop()?.toLowerCase() || ''] || 'application/octet-stream',
      source: 'resume',
      sourceId: application.id,
      externalUrl: resumeStorage ? undefined : resumeUrl,
      storageBucket: resumeStorage?.bucket,
      storagePath: resumeStorage?.path,
      isSelectable: true,
    });
  }

  documents.push(...submittedRatings.map(ratingDocument));
  attachmentGroups.forEach(({ rating, attachments }) => documents.push(...attachments.map(attachment => ratingAttachmentDocument(rating, attachment))));

  documents.push({
    id: `offer:${offer.id}`,
    candidateId: candidate.id,
    applicationId: application.id,
    documentType: 'Offer',
    fileName: `${offer.offerNumber || 'Offer'} · Offer PDF`,
    mimeType: 'application/pdf',
    source: 'offer',
    sourceId: offer.id,
    offerId: offer.id,
    isSelectable: true,
  });
  documents.push(...(documentResult.data || []).map(mapCandidateDocument));
  return dedupeOfferPackageDocuments(documents);
};

const beginDocumentPreview = (): Window => {
  const previewWindow = window.open('about:blank', '_blank');
  if (!previewWindow) throw new Error('The document could not be opened. Allow pop-ups and try again.');
  previewWindow.opener = null;
  try { previewWindow.document.title = 'Loading document…'; } catch { /* navigation may already have started */ }
  return previewWindow;
};

const openBlob = (blob: Blob, previewWindow: Window) => {
  const url = URL.createObjectURL(blob);
  previewWindow.location.replace(url);
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
};

const openDocumentUrl = (value: string, previewWindow: Window) => {
  let url: URL;
  try {
    url = new URL(value, window.location.origin);
  } catch {
    throw new Error('The document link is invalid.');
  }
  if (!['https:', 'http:', 'blob:'].includes(url.protocol)) {
    throw new Error('The document link uses an unsupported protocol.');
  }
  previewWindow.location.replace(url.toString());
};

export const openOfferPackageDocument = async (
  document: OfferPackageDocument,
  context: { candidate: Candidate; offer: Offer; ratings: InterviewRatingRecord[] },
): Promise<void> => {
  // Open synchronously from the click event. Mobile browsers otherwise block
  // the tab after the signed-URL or PDF-generation await completes.
  const previewWindow = beginDocumentPreview();
  try {
    if (document.source === 'rating') {
      const rating = context.ratings.find(item => item.id === document.sourceId) || await fetchInterviewRating(document.sourceId);
      openBlob(await downloadInterviewRatingPdf(rating, context.candidate, false), previewWindow);
      return;
    }
    if (document.source === 'rating_attachment') {
      const url = await getInterviewRatingAttachmentUrl(document.storagePath || '');
      openDocumentUrl(url, previewWindow);
      return;
    }
    if (document.source === 'offer') {
      const details: OfferBuilderDetails = {
        currency: 'PHP',
        grossMonthlySalary: context.offer.basePay,
        grossAnnualizedSalary: context.offer.basePay * 12,
        jobTitle: context.offer.offerDetails?.jobTitle || '',
        rolePurpose: context.offer.jobDescription || '',
        reportingManager: context.offer.reportingTo,
        ...context.offer.offerDetails,
      };
      const pdf = await downloadOfferPdf(context.offer, details, `${context.candidate.firstName} ${context.candidate.lastName}`.trim(), details.businessUnit || 'The Nextperience', false, undefined, false);
      openBlob(pdf.output('blob'), previewWindow);
      return;
    }
    const legacyStorageLocation = document.source === 'resume'
      ? resolveRecruitmentResumeStorageLocation(document.externalUrl)
      : parseSupabaseStorageUrl(document.externalUrl);
    const storageBucket = document.storageBucket || legacyStorageLocation?.bucket;
    const storagePath = document.storagePath || legacyStorageLocation?.path;
    if (storagePath && storageBucket) {
      const { data, error } = await supabase.storage.from(storageBucket).createSignedUrl(storagePath, 5 * 60);
      if (error || !data?.signedUrl) throw error || new Error('Unable to create a secure document link.');
      openDocumentUrl(data.signedUrl, previewWindow);
      return;
    }
    if (document.externalUrl) {
      openDocumentUrl(document.externalUrl, previewWindow);
      return;
    }
    throw new Error('This package document has no previewable file.');
  } catch (error) {
    previewWindow.close();
    throw error;
  }
};

export const uploadCandidateDocument = async (
  candidateId: string,
  applicationId: string,
  file: File,
  documentType: OfferPackageDocumentType = 'Other Supporting Document',
): Promise<OfferPackageDocument> => {
  const mimeType = resolveCandidateDocumentMimeType(file);
  if (file.size < 1 || file.size > 20 * 1024 * 1024) throw new Error('Candidate documents must be 20 MB or smaller.');
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '-');
  const path = `candidate-documents/${candidateId}/${crypto.randomUUID()}-${safeName}`;
  const { error: uploadError } = await supabase.storage.from(CANDIDATE_DOCUMENT_BUCKET).upload(path, file, { contentType: mimeType, upsert: false });
  if (uploadError) throw uploadError;
  const { data, error } = await supabase.rpc('upload_job_candidate_document', {
    p_candidate_id: candidateId,
    p_application_id: applicationId,
    p_document_type: documentType,
    p_file_name: file.name,
    p_storage_bucket: CANDIDATE_DOCUMENT_BUCKET,
    p_storage_path: path,
    p_mime_type: mimeType,
    p_file_size: file.size,
  });
  if (error || !data) {
    await supabase.storage.from(CANDIDATE_DOCUMENT_BUCKET).remove([path]);
    throw error || new Error('The candidate document could not be registered.');
  }
  return mapCandidateDocument(data);
};

export const removeCandidateDocument = async (document: OfferPackageDocument): Promise<void> => {
  const { error } = await supabase.rpc('remove_job_candidate_document', { p_document_id: document.sourceId });
  if (error) throw error;
};

export const updateCandidateDocumentType = async (
  document: OfferPackageDocument,
  documentType: OfferPackageDocumentType,
): Promise<OfferPackageDocument> => {
  if (document.source !== 'candidate_document') throw new Error('Only candidate-library documents can be reclassified.');
  const { data, error } = await supabase.rpc('update_job_candidate_document_type', {
    p_document_id: document.sourceId,
    p_document_type: documentType,
  });
  if (error || !data) throw error || new Error('The candidate document could not be reclassified.');
  return mapCandidateDocument(data);
};

export const createOfferApprovalRequest = async (input: {
  offerId: string;
  documents: OfferPackageDocument[];
  candidate: Candidate;
  application: Application;
  offer: Offer;
  ratings: InterviewRatingRecord[];
  overrideIncompleteRatings?: boolean;
  overrideReason?: string;
}): Promise<string> => {
  const summary = createInterviewRatingSummary(input.ratings);
  const documents = dedupeOfferPackageDocuments(input.documents);
  if (documents.length === 0) throw new Error('Select the approval package documents before submitting.');
  if (documents.some(document => document.candidateId !== input.candidate.id)) {
    throw new Error('Every selected document must belong to this candidate.');
  }
  const packageSnapshot = {
    offerId: input.offerId,
    applicationId: input.application.id,
    candidateId: input.candidate.id,
    jobPostId: input.application.jobPostId,
    requisitionId: input.application.requisitionId,
    candidateName: `${input.candidate.firstName} ${input.candidate.lastName}`.trim(),
    position: input.offer.offerDetails?.jobTitle || input.application.roleTitleSnapshot || '',
    businessUnit: input.offer.offerDetails?.businessUnit || '',
    basePay: input.offer.basePay,
    startDate: input.offer.startDate.toISOString(),
    interviewSummary: {
      submittedReviewers: summary.submittedReviewers,
      totalReviewers: summary.totalReviewers,
      overallScore: summary.overallScore,
      overallLabel: summary.overallLabel,
      quickRecommendation: summary.quickRecommendation,
    },
  };
  const attachmentSnapshot = documents.map(document => ({
    id: document.id,
    candidateId: document.candidateId,
    applicationId: document.applicationId,
    documentType: document.documentType,
    fileName: document.fileName,
    mimeType: document.mimeType,
    source: document.source,
    sourceId: document.sourceId,
    ratingId: document.ratingId,
    offerId: document.offerId,
    storageBucket: document.storageBucket,
    storagePath: document.storagePath,
    externalUrl: document.externalUrl,
  }));
  const { data, error } = await supabase.rpc('create_job_offer_approval_request', {
    p_offer_id: input.offerId,
    p_attachment_snapshot: attachmentSnapshot,
    p_package_snapshot: packageSnapshot,
    p_override_incomplete_ratings: input.overrideIncompleteRatings === true,
    p_override_reason: input.overrideReason?.trim() || null,
  });
  if (error) throw error;
  return String(data);
};

const mapApprovalRequest = (row: any): OfferApprovalRequestSummary => ({
  id: row.id,
  offerId: row.offer_id,
  applicationId: row.application_id,
  candidateId: row.candidate_id,
  jobPostId: row.job_post_id || undefined,
  requisitionId: row.requisition_id || undefined,
  requesterUserId: row.requester_user_id,
  status: row.status as OfferApprovalStatus,
  approvalStage: row.approval_stage,
  revision: Number(row.revision || 1),
  submittedAt: new Date(row.submitted_at),
  updatedAt: new Date(row.updated_at),
  completedAt: dateOrUndefined(row.completed_at),
  overrideIncompleteRatings: row.override_incomplete_ratings === true,
  overrideReason: row.override_reason || undefined,
  packageSnapshot: row.package_snapshot || {},
  attachmentSnapshot: Array.isArray(row.attachment_snapshot) ? row.attachment_snapshot.map(mapSnapshotDocument) : [],
});

const mapAssignment = (row: any): OfferApprovalAssignment => ({
  id: row.id,
  requestId: row.request_id,
  approverUserId: row.approver_user_id,
  approverRole: row.approver_role,
  approvalStage: row.approval_stage,
  status: row.status,
  assignedAt: new Date(row.assigned_at),
  decidedAt: dateOrUndefined(row.decided_at),
  comments: row.comments || undefined,
});

const mapTrail = (row: any): OfferApprovalTrailEntry => ({
  id: row.id,
  stage: row.approval_stage,
  approverName: row.approver_name || row.approver_role || 'System',
  approverRole: row.approver_role,
  action: row.action,
  statusBefore: row.status_before || undefined,
  statusAfter: row.status_after || undefined,
  comments: row.comments || undefined,
  documentsReviewed: Array.isArray(row.documents_reviewed) ? row.documents_reviewed.map((item: any) => typeof item === 'string' ? item : item.fileName || item.file_name || item.id).filter(Boolean) : [],
  createdAt: new Date(row.created_at),
});

export const fetchOfferApprovalPackage = async (requestId: string): Promise<OfferApprovalPackageData> => {
  const { data, error } = await supabase.rpc('get_job_offer_approval_package', { p_request_id: requestId });
  if (error) throw error;
  const payload = Array.isArray(data) ? data[0] : data;
  if (!payload?.request || !payload?.candidate || !payload?.application || !payload?.offer) throw new Error('The offer approval package is unavailable.');
  return {
    request: mapApprovalRequest(payload.request),
    offer: mapJobOfferRow(payload.offer),
    application: mapApplicationRow(payload.application),
    candidate: mapCandidateRow(payload.candidate),
    ratings: (payload.ratings || []).map(mapInterviewRatingRecord),
    ratingAttachments: (payload.ratingAttachments || []).map(mapInterviewRatingAttachment),
    candidateDocuments: (payload.candidateDocuments || []).map(mapCandidateDocument),
    assignments: (payload.assignments || []).map(mapAssignment),
    approvalTrail: (payload.approvalTrail || []).map(mapTrail),
  };
};

export const getApprovalPackageDocuments = (pkg: OfferApprovalPackageData): OfferPackageDocument[] => {
  const manualDocuments = new Map(pkg.candidateDocuments.map(document => [document.id, document]));
  const ratings = new Map(pkg.ratings.map(rating => [rating.id, rating]));
  const attachments = new Map(pkg.ratingAttachments.map(attachment => [attachment.id, attachment]));
  const candidateName = `${pkg.candidate.firstName} ${pkg.candidate.lastName}`.trim();
  const documents = (pkg.request.attachmentSnapshot || []).flatMap(snapshot => {
    if (snapshot.source === 'candidate_document') {
      const document = manualDocuments.get(snapshot.sourceId);
      return [{
        ...(document || {}),
        ...snapshot,
        id: snapshot.id,
        candidateId: pkg.candidate.id,
        applicationId: snapshot.applicationId || document?.applicationId || pkg.application.id,
        storageBucket: document?.storageBucket || snapshot.storageBucket,
        storagePath: document?.storagePath || snapshot.storagePath,
        externalUrl: document?.externalUrl || snapshot.externalUrl,
        isSelectable: true,
      } as OfferPackageDocument];
    }
    if (snapshot.source === 'rating') {
      const rating = ratings.get(snapshot.sourceId);
      return rating ? [ratingDocument(rating)] : [];
    }
    if (snapshot.source === 'rating_attachment') {
      const attachment = attachments.get(snapshot.sourceId);
      const rating = attachment ? ratings.get(attachment.ratingId) : undefined;
      return attachment && rating ? [ratingAttachmentDocument(rating, attachment)] : [];
    }
    if (snapshot.source === 'resume') {
      return [{
        ...snapshot,
        candidateId: pkg.candidate.id,
        applicationId: pkg.application.id,
        fileName: snapshot.fileName || 'Candidate resume',
        storageBucket: pkg.application.resumeFilePath ? 'recruitment-uploads' : snapshot.storageBucket,
        storagePath: pkg.application.resumeFilePath || snapshot.storagePath,
        externalUrl: pkg.application.resumeFileUrl || pkg.application.resumeLink || snapshot.externalUrl,
      }];
    }
    if (snapshot.source === 'offer') {
      return [{ ...snapshot, candidateId: pkg.candidate.id, applicationId: pkg.application.id, offerId: pkg.offer.id, fileName: snapshot.fileName || `${pkg.offer.offerNumber || 'Offer'} · Offer PDF`, mimeType: 'application/pdf' }];
    }
    return [];
  }).map(document => ({ ...document, description: document.description || `${candidateName} package document` }));
  return dedupeOfferPackageDocuments(documents);
};

export const fetchPendingOfferApprovalIds = async (): Promise<Array<{ requestId: string; offerId: string; approvalStage: string; assignedAt: Date }>> => {
  const { data, error } = await supabase.rpc('get_my_pending_offer_approval_ids');
  if (error) throw error;
  return (data || []).map((row: any) => ({ requestId: row.request_id, offerId: row.offer_id, approvalStage: row.approval_stage, assignedAt: new Date(row.assigned_at) }));
};

export const processOfferApproval = async (requestId: string, decision: 'approve' | 'return' | 'reject', comments?: string): Promise<Record<string, unknown>> => {
  if ((decision === 'return' || decision === 'reject') && !comments?.trim()) throw new Error('Comments are required for this decision.');
  const { data, error } = await supabase.rpc('process_job_offer_approval', { p_request_id: requestId, p_decision: decision, p_comments: comments?.trim() || null });
  if (error) throw error;
  return (Array.isArray(data) ? data[0] : data) || {};
};
