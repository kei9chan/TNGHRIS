import { supabase } from './supabaseClient';
import { PulseSurvey, SurveyResponse, PulseSurveyStatus } from '../types';

// ---------------------------------------------------------------------------
// Row Types
// ---------------------------------------------------------------------------
type PulseSurveyRow = {
  id: string; title: string; description: string; start_date: string;
  end_date?: string | null; status: string; is_anonymous: boolean;
  sections: any; target_departments?: any; created_by_user_id: string;
  created_at: string;
};

type SurveyResponseRow = {
  id: string; survey_id: string; respondent_id: string;
  submitted_at: string; answers: any; comments?: string | null;
};

// ---------------------------------------------------------------------------
// Mappers
// ---------------------------------------------------------------------------
const mapPulseSurvey = (r: PulseSurveyRow): PulseSurvey => ({
  id: r.id, title: r.title, description: r.description,
  startDate: new Date(r.start_date),
  endDate: r.end_date ? new Date(r.end_date) : undefined,
  status: r.status as PulseSurveyStatus,
  isAnonymous: r.is_anonymous,
  sections: Array.isArray(r.sections) ? r.sections : [],
  targetDepartments: Array.isArray(r.target_departments) ? r.target_departments : [],
  createdByUserId: r.created_by_user_id,
  createdAt: new Date(r.created_at),
});

const mapSurveyResponse = (r: SurveyResponseRow): SurveyResponse => ({
  id: r.id, surveyId: r.survey_id, respondentId: r.respondent_id,
  submittedAt: new Date(r.submitted_at),
  answers: Array.isArray(r.answers) ? r.answers : [],
  comments: r.comments || undefined,
});

// ---------------------------------------------------------------------------
// Service Methods
// ---------------------------------------------------------------------------

export const fetchPulseSurveys = async (): Promise<PulseSurvey[]> => {
  const { data, error } = await supabase.from('pulse_surveys').select('*').order('start_date', { ascending: false });
  if (error) throw new Error(error.message);
  return (data as PulseSurveyRow[]).map(mapPulseSurvey);
};

export const savePulseSurvey = async (survey: Partial<PulseSurvey>): Promise<PulseSurvey> => {
  const payload = {
    title: survey.title, description: survey.description,
    start_date: survey.startDate ? new Date(survey.startDate).toISOString().split('T')[0] : null,
    end_date: survey.endDate ? new Date(survey.endDate).toISOString().split('T')[0] : null,
    status: survey.status || 'Draft',
    is_anonymous: survey.isAnonymous ?? true,
    sections: survey.sections || [],
    target_departments: survey.targetDepartments || [],
    created_by_user_id: survey.createdByUserId,
  };
  const { data, error } = survey.id
    ? await supabase.from('pulse_surveys').update(payload).eq('id', survey.id).select().single()
    : await supabase.from('pulse_surveys').insert(payload).select().single();
  if (error) throw new Error(error.message);
  return mapPulseSurvey(data as PulseSurveyRow);
};

export const fetchSurveyResponses = async (surveyId?: string): Promise<SurveyResponse[]> => {
  let query = supabase.from('survey_responses').select('*').order('submitted_at', { ascending: false });
  if (surveyId) query = query.eq('survey_id', surveyId);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data as SurveyResponseRow[]).map(mapSurveyResponse);
};

export const saveSurveyResponse = async (response: Partial<SurveyResponse>): Promise<SurveyResponse> => {
  const payload = {
    survey_id: response.surveyId,
    respondent_id: response.respondentId,
    submitted_at: new Date().toISOString(),
    answers: response.answers || [],
    comments: response.comments || null,
  };
  const { data, error } = response.id
    ? await supabase.from('survey_responses').update(payload).eq('id', response.id).select().single()
    : await supabase.from('survey_responses').insert(payload).select().single();
  if (error) throw new Error(error.message);
  return mapSurveyResponse(data as SurveyResponseRow);
};
