import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import FileUploader from '../ui/FileUploader';
import {
  ApplicantPageTheme,
  ApplicationStage,
  CandidateSource,
  JobPost,
  RoleApplicationQuestion,
} from '../../types';
import { supabase } from '../../services/supabaseClient';
import {
  getOpenRolesConfig,
  getOpenRolesPath,
  isJobCurrentlyOpen,
  mapApplicantPageTheme,
  mapPublicJobPost,
} from '../../services/publicCareersService';

const RESUME_BUCKET = 'recruitment-uploads';
const MAX_RESUME_SIZE = 5 * 1024 * 1024;
const RESUME_MIME_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];
const RESUME_EXTENSIONS = ['.pdf', '.jpg', '.jpeg', '.png', '.doc', '.docx'];
const INPUT_CLASS = 'w-full rounded-md border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-900 shadow-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100';
const TEXTAREA_CLASS = `${INPUT_CLASS} min-h-28 resize-y`;

type UploadStatus = 'idle' | 'uploading' | 'success' | 'error';

interface FormState {
  fullName: string;
  firstName: string;
  lastName: string;
  email: string;
  mobile: string;
  currentCity: string;
  linkedinUrl: string;
  currentEmployer: string;
  yearsRelevantExperience: string;
  whyRole: string;
  earliestStartDate: string;
  resumeLink: string;
  resumeFileName: string;
  resumeFileUrl: string;
  resumeFilePath: string;
  resumeUploadStatus: UploadStatus;
  resumeUploadError: string;
  roleAnswers: Record<string, string>;
  consent: boolean;
}

interface SubmissionResult {
  reference: string;
  roleTitle: string;
}

const initialForm: FormState = {
  fullName: '',
  firstName: '',
  lastName: '',
  email: '',
  mobile: '',
  currentCity: '',
  linkedinUrl: '',
  currentEmployer: '',
  yearsRelevantExperience: '',
  whyRole: '',
  earliestStartDate: '',
  resumeLink: '',
  resumeFileName: '',
  resumeFileUrl: '',
  resumeFilePath: '',
  resumeUploadStatus: 'idle',
  resumeUploadError: '',
  roleAnswers: {},
  consent: false,
};

const newId = (): string => {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
};

const createApplicationReference = (): string => {
  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  return `APP-${stamp}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
};

const isValidUrl = (value: string): boolean => {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
};

const asDateInput = (daysFromNow: number): string => {
  const date = new Date();
  date.setDate(date.getDate() + daysFromNow);
  return date.toISOString().slice(0, 10);
};

const displayDate = (value?: string): string => {
  if (!value) return 'Not specified';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString();
};

const questionLabel = (question: RoleApplicationQuestion): string => `${question.label}${question.required ? ' *' : ''}`;

const FieldLabel: React.FC<{ htmlFor: string; children: React.ReactNode; required?: boolean }> = ({ htmlFor, children, required }) => (
  <label htmlFor={htmlFor} className="mb-1.5 block text-sm font-semibold text-gray-800">
    {children}{required ? <span className="text-red-500"> *</span> : null}
  </label>
);

const CareerHeader: React.FC<{ theme: ApplicantPageTheme; openRolesPath: string }> = ({ theme, openRolesPath }) => (
  <header className="sticky top-0 z-50 border-b border-gray-200 bg-white/95 backdrop-blur">
    <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
      <Link to={`/careers/${theme.slug}`} className="flex min-w-0 items-center gap-3">
        {theme.logoImage ? (
          <img src={theme.logoImage} alt="" className="h-9 w-9 rounded object-contain" />
        ) : (
          <span className="flex h-9 w-9 items-center justify-center rounded-full text-lg font-bold text-white" style={{ backgroundColor: theme.primaryColor }}>+</span>
        )}
        <span className="truncate font-bold text-gray-900">{theme.pageTitle}</span>
      </Link>
      <nav className="flex items-center gap-3 text-sm font-semibold sm:gap-6">
        <Link to={`/careers/${theme.slug}`} className="hidden text-gray-600 hover:text-gray-900 sm:inline">Why Join Us</Link>
        <Link to={openRolesPath} className="text-gray-600 hover:text-gray-900">Open Roles</Link>
        <Link to={openRolesPath} className="rounded-md px-3 py-2 text-white sm:px-4" style={{ backgroundColor: theme.primaryColor }}>Apply Now</Link>
      </nav>
    </div>
  </header>
);

const Stepper: React.FC<{ step: 1 | 2 | 3; primaryColor: string }> = ({ step, primaryColor }) => {
  const steps = [
    ['1', 'Personal Info'],
    ['2', 'Experience'],
    ['3', 'Final Details'],
  ];
  return (
    <div className="mb-8 grid grid-cols-3 gap-2 border-b border-gray-200 pb-5">
      {steps.map(([number, label], index) => {
        const active = step === index + 1;
        const complete = step > index + 1;
        return (
          <div key={number} className="relative flex items-center gap-2 sm:gap-3">
            <span
              className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full border-2 text-sm font-bold ${active || complete ? 'text-white' : 'border-gray-300 bg-white text-gray-500'}`}
              style={active || complete ? { backgroundColor: primaryColor, borderColor: primaryColor } : undefined}
            >
              {number}
            </span>
            <span className={`text-xs font-bold sm:text-sm ${active ? '' : 'text-gray-500'}`} style={active ? { color: primaryColor } : undefined}>{label}</span>
            {index < steps.length - 1 && <span className="absolute -right-1 top-4 hidden h-0.5 w-3 bg-gray-200 sm:block" aria-hidden="true" />}
          </div>
        );
      })}
    </div>
  );
};

const QuestionField: React.FC<{
  question: RoleApplicationQuestion;
  value: string;
  onChange: (value: string) => void;
}> = ({ question, value, onChange }) => {
  const id = `role-question-${question.id}`;
  const commonProps = {
    id,
    value,
    onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => onChange(event.target.value),
    className: INPUT_CLASS,
  };

  return (
    <div>
      <FieldLabel htmlFor={id} required={question.required}>{question.label}</FieldLabel>
      {question.helpText && <p className="mb-1.5 text-xs text-gray-500">{question.helpText}</p>}
      {question.type === 'longText' ? (
        <textarea {...commonProps} className={TEXTAREA_CLASS} rows={4} />
      ) : question.type === 'select' || question.type === 'yesNo' ? (
        <select {...commonProps}>
          <option value="">Select an answer</option>
          {(question.type === 'yesNo' ? ['Yes', 'No'] : (question.options || [])).map(option => <option key={option} value={option}>{option}</option>)}
        </select>
      ) : (
        <input {...commonProps} type={question.type === 'number' ? 'number' : question.type === 'date' ? 'date' : 'text'} />
      )}
    </div>
  );
};

const CareerApplicationPage: React.FC = () => {
  const { slug, roleSlug } = useParams<{ slug: string; roleSlug?: string }>();
  const [searchParams] = useSearchParams();
  const roleIdFromRoute = searchParams.get('roleId') || '';
  const [theme, setTheme] = useState<ApplicantPageTheme | null>(null);
  const [selectedJob, setSelectedJob] = useState<JobPost | null>(null);
  const [openJobs, setOpenJobs] = useState<JobPost[]>([]);
  const [roleClosed, setRoleClosed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [form, setForm] = useState<FormState>(initialForm);
  const [validationError, setValidationError] = useState('');
  const [submitError, setSubmitError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [hasSubmitted, setHasSubmitted] = useState(false);
  const [submission, setSubmission] = useState<SubmissionResult | null>(null);
  const submitLock = useRef(false);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!slug) {
        setLoadError('Career page not found.');
        setLoading(false);
        return;
      }
      setLoading(true);
      setLoadError('');
      try {
        const { data: themeRow, error: themeError } = await supabase
          .from('applicant_page_themes')
          .select('*')
          .eq('slug', slug)
          .eq('is_active', true)
          .maybeSingle();
        if (themeError) throw themeError;
        if (!themeRow) throw new Error('Career page not found.');

        const resolvedTheme = mapApplicantPageTheme(themeRow);
        const { data: rows, error: jobsError } = await supabase
          .from('job_posts')
          .select('*')
          .eq('business_unit_id', resolvedTheme.businessUnitId)
          .order('title', { ascending: true });
        if (jobsError) throw jobsError;

        const jobs = (rows || []).map(mapPublicJobPost);
        let candidate: JobPost | null = null;
        if (roleSlug) {
          candidate = roleIdFromRoute
            ? jobs.find(job => job.id === roleIdFromRoute && (job.slug === roleSlug || job.id === roleSlug)) || null
            : jobs.find(job => job.slug === roleSlug || job.id === roleSlug) || null;
        }

        if (!cancelled) {
          setTheme(resolvedTheme);
          setSelectedJob(candidate);
          setRoleClosed(Boolean(roleSlug && (!candidate || !isJobCurrentlyOpen(candidate))));
          setOpenJobs(jobs.filter(job => isJobCurrentlyOpen(job)));
        }
      } catch (error: any) {
        console.error('Failed to load application page', error);
        if (!cancelled) setLoadError(error?.message || 'Unable to load the application page.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [roleIdFromRoute, roleSlug, slug]);

  const openRolesPath = theme ? getOpenRolesPath(theme.slug, theme) : '#';
  const openRolesConfig = theme ? getOpenRolesConfig(theme) : null;
  const isRoleApplication = Boolean(roleSlug);
  const roleDetails = selectedJob?.roleDetails || {};
  const allowResumeLink = roleDetails.allowResumeLink !== false;
  const questions = useMemo(() => roleDetails.applicationQuestions || [], [roleDetails.applicationQuestions]);
  const stepTwoQuestions = useMemo(() => questions.filter(question => question.step !== 3), [questions]);
  const stepThreeQuestions = useMemo(() => questions.filter(question => question.step === 3), [questions]);
  const benefits = theme?.benefits?.length ? theme.benefits : (openRolesConfig?.benefits || []);
  const roleTitle = selectedJob?.title || 'General Application';

  const updateForm = (changes: Partial<FormState>) => setForm(previous => ({ ...previous, ...changes }));

  const handleResumeUpload = async (file: File) => {
    updateForm({
      resumeFileName: file.name,
      resumeFileUrl: '',
      resumeFilePath: '',
      resumeUploadStatus: 'uploading',
      resumeUploadError: '',
    });
    setValidationError('');
    try {
      if (file.size > MAX_RESUME_SIZE) throw new Error('Resume files must be 5 MB or smaller.');
      const lowerName = file.name.toLowerCase();
      const validType = RESUME_MIME_TYPES.includes(file.type) || (file.type === '' && RESUME_EXTENSIONS.some(extension => lowerName.endsWith(extension)));
      if (!validType) throw new Error(`Unsupported resume type. Use ${RESUME_EXTENSIONS.join(', ')}.`);

      const safeName = file.name.replace(/[^a-z0-9._-]/gi, '-').replace(/-+/g, '-');
      const path = `resumes/public/${newId()}-${safeName}`;
      const uploadOptions: { upsert: boolean; contentType?: string } = { upsert: false };
      if (file.type) uploadOptions.contentType = file.type;
      const { error: uploadError } = await supabase.storage.from(RESUME_BUCKET).upload(path, file, uploadOptions);
      if (uploadError) throw new Error(uploadError.message || 'The resume could not be uploaded.');

      const { data: publicUrlData } = supabase.storage.from(RESUME_BUCKET).getPublicUrl(path);
      updateForm({
        resumeFileUrl: publicUrlData?.publicUrl || path,
        resumeFilePath: path,
        resumeUploadStatus: 'success',
        resumeUploadError: '',
      });
    } catch (error: any) {
      console.error('Resume upload failed', error);
      updateForm({
        resumeFileUrl: '',
        resumeFilePath: '',
        resumeUploadStatus: 'error',
        resumeUploadError: error?.message || 'Resume upload failed. Please remove the file and try again.',
      });
    }
  };

  const handleResumeRemove = () => {
    updateForm({
      resumeFileName: '',
      resumeFileUrl: '',
      resumeFilePath: '',
      resumeUploadStatus: 'idle',
      resumeUploadError: '',
    });
  };

  const validateStep = (targetStep: 1 | 2 | 3): boolean => {
    const errors: string[] = [];
    if (targetStep === 1) {
      if (!form.fullName.trim() && (!form.firstName.trim() || !form.lastName.trim())) errors.push('Enter your full name.');
      if (!form.email.trim() || !/^\S+@\S+\.\S+$/.test(form.email.trim())) errors.push('Enter a valid email address.');
      if (!form.mobile.trim()) errors.push('Enter your mobile number.');
      if (!form.currentCity.trim()) errors.push('Enter your current city or location.');
      if (!form.currentEmployer.trim()) errors.push('Enter your current or most recent employer.');
      if (!form.yearsRelevantExperience.trim()) errors.push('Tell us your years of relevant experience.');
      if (!form.whyRole.trim()) errors.push(isRoleApplication ? 'Tell us why you want this role.' : 'Tell us why you want to join us.');
      if (!form.earliestStartDate) errors.push('Select your earliest available start date.');
      const hasValidResumeLink = allowResumeLink && form.resumeLink.trim() && isValidUrl(form.resumeLink.trim());
      const hasUploadedResume = form.resumeUploadStatus === 'success' && Boolean(form.resumeFileUrl);
      if (!hasUploadedResume && !hasValidResumeLink) {
        errors.push(allowResumeLink ? 'Upload a resume or provide a valid resume link.' : 'Upload a resume before continuing.');
      }
      if (form.resumeUploadStatus === 'uploading') errors.push('Wait for the resume upload to finish.');
      if (form.resumeUploadStatus === 'error') errors.push('Fix the resume upload error before continuing.');
    }
    if (targetStep === 2) {
      stepTwoQuestions.filter(question => question.required && !String(form.roleAnswers[question.id] || '').trim()).forEach(question => errors.push(`Answer: ${question.label}`));
    }
    if (targetStep === 3) {
      stepThreeQuestions.filter(question => question.required && !String(form.roleAnswers[question.id] || '').trim()).forEach(question => errors.push(`Answer: ${question.label}`));
      if (!form.consent) errors.push('Accept the privacy and consent agreement to submit.');
    }
    const message = errors.join(' ');
    setValidationError(message);
    return !message;
  };

  const goToNextStep = () => {
    if (!validateStep(step)) return;
    setValidationError('');
    if (step < 3) setStep((step + 1) as 2 | 3);
  };

  const goToPreviousStep = () => {
    setValidationError('');
    if (step > 1) setStep((step - 1) as 1 | 2);
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (hasSubmitted || isSubmitting || submitLock.current || !validateStep(3)) return;
    submitLock.current = true;
    setSubmitError('');
    setIsSubmitting(true);
    try {
      let liveJob = selectedJob;
      if (selectedJob) {
        const { data: liveRow, error: liveError } = await supabase.from('job_posts').select('*').eq('id', selectedJob.id).maybeSingle();
        if (liveError) throw liveError;
        liveJob = liveRow ? mapPublicJobPost(liveRow) : null;
        if (!liveJob || !isJobCurrentlyOpen(liveJob)) {
          setSelectedJob(liveJob);
          setRoleClosed(true);
          throw new Error('This role is no longer accepting applications. Please return to Open Roles and choose another opportunity.');
        }
      }

      const nameParts = form.fullName.trim().split(/\s+/).filter(Boolean);
      const firstName = form.firstName.trim() || nameParts[0] || 'Applicant';
      const lastName = form.lastName.trim() || nameParts.slice(1).join(' ') || 'Applicant';
      const resumeValue = form.resumeFileUrl || (allowResumeLink ? form.resumeLink.trim() : '') || null;
      const applicationReference = createApplicationReference();
      const submissionToken = newId();
      const sourceApplicationPage = window.location.pathname;

      const { data: candidate, error: candidateError } = await supabase.from('job_candidates').insert({
        first_name: firstName,
        last_name: lastName,
        email: form.email.trim(),
        phone: form.mobile.trim(),
        source: CandidateSource.CareerSite,
        portfolio_url: form.linkedinUrl.trim() || resumeValue,
        tags: [],
        consent_at: new Date().toISOString(),
        current_city: form.currentCity.trim(),
        linkedin_url: form.linkedinUrl.trim() || null,
        current_employer: form.currentEmployer.trim(),
        years_relevant_experience: form.yearsRelevantExperience.trim(),
        earliest_start_date: form.earliestStartDate || null,
      }).select().single();
      if (candidateError) throw candidateError;

      const { error: applicationError } = await supabase.from('job_applications').insert({
        candidate_id: candidate.id,
        job_post_id: liveJob?.id || null,
        requisition_id: liveJob?.requisitionId || null,
        role_id: liveJob?.id || null,
        role_slug: liveJob?.slug || roleSlug || null,
        role_title_snapshot: liveJob?.title || 'General Application',
        department_snapshot: liveJob?.departmentLabel || null,
        location_snapshot: liveJob?.locationLabel || null,
        employment_type_snapshot: liveJob?.employmentType || null,
        work_arrangement_snapshot: liveJob?.roleDetails?.workArrangement || null,
        stage: ApplicationStage.New,
        cover_letter: form.whyRole.trim(),
        resume_url: resumeValue,
        resume_file_url: form.resumeFileUrl || null,
        resume_file_path: form.resumeFilePath || null,
        role_answers: form.roleAnswers,
        source_application_page: sourceApplicationPage,
        application_reference: applicationReference,
        submission_token: submissionToken,
      });
      if (applicationError) throw applicationError;

      setSubmission({ reference: applicationReference, roleTitle: liveJob?.title || 'General Application' });
      setHasSubmitted(true);
    } catch (error: any) {
      console.error('Application submission failed', error);
      submitLock.current = false;
      setSubmitError(error?.message || 'We could not submit your application. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) return <div className="flex min-h-screen items-center justify-center text-gray-600">Loading application page…</div>;
  if (loadError || !theme) return <div className="flex min-h-screen items-center justify-center px-6 text-center text-gray-600">{loadError || 'Career page not found.'}</div>;

  if (roleClosed) {
    return (
      <div className="min-h-screen font-sans" style={{ backgroundColor: theme.backgroundColor }}>
        <CareerHeader theme={theme} openRolesPath={openRolesPath} />
        <main className="mx-auto max-w-5xl px-4 py-20 text-center sm:px-6 lg:px-8">
          <div className="rounded-2xl border border-gray-200 bg-white p-8 shadow-sm sm:p-12">
            <p className="text-sm font-bold uppercase tracking-[0.2em]" style={{ color: theme.primaryColor }}>Application unavailable</p>
            <h1 className="mt-3 text-3xl font-extrabold text-gray-900">This role is no longer accepting applications</h1>
            <p className="mx-auto mt-4 max-w-2xl text-gray-600">The role may have closed, expired, been unpublished, or been removed. Please explore our current open roles.</p>
            <Link to={openRolesPath} className="mt-7 inline-flex items-center justify-center rounded-md px-5 py-3 font-semibold text-white" style={{ backgroundColor: theme.primaryColor }}>Back to Open Roles</Link>
          </div>
          {openJobs.length > 0 && <div className="mt-10 text-left"><h2 className="text-xl font-bold text-gray-900">Other open roles</h2><div className="mt-4 grid gap-3 sm:grid-cols-2">{openJobs.slice(0, 4).map(job => <Link key={job.id} to={`/careers/${theme.slug}/roles/${encodeURIComponent(job.slug || job.id)}`} className="rounded-xl border border-gray-200 bg-white p-4 hover:shadow-sm"><span className="font-semibold text-gray-900">{job.title}</span><span className="mt-1 block text-sm text-gray-600">{job.locationLabel} · {job.employmentType}</span></Link>)}</div></div>}
        </main>
      </div>
    );
  }

  if (hasSubmitted && submission) {
    return (
      <div className="min-h-screen font-sans" style={{ backgroundColor: theme.backgroundColor }}>
        <CareerHeader theme={theme} openRolesPath={openRolesPath} />
        <main className="mx-auto max-w-3xl px-4 py-20 text-center sm:px-6 lg:px-8">
          <div className="rounded-2xl border border-gray-200 bg-white p-8 shadow-sm sm:p-12">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full text-3xl text-white" style={{ backgroundColor: theme.primaryColor }}>✓</div>
            <p className="mt-6 text-sm font-bold uppercase tracking-[0.2em]" style={{ color: theme.primaryColor }}>Application received</p>
            <h1 className="mt-3 text-3xl font-extrabold text-gray-900">Thank you for applying</h1>
            <p className="mt-4 text-gray-600">Your application for <strong>{submission.roleTitle}</strong> has been submitted successfully.</p>
            <div className="mt-7 rounded-xl bg-gray-50 p-5 text-left">
              <p className="text-sm text-gray-500">Application reference</p>
              <p className="mt-1 font-mono text-lg font-bold text-gray-900">{submission.reference}</p>
              <p className="mt-4 text-sm leading-6 text-gray-600">Our hiring team will review your information and contact you if your experience is a match. We typically respond within 2–3 business days.</p>
            </div>
            <Link to={openRolesPath} className="mt-8 inline-flex items-center justify-center rounded-md px-5 py-3 font-semibold text-white" style={{ backgroundColor: theme.primaryColor }}>Return to Open Roles</Link>
          </div>
        </main>
      </div>
    );
  }

  const updateAnswer = (questionId: string, value: string) => updateForm({ roleAnswers: { ...form.roleAnswers, [questionId]: value } });
  const nameRequired = !form.fullName.trim() && (!form.firstName.trim() || !form.lastName.trim());

  return (
    <div className="min-h-screen font-sans" style={{ backgroundColor: theme.backgroundColor }}>
      <CareerHeader theme={theme} openRolesPath={openRolesPath} />
      <main>
        <section className="bg-white">
          <div className="mx-auto max-w-7xl px-4 py-9 sm:px-6 lg:px-8 sm:py-12">
            <div className="flex flex-wrap items-center gap-2 text-sm text-gray-500">
              <Link to={openRolesPath} className="hover:underline" style={{ color: theme.primaryColor }}>Open Roles</Link>
              <span aria-hidden="true">/</span>
              <span className="truncate">{roleTitle}</span>
              <span aria-hidden="true">/</span>
              <span style={{ color: theme.primaryColor }}>Apply</span>
            </div>
            <div className="mt-7 grid gap-7 lg:grid-cols-[1fr_350px] lg:items-end">
              <div>
                <h1 className="text-4xl font-extrabold tracking-tight text-gray-900 sm:text-5xl">{isRoleApplication ? <>Apply for <span style={{ color: theme.primaryColor }}>{roleTitle}</span></> : <>Submit a <span style={{ color: theme.primaryColor }}>General Application</span></>}</h1>
                <p className="mt-4 max-w-3xl text-lg text-gray-600">Fast application. Clear next steps. We review every serious candidate.</p>
                <div className="mt-6 flex flex-wrap gap-2 text-sm">
                  {[
                    ['Location', selectedJob?.locationLabel],
                    ['Employment type', selectedJob?.employmentType],
                    ['Department', selectedJob?.departmentLabel],
                    ['Work arrangement', roleDetails.workArrangement],
                  ].map(([label, value]) => value ? <span key={label} className="rounded-md border border-gray-200 bg-white px-3 py-2 text-gray-700 shadow-sm"><strong>{label}:</strong> {value}</span> : null)}
                  {!isRoleApplication && <span className="rounded-md border border-gray-200 bg-white px-3 py-2 text-gray-700 shadow-sm"><strong>Application type:</strong> General</span>}
                </div>
              </div>
              {roleDetails.roleImage && <img src={roleDetails.roleImage} alt="" className="hidden h-40 w-full rounded-2xl object-cover lg:block" />}
            </div>
          </div>
        </section>

        <div className="mx-auto grid max-w-7xl gap-8 px-4 py-10 sm:px-6 lg:grid-cols-[minmax(0,1fr)_350px] lg:px-8 lg:py-12">
          <form onSubmit={handleSubmit} className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm sm:p-8">
            <Stepper step={step} primaryColor={theme.primaryColor} />
            {validationError && <div className="mb-6 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">{validationError}</div>}
            {submitError && <div className="mb-6 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">{submitError}</div>}

            {step === 1 && <section className="space-y-6">
              <div><h2 className="text-2xl font-bold text-gray-900">Personal Information</h2><p className="mt-1 text-sm text-gray-600">Tell us a little about yourself.</p></div>
              <div className="grid gap-5 md:grid-cols-2">
                <div><FieldLabel htmlFor="full-name" required={nameRequired}>Full name</FieldLabel><input id="full-name" value={form.fullName} onChange={event => updateForm({ fullName: event.target.value })} className={INPUT_CLASS} placeholder="e.g. Juan Dela Cruz" /></div>
                <div><FieldLabel htmlFor="email" required>Email address</FieldLabel><input id="email" type="email" value={form.email} onChange={event => updateForm({ email: event.target.value })} className={INPUT_CLASS} placeholder="e.g. juan@email.com" /></div>
                <div><FieldLabel htmlFor="first-name">First name</FieldLabel><input id="first-name" value={form.firstName} onChange={event => updateForm({ firstName: event.target.value })} className={INPUT_CLASS} placeholder="Juan" /></div>
                <div><FieldLabel htmlFor="last-name">Last name</FieldLabel><input id="last-name" value={form.lastName} onChange={event => updateForm({ lastName: event.target.value })} className={INPUT_CLASS} placeholder="Dela Cruz" /></div>
                <div><FieldLabel htmlFor="mobile" required>Mobile number</FieldLabel><input id="mobile" type="tel" value={form.mobile} onChange={event => updateForm({ mobile: event.target.value })} className={INPUT_CLASS} placeholder="+63 912 345 6789" /></div>
                <div><FieldLabel htmlFor="current-city" required>Current city / location</FieldLabel><input id="current-city" value={form.currentCity} onChange={event => updateForm({ currentCity: event.target.value })} className={INPUT_CLASS} placeholder="e.g. Olongapo City, Zambales" /></div>
                <div className="md:col-span-2"><FieldLabel htmlFor="linkedin">LinkedIn or portfolio link <span className="font-normal text-gray-500">(optional)</span></FieldLabel><input id="linkedin" type="url" value={form.linkedinUrl} onChange={event => updateForm({ linkedinUrl: event.target.value })} className={INPUT_CLASS} placeholder="https://linkedin.com/in/yourprofile" /></div>
                <div className="md:col-span-2">
                  <FieldLabel htmlFor="resume-upload" required>Upload resume / CV</FieldLabel>
                  <FileUploader
                    inputId="resume-upload"
                    onFileUpload={handleResumeUpload}
                    onFileRemove={handleResumeRemove}
                    disabled={form.resumeUploadStatus === 'uploading' || isSubmitting}
                    maxSize={MAX_RESUME_SIZE}
                    accept={RESUME_EXTENSIONS.join(',')}
                    allowedMimeTypes={RESUME_MIME_TYPES}
                    allowedExtensions={RESUME_EXTENSIONS}
                  />
                  {form.resumeUploadStatus === 'uploading' && <p className="mt-2 text-sm font-medium text-indigo-600">Uploading {form.resumeFileName}…</p>}
                  {form.resumeUploadStatus === 'success' && <p className="mt-2 text-sm font-medium text-green-600">Resume uploaded successfully. You can replace or remove it before submitting.</p>}
                  {form.resumeUploadError && <p className="mt-2 text-sm font-medium text-red-600" role="alert">{form.resumeUploadError}</p>}
                </div>
                {allowResumeLink && <div className="md:col-span-2"><FieldLabel htmlFor="resume-link">Resume link <span className="font-normal text-gray-500">(optional if you upload a file)</span></FieldLabel><input id="resume-link" type="url" value={form.resumeLink} onChange={event => updateForm({ resumeLink: event.target.value })} className={INPUT_CLASS} placeholder="https://drive.google.com/..." /></div>}
                <div><FieldLabel htmlFor="employer" required>Current / most recent employer</FieldLabel><input id="employer" value={form.currentEmployer} onChange={event => updateForm({ currentEmployer: event.target.value })} className={INPUT_CLASS} placeholder="Company name" /></div>
                <div><FieldLabel htmlFor="experience" required>Years of relevant experience</FieldLabel><input id="experience" value={form.yearsRelevantExperience} onChange={event => updateForm({ yearsRelevantExperience: event.target.value })} className={INPUT_CLASS} placeholder="e.g. 3 years" /></div>
                <div className="md:col-span-2"><FieldLabel htmlFor="why-role" required>{isRoleApplication ? 'Why do you want this role?' : 'Why do you want to join us?'}</FieldLabel><textarea id="why-role" value={form.whyRole} onChange={event => updateForm({ whyRole: event.target.value })} className={TEXTAREA_CLASS} maxLength={1000} placeholder={isRoleApplication ? 'Tell us what excites you about this role.' : 'Tell us what excites you about joining our team.'} /></div>
                <div className="md:col-span-2"><FieldLabel htmlFor="start-date" required>Earliest available start date</FieldLabel><div className="mb-3 flex flex-wrap gap-2"><button type="button" onClick={() => updateForm({ earliestStartDate: asDateInput(0) })} className="rounded-md border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:border-indigo-400">Immediately</button><button type="button" onClick={() => updateForm({ earliestStartDate: asDateInput(14) })} className="rounded-md border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:border-indigo-400">2 weeks</button><button type="button" onClick={() => updateForm({ earliestStartDate: asDateInput(30) })} className="rounded-md border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:border-indigo-400">1 month</button></div><input id="start-date" type="date" value={form.earliestStartDate} onChange={event => updateForm({ earliestStartDate: event.target.value })} className={INPUT_CLASS} /></div>
              </div>
            </section>}

            {step === 2 && <section className="space-y-6">
              <div><h2 className="text-2xl font-bold text-gray-900">Experience</h2><p className="mt-1 text-sm text-gray-600">Answer the questions configured for {roleTitle}.</p></div>
              {selectedJob && (roleDetails.requiredExperience || roleDetails.preferredExperience || roleDetails.qualifications) && <div className="rounded-xl bg-gray-50 p-5 text-sm text-gray-700"><h3 className="font-bold text-gray-900">What we’re looking for</h3>{roleDetails.requiredExperience && <p className="mt-2 whitespace-pre-wrap"><strong>Required experience:</strong> {roleDetails.requiredExperience}</p>}{roleDetails.preferredExperience && <p className="mt-2 whitespace-pre-wrap"><strong>Preferred experience:</strong> {roleDetails.preferredExperience}</p>}{roleDetails.qualifications && <p className="mt-2 whitespace-pre-wrap"><strong>Qualifications:</strong> {roleDetails.qualifications}</p>}</div>}
              {stepTwoQuestions.length > 0 ? <div className="grid gap-5 md:grid-cols-2">{stepTwoQuestions.map(question => <QuestionField key={question.id} question={question} value={form.roleAnswers[question.id] || ''} onChange={value => updateAnswer(question.id, value)} />)}</div> : <div className="rounded-xl border border-dashed border-gray-300 p-8 text-center text-sm text-gray-600">No additional experience questions are configured for this application.</div>}
            </section>}

            {step === 3 && <section className="space-y-6">
              <div><h2 className="text-2xl font-bold text-gray-900">Final Details</h2><p className="mt-1 text-sm text-gray-600">Review your information and complete your application.</p></div>
              {stepThreeQuestions.length > 0 && <div className="grid gap-5 md:grid-cols-2">{stepThreeQuestions.map(question => <QuestionField key={question.id} question={question} value={form.roleAnswers[question.id] || ''} onChange={value => updateAnswer(question.id, value)} />)}</div>}
              <div className="rounded-xl border border-gray-200 bg-gray-50 p-5"><h3 className="font-bold text-gray-900">Application review</h3><dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2"><div><dt className="text-gray-500">Applicant</dt><dd className="font-semibold text-gray-900">{form.fullName || `${form.firstName} ${form.lastName}`.trim() || 'Not provided'}</dd></div><div><dt className="text-gray-500">Email</dt><dd className="font-semibold text-gray-900">{form.email || 'Not provided'}</dd></div><div><dt className="text-gray-500">Role</dt><dd className="font-semibold text-gray-900">{roleTitle}</dd></div><div><dt className="text-gray-500">Earliest start</dt><dd className="font-semibold text-gray-900">{displayDate(form.earliestStartDate)}</dd></div><div className="sm:col-span-2"><dt className="text-gray-500">Resume</dt><dd className="font-semibold text-gray-900">{form.resumeFileName || (form.resumeLink ? 'Resume link provided' : 'Not provided')}</dd></div></dl></div>
              <label className="flex items-start gap-3 rounded-xl border border-gray-200 p-4 text-sm text-gray-700"><input type="checkbox" checked={form.consent} onChange={event => updateForm({ consent: event.target.checked })} className="mt-1 h-4 w-4 rounded border-gray-300" /> <span>I agree that the hiring team may use the information in this application to evaluate me for this opportunity and related recruitment communications.</span></label>
            </section>}

            <div className="mt-9 flex flex-col-reverse gap-3 border-t border-gray-200 pt-6 sm:flex-row sm:items-center sm:justify-between">
              {step > 1 ? <button type="button" onClick={goToPreviousStep} className="rounded-md border border-gray-300 px-5 py-3 text-sm font-semibold text-gray-700 hover:bg-gray-50">Back</button> : <Link to={openRolesPath} className="text-center text-sm font-semibold text-gray-600 hover:text-gray-900 sm:text-left">Back to Open Roles</Link>}
              {step < 3 ? <button type="button" onClick={goToNextStep} className="rounded-md px-5 py-3 text-sm font-bold text-white" style={{ backgroundColor: theme.primaryColor }}>{step === 1 ? 'Continue Application' : 'Continue to Final Details'} →</button> : <button type="submit" disabled={isSubmitting || form.resumeUploadStatus === 'uploading'} className="rounded-md px-5 py-3 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-60" style={{ backgroundColor: theme.primaryColor }}>{isSubmitting ? 'Submitting application…' : 'Submit Application'}</button>}
            </div>
            <p className="mt-4 text-xs text-gray-500">* Required fields</p>
          </form>

          <aside className="h-fit rounded-2xl border border-gray-200 bg-white p-6 shadow-sm lg:sticky lg:top-24">
            <h2 className="text-xl font-extrabold text-gray-900">What happens next?</h2>
            <div className="mt-6 space-y-6">
              {[['1', 'Application Review', 'We’ll review your application within 2–3 business days.'], ['2', 'Interview', 'You’ll speak with our hiring team, virtually or in person.'], ['3', 'Hiring Decision', 'We’ll make a decision and get back to you.']].map(([number, title, description]) => <div key={number} className="flex gap-3"><span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-sm font-bold text-white" style={{ backgroundColor: theme.primaryColor }}>{number}</span><div><h3 className="font-bold text-gray-900">{title}</h3><p className="mt-1 text-sm leading-6 text-gray-600">{description}</p></div></div>)}
            </div>
            <div className="mt-8 border-t border-gray-200 pt-7"><h2 className="text-xl font-extrabold text-gray-900">Why join us?</h2><div className="mt-5 space-y-4">{benefits.slice(0, 4).map(benefit => <div key={benefit.id} className="flex gap-3"><span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full text-sm font-bold text-white" style={{ backgroundColor: theme.primaryColor }}>✓</span><div><h3 className="font-bold text-gray-900">{benefit.title}</h3><p className="mt-0.5 text-sm leading-5 text-gray-600">{benefit.description}</p></div></div>)}</div></div>
            <div className="mt-7 rounded-xl border border-green-100 bg-green-50 p-4 text-sm text-gray-700"><p className="font-bold text-gray-900">Your information stays private</p><p className="mt-1 leading-5">We only use your information for hiring and recruitment purposes.</p></div>
          </aside>
        </div>
      </main>
      <footer className="bg-gray-900 py-8 text-white"><div className="mx-auto flex max-w-7xl flex-col justify-between gap-3 px-4 sm:flex-row sm:px-6 lg:px-8"><p className="font-bold">{theme.pageTitle}</p>{theme.contactEmail && <a href={`mailto:${theme.contactEmail}`} className="text-gray-300 hover:text-white">{theme.contactEmail}</a>}</div></footer>
    </div>
  );
};

export default CareerApplicationPage;
