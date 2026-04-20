import { supabase } from './supabaseClient';
import { Evaluation, EvaluationSubmission, EvaluationTimeline, QuestionSet, EvaluationQuestion, EvaluatorConfig } from '../types';

// ---------------------------------------------------------------------------
// Row Types
// ---------------------------------------------------------------------------
type EvaluationRow = {
  id: string;
  name: string;
  timeline_id: string;
  target_business_unit_ids: any;
  target_employee_ids: any;
  question_set_ids: any;
  evaluators: any;
  status: string;
  created_at: string;
  updated_at?: string | null;
  is_employee_visible: boolean;
  acknowledged_by?: any;
  due_date?: string | null;
};

type EvaluationSubmissionRow = {
  id: string;
  evaluation_id: string;
  subject_employee_id: string;
  rater_id: string;
  rater_group: string;
  scores: any;
  submitted_at: string;
};

type EvaluationTimelineRow = {
  id: string;
  business_unit_id: string;
  name: string;
  type: string;
  rollout_date: string;
  end_date: string;
  status: string;
};

type QuestionSetRow = {
  id: string;
  business_unit_id: string;
  name: string;
  description: string;
};

type EvaluationQuestionRow = {
  id: string;
  question_set_id: string;
  title: string;
  description: string;
  question_type: string;
  is_archived: boolean;
  target_employee_levels: any;
  target_evaluator_roles: any;
};

// ---------------------------------------------------------------------------
// Mappers
// ---------------------------------------------------------------------------
const mapEvaluation = (row: EvaluationRow): Evaluation => ({
  id: row.id,
  name: row.name,
  timelineId: row.timeline_id,
  targetBusinessUnitIds: Array.isArray(row.target_business_unit_ids) ? row.target_business_unit_ids : [],
  targetEmployeeIds: Array.isArray(row.target_employee_ids) ? row.target_employee_ids : [],
  questionSetIds: Array.isArray(row.question_set_ids) ? row.question_set_ids : [],
  evaluators: Array.isArray(row.evaluators) ? (row.evaluators as EvaluatorConfig[]) : [],
  status: row.status as 'InProgress' | 'Completed',
  createdAt: new Date(row.created_at),
  updatedAt: row.updated_at ? new Date(row.updated_at) : undefined,
  isEmployeeVisible: row.is_employee_visible,
  acknowledgedBy: Array.isArray(row.acknowledged_by) ? row.acknowledged_by : [],
  dueDate: row.due_date ? new Date(row.due_date) : undefined,
});

const mapEvaluationSubmission = (row: EvaluationSubmissionRow): EvaluationSubmission => ({
  id: row.id,
  evaluationId: row.evaluation_id,
  subjectEmployeeId: row.subject_employee_id,
  raterId: row.rater_id,
  raterGroup: row.rater_group as any,
  scores: Array.isArray(row.scores) ? row.scores : [],
  submittedAt: new Date(row.submitted_at),
});

const mapEvaluationTimeline = (row: EvaluationTimelineRow): EvaluationTimeline => ({
  id: row.id,
  businessUnitId: row.business_unit_id,
  name: row.name,
  type: row.type as any,
  rolloutDate: new Date(row.rollout_date),
  endDate: new Date(row.end_date),
  status: row.status as any,
});

const mapQuestionSet = (row: QuestionSetRow): QuestionSet => ({
  id: row.id,
  businessUnitId: row.business_unit_id,
  name: row.name,
  description: row.description,
});

const mapEvaluationQuestion = (row: EvaluationQuestionRow): EvaluationQuestion => ({
  id: row.id,
  questionSetId: row.question_set_id,
  title: row.title,
  description: row.description,
  questionType: row.question_type as 'rating' | 'paragraph',
  isArchived: row.is_archived,
  targetEmployeeLevels: Array.isArray(row.target_employee_levels) ? row.target_employee_levels : [],
  targetEvaluatorRoles: Array.isArray(row.target_evaluator_roles) ? row.target_evaluator_roles : [],
});

// ---------------------------------------------------------------------------
// Service Methods
// ---------------------------------------------------------------------------

export const fetchEvaluations = async (): Promise<Evaluation[]> => {
  const { data, error } = await supabase.from('evaluations').select('*').order('created_at', { ascending: false });
  if (error) throw new Error(error.message || 'Failed to fetch evaluations');
  return (data as EvaluationRow[]).map(mapEvaluation);
};

export const saveEvaluation = async (evaluation: Partial<Evaluation>): Promise<Evaluation> => {
  const payload = {
    name: evaluation.name,
    timeline_id: evaluation.timelineId,
    target_business_unit_ids: evaluation.targetBusinessUnitIds || [],
    target_employee_ids: evaluation.targetEmployeeIds || [],
    question_set_ids: evaluation.questionSetIds || [],
    evaluators: evaluation.evaluators || [],
    status: evaluation.status || 'InProgress',
    is_employee_visible: evaluation.isEmployeeVisible ?? false,
    acknowledged_by: evaluation.acknowledgedBy || [],
    due_date: evaluation.dueDate ? new Date(evaluation.dueDate).toISOString() : null,
  };

  const { data, error } = evaluation.id
    ? await supabase.from('evaluations').update(payload).eq('id', evaluation.id).select().single()
    : await supabase.from('evaluations').insert(payload).select().single();

  if (error) throw new Error(error.message || 'Failed to save evaluation');
  return mapEvaluation(data as EvaluationRow);
};

export const fetchEvaluationSubmissions = async (evaluationId?: string): Promise<EvaluationSubmission[]> => {
  let query = supabase.from('evaluation_submissions').select('*').order('submitted_at', { ascending: false });
  if (evaluationId) query = query.eq('evaluation_id', evaluationId);
  const { data, error } = await query;
  if (error) throw new Error(error.message || 'Failed to fetch evaluation submissions');
  return (data as EvaluationSubmissionRow[]).map(mapEvaluationSubmission);
};

export const saveEvaluationSubmission = async (submission: Partial<EvaluationSubmission>): Promise<EvaluationSubmission> => {
  const payload = {
    evaluation_id: submission.evaluationId,
    subject_employee_id: submission.subjectEmployeeId,
    rater_id: submission.raterId,
    rater_group: submission.raterGroup,
    scores: submission.scores || [],
    submitted_at: new Date().toISOString(),
  };

  const { data, error } = submission.id
    ? await supabase.from('evaluation_submissions').update(payload).eq('id', submission.id).select().single()
    : await supabase.from('evaluation_submissions').insert(payload).select().single();

  if (error) throw new Error(error.message || 'Failed to save evaluation submission');
  return mapEvaluationSubmission(data as EvaluationSubmissionRow);
};

export const fetchEvaluationTimelines = async (): Promise<EvaluationTimeline[]> => {
  const { data, error } = await supabase.from('evaluation_timelines').select('*').order('rollout_date', { ascending: false });
  if (error) throw new Error(error.message || 'Failed to fetch evaluation timelines');
  return (data as EvaluationTimelineRow[]).map(mapEvaluationTimeline);
};

export const saveEvaluationTimeline = async (timeline: Partial<EvaluationTimeline>): Promise<EvaluationTimeline> => {
  const payload = {
    business_unit_id: timeline.businessUnitId,
    name: timeline.name,
    type: timeline.type,
    rollout_date: timeline.rolloutDate ? new Date(timeline.rolloutDate).toISOString().split('T')[0] : null,
    end_date: timeline.endDate ? new Date(timeline.endDate).toISOString().split('T')[0] : null,
    status: timeline.status || 'Draft',
  };

  const { data, error } = timeline.id
    ? await supabase.from('evaluation_timelines').update(payload).eq('id', timeline.id).select().single()
    : await supabase.from('evaluation_timelines').insert(payload).select().single();

  if (error) throw new Error(error.message || 'Failed to save evaluation timeline');
  return mapEvaluationTimeline(data as EvaluationTimelineRow);
};

export const fetchQuestionSets = async (): Promise<QuestionSet[]> => {
  const { data, error } = await supabase.from('question_sets').select('*').order('name', { ascending: true });
  if (error) throw new Error(error.message || 'Failed to fetch question sets');
  return (data as QuestionSetRow[]).map(mapQuestionSet);
};

export const fetchEvaluationQuestions = async (questionSetId?: string): Promise<EvaluationQuestion[]> => {
  let query = supabase.from('evaluation_questions').select('*').order('title', { ascending: true });
  if (questionSetId) query = query.eq('question_set_id', questionSetId);
  const { data, error } = await query;
  if (error) throw new Error(error.message || 'Failed to fetch evaluation questions');
  return (data as EvaluationQuestionRow[]).map(mapEvaluationQuestion);
};
