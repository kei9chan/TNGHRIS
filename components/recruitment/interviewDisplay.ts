import { Application, Candidate, Interview, JobPost } from '../../types';

export const getInterviewCandidate = (interview: Interview, applications: Application[], candidates: Candidate[]) => {
  const application = applications.find((item) => item.id === interview.applicationId);
  const candidate = candidates.find((item) => item.id === application?.candidateId);
  return { application, candidate };
};

export const getInterviewPosition = (interview: Interview, applications: Application[], jobPosts: JobPost[] = []) => {
  const application = applications.find((item) => item.id === interview.applicationId);
  return application?.roleTitleSnapshot || jobPosts.find((post) => post.id === application?.jobPostId)?.title || 'General Application';
};

export const getInterviewLabel = (interview: Interview, applications: Application[], candidates: Candidate[], jobPosts: JobPost[] = []) => {
  const { candidate } = getInterviewCandidate(interview, applications, candidates);
  const firstName = candidate?.firstName || 'Applicant';
  return `${firstName} — ${getInterviewPosition(interview, applications, jobPosts)}`;
};

export const getInterviewTime = (interview: Interview) => new Date(interview.scheduledStart).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
