import { supabase } from './supabaseClient';
import {
  JobRequisition, JobPost, Candidate, Application, Interview, InterviewFeedback, Offer,
  JobPostVisualTemplate, ApplicantPageTheme,
  JobRequisitionStatus, JobPostStatus, ApplicationStage, InterviewStatus, OfferStatus, CandidateSource
} from '../types';

// ---------------------------------------------------------------------------
// Row Types
// ---------------------------------------------------------------------------
type JobRequisitionRow = {
  id: string; req_code: string; title: string; department_id: string; business_unit_id: string;
  headcount: number; employment_type: string; location_type: string; work_location: string;
  budgeted_salary_min: number; budgeted_salary_max: number; justification: string;
  created_by_user_id: string; status: string; created_at: string; updated_at: string;
  is_urgent?: boolean | null; routing_steps: any;
};

type JobPostRow = {
  id: string; requisition_id: string; business_unit_id: string; title: string; slug: string;
  description: string; requirements: string; benefits: string; location_label: string;
  employment_type: string; status: string; published_at?: string | null;
  channels: any; referral_bonus?: number | null;
};

type CandidateRow = {
  id: string; first_name: string; last_name: string; email: string; phone: string;
  source: string; tags: any; portfolio_url?: string | null; consent_at?: string | null;
};

type ApplicationRow = {
  id: string; candidate_id: string; job_post_id: string; requisition_id: string;
  stage: string; owner_user_id?: string | null; created_at: string; updated_at: string;
  notes?: string | null; referrer?: string | null;
};

type InterviewRow = {
  id: string; application_id: string; interview_type: string; scheduled_start: string;
  scheduled_end: string; location: string; panel_user_ids: any;
  calendar_event_id?: string | null; status: string;
};

type InterviewFeedbackRow = {
  id: string; interview_id: string; reviewer_user_id: string; score: number;
  competency_scores?: any; strengths: string; concerns: string;
  hire_recommendation: string; submitted_at: string;
};

type OfferRow = {
  id: string; application_id: string; offer_number: string; base_pay: number;
  allowance_json: string; start_date: string; probation_months: number;
  employment_type: string; status: string; reporting_to?: string | null;
  job_description?: string | null; payment_schedule?: string | null;
  additional_pay_info?: string | null; work_schedule_days?: string | null;
  work_schedule_hours?: string | null; work_location?: string | null;
  company_benefits?: string | null; pre_employment_requirements?: string | null;
  signatory_name?: string | null; signatory_position?: string | null;
  special_clauses?: string | null;
};

// ---------------------------------------------------------------------------
// Mappers
// ---------------------------------------------------------------------------
const mapJobRequisition = (r: JobRequisitionRow): JobRequisition => ({
  id: r.id, reqCode: r.req_code, title: r.title, departmentId: r.department_id,
  businessUnitId: r.business_unit_id, headcount: r.headcount,
  employmentType: r.employment_type as any, locationType: r.location_type as any,
  workLocation: r.work_location, budgetedSalaryMin: r.budgeted_salary_min,
  budgetedSalaryMax: r.budgeted_salary_max, justification: r.justification,
  createdByUserId: r.created_by_user_id, status: r.status as JobRequisitionStatus,
  createdAt: new Date(r.created_at), updatedAt: new Date(r.updated_at),
  isUrgent: r.is_urgent ?? false,
  routingSteps: Array.isArray(r.routing_steps) ? r.routing_steps : [],
});

const mapJobPost = (r: JobPostRow): JobPost => ({
  id: r.id, requisitionId: r.requisition_id, businessUnitId: r.business_unit_id,
  title: r.title, slug: r.slug, description: r.description, requirements: r.requirements,
  benefits: r.benefits, locationLabel: r.location_label,
  employmentType: r.employment_type as any, status: r.status as JobPostStatus,
  publishedAt: r.published_at ? new Date(r.published_at) : undefined,
  channels: r.channels || { careerSite: false, qr: false, social: false, jobBoards: false },
  referralBonus: r.referral_bonus ?? undefined,
});

const mapCandidate = (r: CandidateRow): Candidate => ({
  id: r.id, firstName: r.first_name, lastName: r.last_name, email: r.email, phone: r.phone,
  source: r.source as CandidateSource,
  tags: Array.isArray(r.tags) ? r.tags : [],
  portfolioUrl: r.portfolio_url || undefined,
  consentAt: r.consent_at ? new Date(r.consent_at) : undefined,
});

const mapApplication = (r: ApplicationRow): Application => ({
  id: r.id, candidateId: r.candidate_id, jobPostId: r.job_post_id,
  requisitionId: r.requisition_id, stage: r.stage as ApplicationStage,
  ownerUserId: r.owner_user_id || undefined,
  createdAt: new Date(r.created_at), updatedAt: new Date(r.updated_at),
  notes: r.notes || undefined, referrer: r.referrer || undefined,
});

const mapInterview = (r: InterviewRow): Interview => ({
  id: r.id, applicationId: r.application_id,
  interviewType: r.interview_type as any,
  scheduledStart: new Date(r.scheduled_start), scheduledEnd: new Date(r.scheduled_end),
  location: r.location,
  panelUserIds: Array.isArray(r.panel_user_ids) ? r.panel_user_ids : [],
  calendarEventId: r.calendar_event_id || undefined,
  status: r.status as InterviewStatus,
});

const mapInterviewFeedback = (r: InterviewFeedbackRow): InterviewFeedback => ({
  id: r.id, interviewId: r.interview_id, reviewerUserId: r.reviewer_user_id,
  score: r.score, competencyScores: r.competency_scores || undefined,
  strengths: r.strengths, concerns: r.concerns,
  hireRecommendation: r.hire_recommendation as any,
  submittedAt: new Date(r.submitted_at),
});

const mapOffer = (r: OfferRow): Offer => ({
  id: r.id, applicationId: r.application_id, offerNumber: r.offer_number,
  basePay: r.base_pay, allowanceJSON: r.allowance_json,
  startDate: new Date(r.start_date), probationMonths: r.probation_months,
  employmentType: r.employment_type as any, status: r.status as OfferStatus,
  reportingTo: r.reporting_to || undefined, jobDescription: r.job_description || undefined,
  paymentSchedule: r.payment_schedule || undefined,
  additionalPayInfo: r.additional_pay_info || undefined,
  workScheduleDays: r.work_schedule_days || undefined,
  workScheduleHours: r.work_schedule_hours || undefined,
  workLocation: r.work_location || undefined,
  companyBenefits: r.company_benefits || undefined,
  preEmploymentRequirements: r.pre_employment_requirements || undefined,
  signatoryName: r.signatory_name || undefined,
  signatoryPosition: r.signatory_position || undefined,
  specialClauses: r.special_clauses || undefined,
});

// ---------------------------------------------------------------------------
// Service Methods
// ---------------------------------------------------------------------------
export const fetchJobRequisitions = async (): Promise<JobRequisition[]> => {
  const { data, error } = await supabase.from('job_requisitions').select('*').order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data as JobRequisitionRow[]).map(mapJobRequisition);
};

export const saveJobRequisition = async (req: Partial<JobRequisition>): Promise<JobRequisition> => {
  const payload = {
    req_code: req.reqCode, title: req.title, department_id: req.departmentId,
    business_unit_id: req.businessUnitId, headcount: req.headcount,
    employment_type: req.employmentType, location_type: req.locationType,
    work_location: req.workLocation, budgeted_salary_min: req.budgetedSalaryMin,
    budgeted_salary_max: req.budgetedSalaryMax, justification: req.justification,
    created_by_user_id: req.createdByUserId, status: req.status,
    is_urgent: req.isUrgent ?? false, routing_steps: req.routingSteps || [],
  };
  const { data, error } = req.id
    ? await supabase.from('job_requisitions').update(payload).eq('id', req.id).select().single()
    : await supabase.from('job_requisitions').insert(payload).select().single();
  if (error) throw new Error(error.message);
  return mapJobRequisition(data as JobRequisitionRow);
};

export const fetchJobPosts = async (): Promise<JobPost[]> => {
  const { data, error } = await supabase.from('job_posts').select('*').order('title', { ascending: true });
  if (error) throw new Error(error.message);
  return (data as JobPostRow[]).map(mapJobPost);
};

export const saveJobPost = async (post: Partial<JobPost>): Promise<JobPost> => {
  const payload = {
    requisition_id: post.requisitionId, business_unit_id: post.businessUnitId,
    title: post.title, slug: post.slug, description: post.description,
    requirements: post.requirements, benefits: post.benefits,
    location_label: post.locationLabel, employment_type: post.employmentType,
    status: post.status, channels: post.channels || {},
    referral_bonus: post.referralBonus ?? null,
  };
  const { data, error } = post.id
    ? await supabase.from('job_posts').update(payload).eq('id', post.id).select().single()
    : await supabase.from('job_posts').insert(payload).select().single();
  if (error) throw new Error(error.message);
  return mapJobPost(data as JobPostRow);
};

export const fetchCandidates = async (): Promise<Candidate[]> => {
  const { data, error } = await supabase.from('candidates').select('*').order('last_name', { ascending: true });
  if (error) throw new Error(error.message);
  return (data as CandidateRow[]).map(mapCandidate);
};

export const fetchApplications = async (): Promise<Application[]> => {
  const { data, error } = await supabase.from('applications').select('*').order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data as ApplicationRow[]).map(mapApplication);
};

export const saveApplication = async (app: Partial<Application>): Promise<Application> => {
  const payload = {
    candidate_id: app.candidateId, job_post_id: app.jobPostId,
    requisition_id: app.requisitionId, stage: app.stage,
    owner_user_id: app.ownerUserId || null, notes: app.notes || null,
    referrer: app.referrer || null,
  };
  const { data, error } = app.id
    ? await supabase.from('applications').update(payload).eq('id', app.id).select().single()
    : await supabase.from('applications').insert(payload).select().single();
  if (error) throw new Error(error.message);
  return mapApplication(data as ApplicationRow);
};

export const fetchInterviews = async (): Promise<Interview[]> => {
  const { data, error } = await supabase.from('interviews').select('*').order('scheduled_start', { ascending: false });
  if (error) throw new Error(error.message);
  return (data as InterviewRow[]).map(mapInterview);
};

export const fetchInterviewFeedbacks = async (): Promise<InterviewFeedback[]> => {
  const { data, error } = await supabase.from('interview_feedbacks').select('*').order('submitted_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data as InterviewFeedbackRow[]).map(mapInterviewFeedback);
};

export const fetchOffers = async (): Promise<Offer[]> => {
  const { data, error } = await supabase.from('offers').select('*').order('start_date', { ascending: false });
  if (error) throw new Error(error.message);
  return (data as OfferRow[]).map(mapOffer);
};

export const saveOffer = async (offer: Partial<Offer>): Promise<Offer> => {
  const payload = {
    application_id: offer.applicationId, offer_number: offer.offerNumber,
    base_pay: offer.basePay, allowance_json: offer.allowanceJSON,
    start_date: offer.startDate ? new Date(offer.startDate).toISOString().split('T')[0] : null,
    probation_months: offer.probationMonths, employment_type: offer.employmentType,
    status: offer.status, reporting_to: offer.reportingTo || null,
    job_description: offer.jobDescription || null,
    payment_schedule: offer.paymentSchedule || null,
    additional_pay_info: offer.additionalPayInfo || null,
    work_schedule_days: offer.workScheduleDays || null,
    work_schedule_hours: offer.workScheduleHours || null,
    work_location: offer.workLocation || null,
    company_benefits: offer.companyBenefits || null,
    pre_employment_requirements: offer.preEmploymentRequirements || null,
    signatory_name: offer.signatoryName || null,
    signatory_position: offer.signatoryPosition || null,
    special_clauses: offer.specialClauses || null,
  };
  const { data, error } = offer.id
    ? await supabase.from('offers').update(payload).eq('id', offer.id).select().single()
    : await supabase.from('offers').insert(payload).select().single();
  if (error) throw new Error(error.message);
  return mapOffer(data as OfferRow);
};

// Visual Templates & Applicant Pages (JSONB-heavy, stored as-is)
export const fetchJobPostVisualTemplates = async (): Promise<JobPostVisualTemplate[]> => {
  const { data, error } = await supabase.from('job_post_visual_templates').select('*').order('name', { ascending: true });
  if (error) throw new Error(error.message);
  return (data || []) as JobPostVisualTemplate[];
};

export const fetchApplicantPageThemes = async (): Promise<ApplicantPageTheme[]> => {
  const { data, error } = await supabase.from('applicant_page_themes').select('*').order('name', { ascending: true });
  if (error) throw new Error(error.message);
  return (data || []) as ApplicantPageTheme[];
};
