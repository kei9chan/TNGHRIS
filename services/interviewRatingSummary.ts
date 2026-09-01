import { InterviewRatingRecord, InterviewTemplateField } from '../types';

export const INTERVIEW_RATING_SCALE = [
  { label: 'Very Good', value: 5 },
  { label: 'Good', value: 4 },
  { label: 'Average', value: 3 },
  { label: 'Poor', value: 2 },
  { label: 'Very Poor', value: 1 },
] as const;

export const INTERVIEW_RATING_CRITERIA = [
  { id: 'first_impression', label: 'First Impression' },
  { id: 'appearance', label: 'Appearance' },
  { id: 'self_expression_communication', label: 'Self-Expression/Communication' },
  { id: 'behaviour', label: 'Behaviour' },
  { id: 'responsiveness', label: 'Responsiveness' },
  { id: 'background', label: 'Background' },
  { id: 'track_record', label: 'Track Record' },
  { id: 'teamwork', label: 'Teamwork' },
] as const;

export const INTERVIEW_WRITTEN_FIELDS = [
  { id: 'applicant_motivation', label: "Applicant's Motivation" },
  { id: 'possible_reservations', label: 'Possible Reservations' },
  { id: 'other_positions', label: 'Other Positions' },
  { id: 'apparent_assets_limitations', label: 'Apparent Assets and Limitations' },
  { id: 'additional_comments', label: 'Additional Comments' },
] as const;

export type InterviewSummaryStatus = 'Complete' | 'In Progress' | 'Pending';
export type InterviewRecommendationKey = 'further_interview' | 'active_pool' | 'job_offer';

export interface InterviewCriterionResponse {
  ratingId: string;
  reviewerName: string;
  value: number;
  label: string;
}

export interface InterviewCriterionSummary {
  id: string;
  label: string;
  average?: number;
  ratingLabel?: string;
  answeredCount: number;
  reviewerCount: number;
  percentage?: number;
  responses: InterviewCriterionResponse[];
}

export interface InterviewReviewerSummary {
  id: string;
  name: string;
  position: string;
  status: InterviewRatingRecord['status'];
  submittedAt?: Date;
  score?: number;
  overallEvaluation?: string;
  recommendations: Record<InterviewRecommendationKey, string>;
  formData: Record<string, unknown>;
  interviewRound: string;
}

export interface InterviewWrittenHighlight {
  id: string;
  label: string;
  responseCount: number;
  summary: string;
  responses: Array<{ ratingId: string; reviewerName: string; text: string }>;
}

export interface InterviewRatingSummary {
  totalReviewers: number;
  submittedReviewers: number;
  status: InterviewSummaryStatus;
  preliminary: boolean;
  overallScore?: number;
  overallLabel?: string;
  quickRecommendation?: string;
  recommendationState: string;
  criteria: InterviewCriterionSummary[];
  reviewers: InterviewReviewerSummary[];
  writtenHighlights: InterviewWrittenHighlight[];
}

const asText = (value: unknown): string => {
  if (value === undefined || value === null || value === '') return '';
  if (typeof value === 'object') {
    const object = value as Record<string, unknown>;
    if (object.label !== undefined) return String(object.label);
    if (object.value !== undefined) return String(object.value);
    return '';
  }
  return String(value);
};

const ratingValue = (value: unknown): number | undefined => {
  if (typeof value === 'number' && Number.isFinite(value)) return value >= 1 && value <= 5 ? value : undefined;
  if (typeof value === 'object' && value !== null) {
    const object = value as Record<string, unknown>;
    const nested = ratingValue(object.value);
    if (nested !== undefined) return nested;
    return ratingValue(object.label);
  }
  if (typeof value !== 'string') return undefined;
  const numeric = Number(value);
  if (Number.isFinite(numeric) && numeric >= 1 && numeric <= 5) return numeric;
  const option = INTERVIEW_RATING_SCALE.find(item => item.label.toLowerCase() === value.trim().toLowerCase());
  return option?.value;
};

const ratingLabel = (value: number): string => {
  return INTERVIEW_RATING_SCALE.reduce((closest, option) =>
    Math.abs(option.value - value) < Math.abs(closest.value - value) ? option : closest
  ).label;
};

const round = (value: number) => Math.round(value * 10) / 10;

const isSubmitted = (rating: InterviewRatingRecord) => rating.status === 'Submitted' || rating.status === 'Locked';

const templateRatingFields = (rating: InterviewRatingRecord): InterviewTemplateField[] => rating.templateSnapshot.sections
  .flatMap(section => section.fields)
  .filter(field => field.type === 'rating');

const fieldLabel = (rating: InterviewRatingRecord, id: string, fallback: string) =>
  templateRatingFields(rating).find(field => field.id === id)?.label || fallback;

const yesNo = (value: unknown): string => {
  const text = asText(value).trim().toLowerCase();
  if (text === 'yes' || text === 'true') return 'Yes';
  if (text === 'no' || text === 'false') return 'No';
  return asText(value) || 'Not answered';
};

const recommendationLabel = (key: InterviewRecommendationKey) => ({
  job_offer: 'Job Offer',
  further_interview: 'Further Interview',
  active_pool: 'Active Pool',
}[key]);

const recommendationSignature = (reviewer: InterviewReviewerSummary) =>
  (['further_interview', 'active_pool', 'job_offer'] as InterviewRecommendationKey[])
    .map(key => reviewer.recommendations[key])
    .join('|');

const buildRecommendationSummary = (reviewers: InterviewReviewerSummary[]) => {
  if (!reviewers.length) return { quickRecommendation: undefined, recommendationState: 'No recommendation yet' };
  const signatures = new Set(reviewers.map(recommendationSignature));
  const counts = (['job_offer', 'further_interview', 'active_pool'] as InterviewRecommendationKey[])
    .map(key => ({ key, count: reviewers.filter(reviewer => reviewer.recommendations[key] === 'Yes').length }))
    .sort((a, b) => b.count - a.count);
  const winner = counts[0];
  const tied = counts.filter(item => item.count === winner.count).length > 1;
  const hasMajority = winner.count > reviewers.length / 2;
  const consensus = signatures.size === 1;

  if (consensus && winner.count === 0) {
    return { quickRecommendation: 'No recommendation selected', recommendationState: 'Consensus reached' };
  }
  if (tied || !hasMajority) {
    return { quickRecommendation: 'Mixed reviewer recommendation', recommendationState: 'Mixed recommendation' };
  }
  return {
    quickRecommendation: `Recommended for ${winner.key === 'job_offer' ? 'Job Offer' : recommendationLabel(winner.key)}`,
    recommendationState: consensus ? 'Consensus reached' : `Majority recommendation: ${recommendationLabel(winner.key)}`,
  };
};

export const getInterviewRatingValue = ratingValue;
export const getInterviewRatingLabel = ratingLabel;
export const getInterviewAnswerText = asText;

export const createInterviewRatingSummary = (ratings: InterviewRatingRecord[]): InterviewRatingSummary => {
  const submitted = ratings.filter(isSubmitted);
  const submittedIds = new Set(submitted.map(rating => rating.id));
  const reviewers: InterviewReviewerSummary[] = ratings.map(rating => {
    const submittedRating = submittedIds.has(rating.id);
    return {
      id: rating.id,
      name: rating.reviewerNameSnapshot,
      position: rating.reviewerPositionSnapshot,
      status: rating.status,
      submittedAt: submittedRating ? rating.submittedAt : undefined,
      score: undefined,
      overallEvaluation: submittedRating ? asText(rating.formData.overall_evaluation) || undefined : undefined,
      recommendations: {
        further_interview: submittedRating ? yesNo(rating.formData.further_interview) : 'Not answered',
        active_pool: submittedRating ? yesNo(rating.formData.active_pool) : 'Not answered',
        job_offer: submittedRating ? yesNo(rating.formData.job_offer) : 'Not answered',
      },
      formData: submittedRating ? rating.formData : {},
      interviewRound: rating.interviewRound,
    };
  });

  const criteria: InterviewCriterionSummary[] = INTERVIEW_RATING_CRITERIA.map(criterion => {
    const responses = submitted.flatMap(rating => {
      const value = ratingValue(rating.formData[criterion.id]);
      return value === undefined ? [] : [{
        ratingId: rating.id,
        reviewerName: rating.reviewerNameSnapshot,
        value,
        label: ratingLabel(value),
      }];
    });
    const average = responses.length ? round(responses.reduce((total, response) => total + response.value, 0) / responses.length) : undefined;
    return {
      id: criterion.id,
      label: submitted[0] ? fieldLabel(submitted[0], criterion.id, criterion.label) : criterion.label,
      average,
      ratingLabel: average === undefined ? undefined : ratingLabel(average),
      answeredCount: responses.length,
      reviewerCount: ratings.length,
      percentage: average === undefined ? undefined : round((average / 5) * 100),
      responses,
    };
  });

  reviewers.forEach(reviewer => {
    if (!submittedIds.has(reviewer.id)) return;
    const values = criteria.flatMap(criterion => criterion.responses.filter(response => response.ratingId === reviewer.id).map(response => response.value));
    reviewer.score = values.length ? round(values.reduce((total, value) => total + value, 0) / values.length) : undefined;
  });

  const allScores = criteria.flatMap(criterion => criterion.responses.map(response => response.value));
  const recommendation = buildRecommendationSummary(reviewers.filter(reviewer => submittedIds.has(reviewer.id)));
  const recommendationState = recommendation.recommendationState === 'Consensus reached' && submitted.length < ratings.length
    ? 'Preliminary recommendation'
    : recommendation.recommendationState;
  const writtenHighlights: InterviewWrittenHighlight[] = INTERVIEW_WRITTEN_FIELDS.map(field => {
    const responses = submitted.flatMap(rating => {
      const text = asText(rating.formData[field.id]).trim();
      return text ? [{ ratingId: rating.id, reviewerName: rating.reviewerNameSnapshot, text }] : [];
    });
    return {
      id: field.id,
      label: field.label,
      responseCount: responses.length,
      summary: responses.length ? responses.map(response => response.text).join(' · ').slice(0, 360) : 'No response submitted yet.',
      responses,
    };
  });

  const submittedReviewers = submitted.length;
  const totalReviewers = ratings.length;
  return {
    totalReviewers,
    submittedReviewers,
    status: submittedReviewers === 0 ? 'Pending' : submittedReviewers === totalReviewers ? 'Complete' : 'In Progress',
    preliminary: submittedReviewers > 0 && submittedReviewers < totalReviewers,
    overallScore: allScores.length ? round(allScores.reduce((total, value) => total + value, 0) / allScores.length) : undefined,
    overallLabel: allScores.length ? ratingLabel(allScores.reduce((total, value) => total + value, 0) / allScores.length) : undefined,
    quickRecommendation: recommendation.quickRecommendation,
    recommendationState,
    criteria,
    reviewers,
    writtenHighlights,
  };
};
