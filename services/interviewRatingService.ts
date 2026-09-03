import { supabase } from './supabaseClient';
import {
  Application,
  Candidate,
  InterviewRatingAttachment,
  InterviewRatingRecord,
  InterviewRatingScaleOption,
  InterviewRatingStatus,
  InterviewRatingTemplate,
  InterviewTemplateField,
  InterviewTemplateSection,
  InterviewTemplateStatus,
} from '../types';
import { createInterviewRatingSummary } from './interviewRatingSummary';

export const INTERVIEW_RATING_ATTACHMENT_BUCKET = 'interview-rating-attachments';
export const STANDARD_INTERVIEW_TEMPLATE_NAME = 'Standard Interview Rating Form — Existing Company Template';

export const STANDARD_INTERVIEW_RATING_SCALE: InterviewRatingScaleOption[] = [
  { label: 'Very Good', value: 5 },
  { label: 'Good', value: 4 },
  { label: 'Average', value: 3 },
  { label: 'Poor', value: 2 },
  { label: 'Very Poor', value: 1 },
];

export const STANDARD_INTERVIEW_SECTIONS: InterviewTemplateSection[] = [
  {
    id: 'candidate-information',
    title: 'Candidate Information',
    description: 'Details linked from the candidate record.',
    order: 1,
    fields: [
      { id: 'candidate_date', label: 'Date', type: 'date', required: true, autoLinked: true },
      { id: 'position_applied_for', label: 'Position Applied For', type: 'text', required: true, autoLinked: true },
      { id: 'applicant_name', label: "Applicant's Name", type: 'text', required: true, autoLinked: true },
    ],
  },
  {
    id: 'rating-matrix',
    title: 'Rating Matrix',
    description: 'Select one rating for each criterion.',
    order: 2,
    fields: [
      { id: 'first_impression', label: 'First Impression', description: 'What type of first impression does the applicant make?', type: 'rating', required: true },
      { id: 'appearance', label: 'Appearance', description: "How does the applicant's appearance impress you?", type: 'rating', required: true },
      { id: 'self_expression_communication', label: 'Self-Expression/Communication', description: 'How well does the applicant use correct English and articulate his/her views?', type: 'rating', required: true },
      { id: 'behaviour', label: 'Behaviour', description: "What was the applicant's behavior during the interview?", type: 'rating', required: true },
      { id: 'responsiveness', label: 'Responsiveness', description: 'How alert was the applicant?', type: 'rating', required: true },
      { id: 'background', label: 'Background', description: "How well do the applicant's experience, education, and training fit the job?", type: 'rating', required: true },
      { id: 'track_record', label: 'Track Record', description: 'Effectiveness in previous work.', type: 'rating', required: true },
      { id: 'teamwork', label: 'Teamwork', description: 'Ability to work with others.', type: 'rating', required: true },
    ],
  },
  {
    id: 'written-evaluation',
    title: 'Written Evaluation',
    description: 'Interview observations and supporting comments.',
    order: 3,
    fields: [
      { id: 'applicant_motivation', label: "Applicant's Motivation", description: 'What factors appear to be influencing the applicant’s consideration of a position with our company at this time? Why is the applicant leaving his/her present position?', type: 'textarea', required: false },
      { id: 'possible_reservations', label: 'Possible Reservations', description: 'What reservations or concerns (if any) does the applicant have about the position? Consider work location, travel, compensation, advancement, opportunities, etc.', type: 'textarea', required: false },
      { id: 'other_positions', label: 'Other Positions', description: 'Does the applicant seem to be more suitable for another position or location?', type: 'textarea', required: false },
      { id: 'apparent_assets_limitations', label: 'Apparent Assets and Limitations', description: 'What are the applicant’s apparent assets and limitations? What training and development (if any) is recommended?', type: 'textarea', required: false },
      { id: 'additional_comments', label: 'Additional Comments', description: 'Add any additional comments from the interview.', type: 'textarea', required: false },
      { id: 'date_available', label: 'Date Available', type: 'date', required: false },
    ],
  },
  {
    id: 'final-recommendation',
    title: 'Final Recommendation',
    description: 'Overall evaluation and next-step recommendations.',
    order: 4,
    fields: [
      { id: 'overall_evaluation', label: 'Overall Evaluation', type: 'choice', required: true, options: [
        { label: 'Good', value: 'Good' }, { label: 'Fair', value: 'Fair' }, { label: 'Unfavourable', value: 'Unfavourable' },
      ] },
      { id: 'further_interview', label: 'Further Interview', type: 'yes_no', required: true },
      { id: 'active_pool', label: 'Active Pool', type: 'yes_no', required: true },
      { id: 'job_offer', label: 'Job Offer', type: 'yes_no', required: true },
    ],
  },
  {
    id: 'reviewer-information',
    title: 'Reviewer Information',
    description: 'Automatically recorded reviewer details and acknowledgement.',
    order: 5,
    fields: [
      { id: 'interviewer_name', label: "Interviewer's Name", type: 'text', required: true, system: true },
      { id: 'interviewer_position', label: "Interviewer's Position", type: 'text', required: false, system: true },
      { id: 'submitted_at', label: 'Submission Date and Time', type: 'text', required: false, system: true },
      { id: 'electronic_acknowledgement', label: 'I acknowledge that this rating represents my interview assessment.', type: 'acknowledgement', required: true },
    ],
  },
];

const toDate = (value?: string | null) => value ? new Date(value) : undefined;

const normalizeOptions = (options: unknown): { label: string; value: string | number }[] => {
  if (!Array.isArray(options)) return [];
  return options.map((option: any) => typeof option === 'object'
    ? { label: String(option.label || option.value || ''), value: option.value ?? option.label ?? '' }
    : { label: String(option), value: String(option) }).filter(option => option.label);
};

const normalizeField = (field: any): InterviewTemplateField => ({
  id: String(field?.id || `field-${crypto.randomUUID()}`),
  label: String(field?.label || 'Untitled field'),
  type: field?.type || 'text',
  required: field?.required === true,
  autoLinked: field?.autoLinked === true,
  system: field?.system === true,
  description: field?.description || undefined,
  options: normalizeOptions(field?.options),
});

const normalizeSections = (sections: unknown): InterviewTemplateSection[] =>
  (Array.isArray(sections) ? sections : []).map((section: any, index) => ({
    id: String(section?.id || `section-${index + 1}`),
    title: String(section?.title || `Section ${index + 1}`),
    description: section?.description || undefined,
    order: Number(section?.order || index + 1),
    fields: (Array.isArray(section?.fields) ? section.fields : []).map(normalizeField),
  }));

const mapTemplateRow = (row: any): InterviewRatingTemplate => ({
  id: row.id,
  templateGroupId: row.template_group_id,
  version: Number(row.version || 1),
  name: row.name,
  description: row.description || '',
  status: row.status as InterviewTemplateStatus,
  assignmentBusinessUnitIds: Array.isArray(row.assignment_business_unit_ids) ? row.assignment_business_unit_ids : [],
  assignmentPositions: Array.isArray(row.assignment_positions) ? row.assignment_positions : [],
  assignmentStages: Array.isArray(row.assignment_stages) ? row.assignment_stages : [],
  sections: normalizeSections(row.sections),
  ratingScale: (Array.isArray(row.rating_scale) ? row.rating_scale : STANDARD_INTERVIEW_RATING_SCALE).map((item: any) => ({ label: String(item.label), value: Number(item.value) })),
  createdByUserId: row.created_by_user_id,
  createdAt: new Date(row.created_at),
  updatedAt: new Date(row.updated_at),
  isCurrent: row.is_current !== false,
  supersedesTemplateId: row.supersedes_template_id || undefined,
});

export const mapInterviewRatingRecord = (row: any): InterviewRatingRecord => ({
  id: row.id,
  candidateId: row.candidate_id,
  applicationId: row.application_id,
  templateVersionId: row.template_version_id,
  templateGroupId: row.template_group_id,
  templateVersion: Number(row.template_version || 1),
  templateSnapshot: mapTemplateRow(row.template_snapshot || {}),
  reviewerUserId: row.reviewer_user_id,
  reviewerNameSnapshot: row.reviewer_name_snapshot || 'Reviewer',
  reviewerPositionSnapshot: row.reviewer_position_snapshot || '',
  dueDate: toDate(row.due_date),
  interviewRound: row.interview_round || 'Round 1',
  status: row.status as InterviewRatingStatus,
  formData: row.form_data && typeof row.form_data === 'object' ? row.form_data : {},
  createdByUserId: row.created_by_user_id,
  returnedNotes: row.returned_notes || undefined,
  submittedAt: toDate(row.submitted_at),
  lockedAt: toDate(row.locked_at),
  reopenedAt: toDate(row.reopened_at),
  reopenedByUserId: row.reopened_by_user_id || undefined,
  createdAt: new Date(row.created_at),
  updatedAt: new Date(row.updated_at),
});

export const mapInterviewRatingAttachment = (row: any): InterviewRatingAttachment => ({
  id: row.id,
  ratingId: row.rating_id,
  fileName: row.file_name,
  storagePath: row.storage_path,
  mimeType: row.mime_type,
  fileSize: row.file_size ? Number(row.file_size) : undefined,
  category: row.category || 'Scanned Interview Rating',
  uploadedByUserId: row.uploaded_by_user_id,
  createdAt: new Date(row.created_at),
});

export const isInterviewRatingSubmitted = (status: InterviewRatingStatus) => status === 'Submitted' || status === 'Locked';
export const isInterviewRatingEditable = (status: InterviewRatingStatus) => ['Not Started', 'Draft', 'Returned for Revision'].includes(status);

export const fetchInterviewTemplates = async (): Promise<InterviewRatingTemplate[]> => {
  const { data, error } = await supabase.from('job_interview_templates').select('*').eq('is_current', true).order('updated_at', { ascending: false });
  if (error) throw error;
  return (data || []).map(mapTemplateRow);
};

export const fetchActiveInterviewTemplates = async (): Promise<InterviewRatingTemplate[]> => {
  const templates = await fetchInterviewTemplates();
  return templates.filter(template => template.status === 'Active');
};

export interface SaveInterviewTemplateInput {
  id?: string | null;
  name: string;
  description: string;
  status: InterviewTemplateStatus;
  assignmentBusinessUnitIds: string[];
  assignmentPositions: string[];
  assignmentStages: string[];
  sections: InterviewTemplateSection[];
  ratingScale: InterviewRatingScaleOption[];
}

export const saveInterviewTemplate = async (input: SaveInterviewTemplateInput): Promise<string> => {
  const { data, error } = await supabase.rpc('save_interview_template', {
    p_template_id: input.id || null,
    p_name: input.name,
    p_description: input.description,
    p_status: input.status,
    p_assignment_business_unit_ids: input.assignmentBusinessUnitIds,
    p_assignment_positions: input.assignmentPositions,
    p_assignment_stages: input.assignmentStages,
    p_sections: input.sections,
    p_rating_scale: input.ratingScale,
  });
  if (error) throw error;
  return String(data);
};

export const duplicateInterviewTemplate = async (templateId: string, name: string): Promise<string> => {
  const { data, error } = await supabase.rpc('duplicate_interview_template', { p_template_id: templateId, p_name: name });
  if (error) throw error;
  return String(data);
};

export const setInterviewTemplateStatus = async (templateId: string, status: InterviewTemplateStatus): Promise<string> => {
  const { data, error } = await supabase.rpc('set_interview_template_status', { p_template_id: templateId, p_status: status });
  if (error) throw error;
  return String(data);
};

export const fetchRatingRecordsForCandidate = async (candidateId: string): Promise<InterviewRatingRecord[]> => {
  const { data, error } = await supabase.from('job_interview_rating_records').select('*').eq('candidate_id', candidateId).order('created_at', { ascending: false });
  if (error) throw error;
  return (data || []).map(mapInterviewRatingRecord);
};

export const fetchInterviewRating = async (ratingId: string): Promise<InterviewRatingRecord> => {
  const { data, error } = await supabase.from('job_interview_rating_records').select('*').eq('id', ratingId).single();
  if (error) throw error;
  return mapInterviewRatingRecord(data);
};

export const fetchInterviewRatingCandidate = async (ratingId: string): Promise<Candidate> => {
  const { data, error } = await supabase.rpc('get_interview_rating_candidate', { p_rating_id: ratingId });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) throw new Error('Candidate context was not found for this rating.');
  return {
    id: row.id,
    firstName: row.first_name || '',
    lastName: row.last_name || '',
    email: row.email || '',
    phone: row.phone || '',
    source: row.source as Candidate['source'],
    tags: Array.isArray(row.tags) ? row.tags : [],
    portfolioUrl: row.portfolio_url || undefined,
    consentAt: row.consent_at ? new Date(row.consent_at) : undefined,
    currentCity: row.current_city || undefined,
    currentEmployer: row.current_employer || undefined,
    yearsRelevantExperience: row.years_relevant_experience || undefined,
    earliestStartDate: row.earliest_start_date || undefined,
    linkedinUrl: row.linkedin_url || undefined,
  };
};

export const createInterviewRatingAssignments = async (input: {
  candidateId: string;
  applicationId: string;
  templateVersionId: string;
  reviewerUserIds: string[];
  dueDate?: string;
  interviewRound: string;
}): Promise<InterviewRatingRecord[]> => {
  const { data, error } = await supabase.rpc('create_interview_rating_assignments', {
    p_candidate_id: input.candidateId,
    p_application_id: input.applicationId,
    p_template_version_id: input.templateVersionId,
    p_reviewer_user_ids: input.reviewerUserIds,
    p_due_date: input.dueDate || null,
    p_interview_round: input.interviewRound,
  });
  if (error) throw error;
  const rows = Array.isArray(data) ? data : data ? [data] : [];
  return rows.map(mapInterviewRatingRecord);
};

export const removeInterviewRatingAssignment = async (ratingId: string): Promise<void> => {
  const { error } = await supabase.rpc('remove_interview_rating_assignment', { p_rating_id: ratingId });
  if (error) throw error;
};

const workflowRating = async (name: 'save_interview_rating' | 'submit_interview_rating', ratingId: string, formData: Record<string, unknown>) => {
  const { data, error } = await supabase.rpc(name, { p_rating_id: ratingId, p_form_data: formData });
  if (error) throw error;
  return mapInterviewRatingRecord(data);
};

export const saveInterviewRating = (ratingId: string, formData: Record<string, unknown>) => workflowRating('save_interview_rating', ratingId, formData);
export const submitInterviewRating = (ratingId: string, formData: Record<string, unknown>) => workflowRating('submit_interview_rating', ratingId, formData);

export const reopenInterviewRating = async (ratingId: string, reason: string): Promise<InterviewRatingRecord> => {
  const { data, error } = await supabase.rpc('reopen_interview_rating', { p_rating_id: ratingId, p_reason: reason });
  if (error) throw error;
  return mapInterviewRatingRecord(data);
};

export const lockInterviewRating = async (ratingId: string): Promise<InterviewRatingRecord> => {
  const { data, error } = await supabase.rpc('lock_interview_rating', { p_rating_id: ratingId });
  if (error) throw error;
  return mapInterviewRatingRecord(data);
};

export const fetchInterviewRatingAttachments = async (ratingId: string): Promise<InterviewRatingAttachment[]> => {
  const { data, error } = await supabase.from('job_interview_rating_attachments').select('*').eq('rating_id', ratingId).order('created_at', { ascending: false });
  if (error) throw error;
  return (data || []).map(mapInterviewRatingAttachment);
};

export const uploadInterviewRatingAttachment = async (ratingId: string, file: File): Promise<InterviewRatingAttachment> => {
  const allowedTypes = ['application/pdf', 'image/jpeg', 'image/png'];
  if (!allowedTypes.includes(file.type)) throw new Error('Upload a PDF, JPG, or PNG scanned rating form.');
  if (file.size > 10 * 1024 * 1024) throw new Error('Scanned rating forms must be 10 MB or smaller.');
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '-');
  const path = `interview-ratings/${ratingId}/${crypto.randomUUID()}-${safeName}`;
  const { error: uploadError } = await supabase.storage.from(INTERVIEW_RATING_ATTACHMENT_BUCKET).upload(path, file, { contentType: file.type, upsert: false });
  if (uploadError) throw uploadError;
  const { data, error } = await supabase.rpc('upload_interview_rating_attachment', {
    p_rating_id: ratingId,
    p_file_name: file.name,
    p_storage_path: path,
    p_mime_type: file.type,
    p_file_size: file.size,
  });
  if (error) {
    await supabase.storage.from(INTERVIEW_RATING_ATTACHMENT_BUCKET).remove([path]);
    throw error;
  }
  if (!data) {
    await supabase.storage.from(INTERVIEW_RATING_ATTACHMENT_BUCKET).remove([path]);
    throw new Error('The scanned rating could not be registered.');
  }
  return mapInterviewRatingAttachment(data);
};

export const removeInterviewRatingAttachment = async (attachment: InterviewRatingAttachment): Promise<void> => {
  const { error } = await supabase.rpc('remove_interview_rating_attachment', { p_attachment_id: attachment.id });
  if (error) throw error;
  const { error: storageError } = await supabase.storage.from(INTERVIEW_RATING_ATTACHMENT_BUCKET).remove([attachment.storagePath]);
  if (storageError) throw storageError;
};

export const getInterviewRatingAttachmentUrl = async (storagePath: string): Promise<string> => {
  const { data, error } = await supabase.storage.from(INTERVIEW_RATING_ATTACHMENT_BUCKET).createSignedUrl(storagePath, 60 * 60);
  if (error || !data?.signedUrl) throw error || new Error('Unable to create a secure attachment link.');
  return data.signedUrl;
};

const asAnswerText = (value: unknown): string => {
  if (value === undefined || value === null || value === '') return '—';
  if (typeof value === 'boolean') return value ? 'Acknowledged' : 'Not acknowledged';
  if (typeof value === 'object') {
    const object = value as Record<string, unknown>;
    if (object.label !== undefined) return object.value === undefined || object.value === ''
      ? String(object.label)
      : `${String(object.label)} (${String(object.value)})`;
    return JSON.stringify(value);
  }
  return String(value);
};

export const downloadInterviewRatingPdf = async (rating: InterviewRatingRecord, candidate: Candidate, autoDownload = true): Promise<Blob> => {
  const { jsPDF } = await import('jspdf');
  const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait', compress: true });
  const primary: [number, number, number] = [79, 70, 229];
  const dark: [number, number, number] = [15, 23, 42];
  const muted: [number, number, number] = [100, 116, 139];
  const pale: [number, number, number] = [245, 243, 255];
  const margin = 16;
  const contentWidth = 178;
  const pageBottom = 276;
  let y = 25;
  const answers = rating.formData || {};
  const template = rating.templateSnapshot;
  const candidateName = `${candidate.firstName} ${candidate.lastName}`.trim();
  const summary = createInterviewRatingSummary([rating]);
  const fields = template.sections.flatMap(section => section.fields);
  const field = (id: string) => fields.find(item => item.id === id);
  const fieldLabel = (id: string, fallback: string) => field(id)?.label || fallback;
  const answer = (id: string) => asAnswerText(answers[id]);
  const formatSubmitted = rating.submittedAt
    ? rating.submittedAt.toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' })
    : '—';

  const pageHeader = () => {
    pdf.setFillColor(...primary);
    pdf.rect(0, 0, 210, 16, 'F');
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(9);
    pdf.setTextColor(255, 255, 255);
    pdf.text('TNG HRIS  ·  INTERVIEW RATING', margin, 10.5);
    y = 25;
  };

  const newPage = () => {
    pdf.addPage();
    pageHeader();
  };

  const ensure = (height: number) => {
    if (y + height > pageBottom) newPage();
  };

  const write = (value: string, size = 9, bold = false, color = dark, x = margin, width = contentWidth, gap = 2) => {
    pdf.setFont('helvetica', bold ? 'bold' : 'normal');
    pdf.setFontSize(size);
    pdf.setTextColor(...color);
    const lines = pdf.splitTextToSize(value || '—', width) as string[];
    const lineHeight = size * 0.43;
    ensure(lines.length * lineHeight + gap);
    pdf.text(lines, x, y);
    y += lines.length * lineHeight + gap;
  };

  const sectionHeading = (title: string, subtitle?: string) => {
    ensure(subtitle ? 17 : 11);
    y += 2;
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(13);
    pdf.setTextColor(...dark);
    pdf.text(title, margin, y);
    y += 5.5;
    if (subtitle) write(subtitle, 8, false, muted, margin, contentWidth, 3);
  };

  const infoCell = (label: string, value: string, x: number, width: number, top: number) => {
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(7);
    pdf.setTextColor(...muted);
    pdf.text(label.toUpperCase(), x, top);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(9);
    pdf.setTextColor(...dark);
    const lines = pdf.splitTextToSize(value || '—', width) as string[];
    pdf.text(lines, x, top + 4.5);
    return lines.length;
  };

  const detailCard = (label: string, value: string, accent = false) => {
    const lines = pdf.splitTextToSize(value || '—', contentWidth - 12) as string[];
    const height = Math.max(18, 10 + lines.length * 4.1);
    ensure(height + 3);
    pdf.setFillColor(...(accent ? pale : [248, 250, 252] as [number, number, number]));
    pdf.setDrawColor(...(accent ? [221, 214, 254] as [number, number, number] : [226, 232, 240] as [number, number, number]));
    pdf.roundedRect(margin, y, contentWidth, height, 2.5, 2.5, 'FD');
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(7.5);
    pdf.setTextColor(...muted);
    pdf.text(label.toUpperCase(), margin + 6, y + 6);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(9);
    pdf.setTextColor(...dark);
    pdf.text(lines, margin + 6, y + 11);
    y += height + 3;
  };

  pageHeader();
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(21);
  pdf.setTextColor(...primary);
  pdf.text('INTERVIEW RATING REPORT', margin, y);
  y += 8;
  write(`${template.name} · Template v${rating.templateVersion} · ${rating.interviewRound}`, 8.5, false, muted, margin, contentWidth, 5);

  ensure(34);
  pdf.setFillColor(248, 250, 252);
  pdf.setDrawColor(226, 232, 240);
  pdf.roundedRect(margin, y, contentWidth, 29, 3, 3, 'FD');
  const summaryTop = y + 7;
  infoCell('Candidate', candidateName || answer('applicant_name'), margin + 6, 52, summaryTop);
  infoCell('Position applied for', answer('position_applied_for'), margin + 64, 52, summaryTop);
  infoCell('Interviewer', rating.reviewerNameSnapshot || '—', margin + 122, 50, summaryTop);
  infoCell('Interview date', answer('candidate_date'), margin + 6, 52, summaryTop + 12);
  infoCell('Interviewer position', rating.reviewerPositionSnapshot || '—', margin + 64, 52, summaryTop + 12);
  infoCell('Submitted', formatSubmitted, margin + 122, 50, summaryTop + 12);
  y += 36;

  const metricWidth = 55;
  const metricGap = 6.5;
  const metric = (x: number, label: string, value: string, caption: string, fill: [number, number, number]) => {
    pdf.setFillColor(...fill);
    pdf.roundedRect(x, y, metricWidth, 30, 3, 3, 'F');
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(7);
    pdf.setTextColor(...muted);
    pdf.text(label.toUpperCase(), x + 5, y + 6);
    pdf.setFontSize(16);
    pdf.setTextColor(...primary);
    pdf.text(value, x + 5, y + 16);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(7.5);
    pdf.setTextColor(...muted);
    pdf.text(pdf.splitTextToSize(caption, metricWidth - 10), x + 5, y + 23);
  };
  metric(margin, 'Overall score', summary.overallScore === undefined ? '— / 5.0' : `${summary.overallScore.toFixed(1)} / 5.0`, 'Calculated from submitted rating criteria', pale);
  metric(margin + metricWidth + metricGap, 'Performance', summary.overallLabel || '—', answer('overall_evaluation') === '—' ? 'Score-based performance label' : `Reviewer: ${answer('overall_evaluation')}`, [240, 253, 250]);
  metric(margin + (metricWidth + metricGap) * 2, 'Status', String(rating.status), `${summary.submittedReviewers} of ${summary.totalReviewers} submitted`, [255, 251, 235]);
  y += 37;

  sectionHeading('Final Recommendation', 'Reviewer selections and the calculated decision summary remain separate and traceable.');
  detailCard('Recommendation summary', `${summary.quickRecommendation || 'No recommendation selected'} · ${summary.recommendationState}`, true);
  const recommendationTop = y;
  ensure(20);
  pdf.setFillColor(248, 250, 252);
  pdf.roundedRect(margin, y, contentWidth, 16, 2.5, 2.5, 'F');
  infoCell(fieldLabel('overall_evaluation', 'Overall evaluation'), answer('overall_evaluation'), margin + 5, 38, y + 5);
  infoCell(fieldLabel('further_interview', 'Further interview'), answer('further_interview'), margin + 50, 34, y + 5);
  infoCell(fieldLabel('active_pool', 'Active pool'), answer('active_pool'), margin + 93, 32, y + 5);
  infoCell(fieldLabel('job_offer', 'Job offer'), answer('job_offer'), margin + 135, 32, y + 5);
  y = recommendationTop + 22;

  sectionHeading('Rating Matrix', 'All scores use the original template scale; the overall score is the mean of answered criteria.');
  ensure(12);
  pdf.setFillColor(...primary);
  pdf.rect(margin, y, contentWidth, 9, 'F');
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(8);
  pdf.setTextColor(255, 255, 255);
  pdf.text('CRITERION', margin + 4, y + 6);
  pdf.text('RATING', margin + 118, y + 6);
  pdf.text('SCORE', margin + 163, y + 6);
  y += 9;
  summary.criteria.forEach((criterion, index) => {
    const description = field(criterion.id)?.description || '';
    const labelLines = pdf.splitTextToSize(criterion.label, 105) as string[];
    const descriptionLines = description ? pdf.splitTextToSize(description, 105) as string[] : [];
    const rowHeight = Math.max(12, 5 + labelLines.length * 4 + Math.min(2, descriptionLines.length) * 3.2);
    ensure(rowHeight);
    pdf.setFillColor(...(index % 2 === 0 ? [248, 250, 252] as [number, number, number] : [255, 255, 255] as [number, number, number]));
    pdf.setDrawColor(226, 232, 240);
    pdf.rect(margin, y, contentWidth, rowHeight, 'FD');
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(8.5);
    pdf.setTextColor(...dark);
    pdf.text(labelLines, margin + 4, y + 5.5);
    if (descriptionLines.length) {
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(6.8);
      pdf.setTextColor(...muted);
      pdf.text(descriptionLines.slice(0, 2), margin + 4, y + 5.5 + labelLines.length * 4);
    }
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(8.5);
    pdf.setTextColor(...dark);
    pdf.text(criterion.ratingLabel || '—', margin + 118, y + 6);
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(...primary);
    pdf.text(criterion.average === undefined ? '—' : `${criterion.average.toFixed(1)} / 5`, margin + 163, y + 6);
    y += rowHeight;
  });
  y += 4;

  sectionHeading('Interview Observations', 'Optional information is shown as — when it was not supplied.');
  [
    ['applicant_motivation', "Applicant's Motivation"],
    ['possible_reservations', 'Possible Reservations'],
    ['other_positions', 'Other Positions'],
    ['additional_comments', 'Additional Comments'],
  ].forEach(([id, fallback]) => detailCard(fieldLabel(id, fallback), answer(id)));

  sectionHeading('Availability, Assets & Limitations');
  detailCard(fieldLabel('date_available', 'Date Available'), answer('date_available'));
  detailCard(fieldLabel('apparent_assets_limitations', 'Apparent Assets and Limitations'), answer('apparent_assets_limitations'));

  sectionHeading('Reviewer Details & Acknowledgement');
  detailCard('Reviewer', `${rating.reviewerNameSnapshot || '—'} · ${rating.reviewerPositionSnapshot || '—'}\n${formatSubmitted}`);
  detailCard('Electronic acknowledgement', answers.electronic_acknowledgement === true ? 'Acknowledged' : asAnswerText(answers.electronic_acknowledgement));

  const totalPages = pdf.getNumberOfPages();
  for (let page = 1; page <= totalPages; page += 1) {
    pdf.setPage(page);
    pdf.setDrawColor(226, 232, 240);
    pdf.line(margin, 283, 194, 283);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(7.5);
    pdf.setTextColor(...muted);
    pdf.text(`TNG HRIS · ${candidateName || 'Candidate'} · Confidential`, margin, 290);
    pdf.text(`Page ${page} of ${totalPages}`, 194, 290, { align: 'right' });
  }

  if (autoDownload) pdf.save(`interview-rating-${candidateName.replace(/[^a-zA-Z0-9]+/g, '-').toLowerCase() || rating.id}.pdf`);
  return pdf.output('blob');
};

/**
 * Creates one decision-friendly PDF containing the submitted summary followed
 * by each reviewer form. The original reviewer records remain the source of
 * truth; this is only a convenient combined export.
 */
export const downloadCombinedInterviewRatingsPdf = async (
  ratings: InterviewRatingRecord[],
  candidate: Candidate,
  autoDownload = true,
): Promise<Blob> => {
  const { jsPDF } = await import('jspdf');
  const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait', compress: true });
  const summary = createInterviewRatingSummary(ratings);
  const candidateName = `${candidate.firstName} ${candidate.lastName}`.trim();
  const margin = 16;
  const width = 178;
  const lineHeight = 5;
  let y = 18;

  const newPage = () => { pdf.addPage(); y = 18; };
  const ensure = (height: number) => { if (y + height > 278) newPage(); };
  const write = (value: string, size = 10, bold = false, color = [15, 23, 42] as [number, number, number]) => {
    pdf.setFont('helvetica', bold ? 'bold' : 'normal');
    pdf.setFontSize(size);
    pdf.setTextColor(...color);
    const lines = pdf.splitTextToSize(value || 'Not provided', width) as string[];
    ensure(Math.max(lineHeight, lines.length * lineHeight + 2));
    pdf.text(lines, margin, y);
    y += lines.length * lineHeight + 2;
  };
  const labelValue = (label: string, value: unknown) => {
    write(label.toUpperCase(), 8, true, [100, 116, 139]);
    write(asAnswerText(value), 10);
  };

  pdf.setFillColor(79, 70, 229);
  pdf.rect(0, 0, 210, 10, 'F');
  write('INTERVIEW RATING SUMMARY', 18, true, [79, 70, 229]);
  write(candidateName || 'Candidate', 14, true);
  write(`Submitted reviewers: ${summary.submittedReviewers} of ${summary.totalReviewers}`, 10, false, [71, 85, 105]);
  write(summary.overallScore === undefined ? 'No interview rating submitted yet' : `Overall score: ${summary.overallScore.toFixed(1)} / 5.0 — ${summary.overallLabel}`, 11, true);
  write(`Recommendation summary: ${summary.quickRecommendation || 'No recommendation yet'} · ${summary.recommendationState}`, 10, false, [71, 85, 105]);
  ensure(14);
  write('Rating breakdown', 13, true);
  summary.criteria.forEach(criterion => write(`${criterion.label}: ${criterion.average === undefined ? 'Not answered' : `${criterion.average.toFixed(1)} / 5 — ${criterion.ratingLabel}`} (${criterion.answeredCount} answered)`, 9));

  ratings.forEach((rating, index) => {
    newPage();
    write(`Reviewer form ${index + 1} of ${ratings.length}`, 16, true, [79, 70, 229]);
    write(`${rating.reviewerNameSnapshot} · ${rating.reviewerPositionSnapshot || 'Position not recorded'}`, 11, true);
    write(`${rating.interviewRound} · Template v${rating.templateVersion} · ${rating.status}`, 9, false, [100, 116, 139]);
    labelValue('Applicant', candidateName || rating.formData.applicant_name);
    labelValue('Position Applied For', rating.formData.position_applied_for);
    labelValue('Date', rating.formData.candidate_date);
    rating.templateSnapshot.sections.forEach(section => {
      ensure(14);
      write(section.title, 13, true, [30, 41, 59]);
      section.fields.forEach(field => {
        if (field.system && field.id !== 'electronic_acknowledgement') return;
        labelValue(field.label, rating.formData[field.id]);
      });
    });
    labelValue("Interviewer's Name", rating.reviewerNameSnapshot);
    labelValue("Interviewer's Position", rating.reviewerPositionSnapshot);
    labelValue('Submission Date and Time', rating.submittedAt?.toLocaleString() || 'Not submitted');
  });

  if (autoDownload) pdf.save(`interview-ratings-${candidateName.replace(/[^a-zA-Z0-9]+/g, '-').toLowerCase() || candidate.id}.pdf`);
  return pdf.output('blob');
};

export const templateMatchesApplication = (template: InterviewRatingTemplate, application: Application, businessUnitId?: string, position?: string): boolean => {
  const matches = (values: string[], target?: string) => values.length === 0 || (!!target && values.some(value => value.toLowerCase() === target.toLowerCase()));
  return matches(template.assignmentBusinessUnitIds, businessUnitId)
    && matches(template.assignmentPositions, position || application.roleTitleSnapshot)
    && matches(template.assignmentStages, String(application.stage));
};
