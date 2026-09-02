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
  documentType: row.document_type as OfferPackageDocumentType,
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
  documentType: row.documentType || row.document_type,
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
  const { data, error } = await supabase
    .from('job_candidate_documents')
    .select('*')
    .eq('candidate_id', candidate.id)
    .is('archived_at', null)
    .order('uploaded_at', { ascending: false });
  if (error) throw error;

  const documents: OfferPackageDocument[] = [];
  const resumeUrl = application.resumeFileUrl || application.resumeLink;
  if (application.resumeFilePath || resumeUrl) {
    documents.push({
      id: `resume:${application.id}`,
      candidateId: candidate.id,
      applicationId: application.id,
      documentType: 'Resume',
      fileName: 'Candidate resume',
      mimeType: 'application/pdf',
      source: 'resume',
      sourceId: application.id,
      externalUrl: resumeUrl,
      storageBucket: application.resumeFilePath ? 'recruitment-uploads' : undefined,
      storagePath: application.resumeFilePath,
      isSelectable: true,
    });
  }

  const submittedRatings = ratings.filter(rating => isInterviewRatingSubmitted(rating.status));
  documents.push(...submittedRatings.map(ratingDocument));
  const attachmentGroups = await Promise.all(submittedRatings.map(async rating => ({ rating, attachments: await fetchInterviewRatingAttachments(rating.id) })));
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
  documents.push(...(data || []).map(mapCandidateDocument));
  return documents;
};

const openBlob = (blob: Blob) => {
  const url = URL.createObjectURL(blob);
  const opened = window.open(url, '_blank', 'noopener,noreferrer');
  if (!opened) throw new Error('The document could not be opened. Allow pop-ups and try again.');
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
};

export const openOfferPackageDocument = async (
  document: OfferPackageDocument,
  context: { candidate: Candidate; offer: Offer; ratings: InterviewRatingRecord[] },
): Promise<void> => {
  if (document.source === 'rating') {
    const rating = context.ratings.find(item => item.id === document.sourceId) || await fetchInterviewRating(document.sourceId);
    openBlob(await downloadInterviewRatingPdf(rating, context.candidate, false));
    return;
  }
  if (document.source === 'rating_attachment') {
    const url = await getInterviewRatingAttachmentUrl(document.storagePath || '');
    window.open(url, '_blank', 'noopener,noreferrer');
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
    openBlob(pdf.output('blob'));
    return;
  }
  if (document.storagePath && document.storageBucket) {
    const { data, error } = await supabase.storage.from(document.storageBucket).createSignedUrl(document.storagePath, 60 * 60);
    if (error || !data?.signedUrl) throw error || new Error('Unable to create a secure document link.');
    window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
    return;
  }
  if (document.externalUrl) {
    window.open(document.externalUrl, '_blank', 'noopener,noreferrer');
    return;
  }
  throw new Error('This package document has no previewable file.');
};

export const uploadCandidateDocument = async (
  candidateId: string,
  applicationId: string,
  file: File,
  documentType: OfferPackageDocumentType = 'Other Supporting Document',
): Promise<OfferPackageDocument> => {
  const allowed = ['application/pdf', 'image/jpeg', 'image/png', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
  if (!allowed.includes(file.type)) throw new Error('Upload a PDF, JPG, PNG, DOC, or DOCX document.');
  if (file.size < 1 || file.size > 20 * 1024 * 1024) throw new Error('Candidate documents must be 20 MB or smaller.');
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '-');
  const path = `candidate-documents/${candidateId}/${crypto.randomUUID()}-${safeName}`;
  const { error: uploadError } = await supabase.storage.from(CANDIDATE_DOCUMENT_BUCKET).upload(path, file, { contentType: file.type, upsert: false });
  if (uploadError) throw uploadError;
  const { data, error } = await supabase.rpc('upload_job_candidate_document', {
    p_candidate_id: candidateId,
    p_application_id: applicationId,
    p_document_type: documentType,
    p_file_name: file.name,
    p_storage_bucket: CANDIDATE_DOCUMENT_BUCKET,
    p_storage_path: path,
    p_mime_type: file.type,
    p_file_size: file.size,
  });
  if (error || !data) {
    await supabase.storage.from(CANDIDATE_DOCUMENT_BUCKET).remove([path]);
    throw error || new Error('The candidate document could not be registered.');
  }
  return mapCandidateDocument(data);
};

export const removeCandidateDocument = async (document: OfferPackageDocument): Promise<void> => {
  await supabase.rpc('remove_job_candidate_document', { p_document_id: document.sourceId });
  if (document.storageBucket && document.storagePath) {
    const { error } = await supabase.storage.from(document.storageBucket).remove([document.storagePath]);
    if (error) throw error;
  }
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
  const packageSnapshot = {
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
  const attachmentSnapshot = input.documents.map(document => ({
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
  return (pkg.request.attachmentSnapshot || []).flatMap(snapshot => {
    if (snapshot.source === 'candidate_document') {
      const document = manualDocuments.get(snapshot.sourceId);
      return document ? [{ ...snapshot, ...document, id: snapshot.id }] : [];
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
      return [{ ...snapshot, candidateId: pkg.candidate.id, applicationId: pkg.application.id, fileName: snapshot.fileName || 'Candidate resume', storageBucket: pkg.application.resumeFilePath ? 'recruitment-uploads' : undefined, storagePath: pkg.application.resumeFilePath, externalUrl: pkg.application.resumeFileUrl || pkg.application.resumeLink }];
    }
    if (snapshot.source === 'offer') {
      return [{ ...snapshot, candidateId: pkg.candidate.id, applicationId: pkg.application.id, offerId: pkg.offer.id, fileName: snapshot.fileName || `${pkg.offer.offerNumber || 'Offer'} · Offer PDF`, mimeType: 'application/pdf' }];
    }
    return [];
  }).map(document => ({ ...document, description: document.description || `${candidateName} package document` }));
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
