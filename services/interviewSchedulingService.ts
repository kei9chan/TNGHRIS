import { ApplicationStage, Interview, User } from '../types';
import { supabase } from './supabaseClient';

export interface InterviewCandidateOption {
  appId: string;
  candidateName: string;
  firstName: string;
  email: string;
  position: string;
  businessUnitId?: string;
  businessUnitName: string;
  departmentId?: string;
  departmentName?: string;
  stage: ApplicationStage;
}

export interface InterviewScheduleOptions {
  createCalendarEvent: boolean;
  includeScheduler: boolean;
}

export interface InterviewScheduleOutcome {
  row: any;
  warning?: string;
}

const getFunctionErrorMessage = async (error: any): Promise<string> => {
  try {
    const payload = await error?.context?.json?.();
    return payload?.error || payload?.message || error?.message || 'Unable to schedule interview.';
  } catch {
    return error?.message || 'Unable to schedule interview.';
  }
};

export const scheduleInterviewWorkflow = async ({
  interview,
  options,
  applicant,
  panel,
}: {
  interview: Interview;
  options: InterviewScheduleOptions;
  applicant: InterviewCandidateOption;
  panel: User[];
}): Promise<InterviewScheduleOutcome> => {
  const { data, error } = await supabase.functions.invoke('schedule-interview', {
    body: {
      interviewId: interview.id || null,
      applicationId: interview.applicationId,
      panelUserIds: interview.panelUserIds,
      startAt: new Date(interview.scheduledStart).toISOString(),
      endAt: new Date(interview.scheduledEnd).toISOString(),
      interviewType: interview.interviewType,
      location: interview.location || null,
      notes: interview.notes || null,
      createCalendarEvent: options.createCalendarEvent,
      includeScheduler: options.includeScheduler,
    },
  });
  if (error) throw new Error(await getFunctionErrorMessage(error));
  if (!data?.interview) throw new Error(data?.error || 'The interview could not be saved.');

  return { row: data.interview, warning: data.warning || undefined };
};
