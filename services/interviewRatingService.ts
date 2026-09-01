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
  if (value === undefined || value === null || value === '') return 'Not provided';
  if (typeof value === 'object') {
    const object = value as Record<string, unknown>;
    if (object.label !== undefined) return `${String(object.label)} (${String(object.value ?? '')})`;
    return JSON.stringify(value);
  }
  return String(value);
};

export const downloadInterviewRatingPdf = async (rating: InterviewRatingRecord, candidate: Candidate, autoDownload = true): Promise<Blob> => {
  const { jsPDF } = await import('jspdf');
  const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait', compress: true });
  const margin = 16;
  const contentWidth = 178;
  let y = 18;
  const answers = rating.formData || {};
  const template = rating.templateSnapshot;
  const candidateName = `${candidate.firstName} ${candidate.lastName}`.trim();
  const lineHeight = 5;

  const ensure = (height: number) => {
    if (y + height > 278) { pdf.addPage(); y = 18; }
  };
  const text = (value: string, size = 10, bold = false, color = [15, 23, 42] as [number, number, number]) => {
    pdf.setFont('helvetica', bold ? 'bold' : 'normal');
    pdf.setFontSize(size);
    pdf.setTextColor(...color);
    const lines = pdf.splitTextToSize(value || 'Not provided', contentWidth) as string[];
    ensure(Math.max(lineHeight, lines.length * lineHeight + 2));
    pdf.text(lines, margin, y);
    y += lines.length * lineHeight + 2;
  };
  const labelValue = (label: string, value: unknown) => {
    ensure(11);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(8);
    pdf.setTextColor(100, 116, 139);
    pdf.text(label.toUpperCase(), margin, y);
    y += 4;
    text(asAnswerText(value), 10);
  };

  pdf.setFillColor(79, 70, 229);
  pdf.rect(0, 0, 210, 10, 'F');
  text('INTERVIEW RATING FORM', 18, true, [79, 70, 229]);
  text(template.name, 10, false, [71, 85, 105]);
  text(`Template version ${rating.templateVersion} · ${rating.interviewRound}`, 9, false, [100, 116, 139]);

  labelValue('Applicant', candidateName || answers.applicant_name);
  labelValue('Position Applied For', answers.position_applied_for);
  labelValue('Date', answers.candidate_date);

  for (const section of template.sections) {
    ensure(14);
    text(section.title, 13, true, [30, 41, 59]);
    if (section.description) text(section.description, 8, false, [100, 116, 139]);
    for (const field of section.fields) {
      if (field.system && field.id !== 'electronic_acknowledgement') continue;
      labelValue(field.label, answers[field.id]);
    }
  }

  ensure(18);
  text('Reviewer Information', 13, true, [30, 41, 59]);
  labelValue("Interviewer's Name", rating.reviewerNameSnapshot);
  labelValue("Interviewer's Position", rating.reviewerPositionSnapshot);
  labelValue('Submission Date and Time', rating.submittedAt?.toLocaleString() || 'Not submitted');
  labelValue('Electronic Acknowledgement', answers.electronic_acknowledgement === true ? 'Acknowledged' : 'Not acknowledged');
  if (autoDownload) pdf.save(`interview-rating-${candidateName.replace(/[^a-zA-Z0-9]+/g, '-').toLowerCase() || rating.id}.pdf`);
  return pdf.output('blob');
};

export const templateMatchesApplication = (template: InterviewRatingTemplate, application: Application, businessUnitId?: string, position?: string): boolean => {
  const matches = (values: string[], target?: string) => values.length === 0 || (!!target && values.some(value => value.toLowerCase() === target.toLowerCase()));
  return matches(template.assignmentBusinessUnitIds, businessUnitId)
    && matches(template.assignmentPositions, position || application.roleTitleSnapshot)
    && matches(template.assignmentStages, String(application.stage));
};
