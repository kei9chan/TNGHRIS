import { ApplicantPageTheme, JobPost, JobPostStatus, OpenRolesBenefit, OpenRolesConfig, RoleApplicationQuestion, RoleDetails, RoleFAQ } from '../types';

export const DEFAULT_OPEN_ROLES_BENEFITS: OpenRolesBenefit[] = [
  { id: 'competitive-pay', title: 'Competitive Pay', description: 'Be rewarded for the value you bring.', icon: 'wallet' },
  { id: 'team-perks', title: 'Team Perks', description: 'Enjoy thoughtful perks and memorable team experiences.', icon: 'smile' },
  { id: 'growth-opportunities', title: 'Growth Opportunities', description: 'Build skills and grow with a team that supports your goals.', icon: 'rocket' },
  { id: 'fun-environment', title: 'Fun Work Environment', description: 'Do meaningful work in a team that knows how to have fun.', icon: 'star' },
];

const toDate = (value: unknown): Date | undefined => {
  if (!value) return undefined;
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.getTime()) ? undefined : date;
};

const normalizeStatus = (value: unknown): JobPostStatus => {
  const status = String(value || '').trim().toLowerCase();
  if (status === 'published') return JobPostStatus.Published;
  if (status === 'paused') return JobPostStatus.Paused;
  if (status === 'closed') return JobPostStatus.Closed;
  return JobPostStatus.Draft;
};

const normalizeFaqs = (value: unknown): RoleFAQ[] => {
  if (!Array.isArray(value)) return [];
  return value
    .map((faq, index) => ({
      id: String(faq?.id || `faq-${index + 1}`),
      question: String(faq?.question || '').trim(),
      answer: String(faq?.answer || '').trim(),
    }))
    .filter(faq => faq.question && faq.answer);
};

const normalizeQuestions = (value: unknown): RoleApplicationQuestion[] => {
  if (!Array.isArray(value)) return [];
  return value
    .map((question, index) => ({
      id: String(question?.id || `question-${index + 1}`),
      label: String(question?.label || '').trim(),
      type: question?.type || 'shortText',
      required: question?.required !== false,
      step: (question?.step === 3 ? 3 : 2) as 2 | 3,
      options: Array.isArray(question?.options) ? question.options.map((option: unknown) => String(option).trim()).filter(Boolean) : [],
      helpText: question?.helpText ? String(question.helpText).trim() : undefined,
    }))
    .filter(question => question.label);
};

const normalizeRoleDetails = (row: any): RoleDetails => {
  const details = row.role_details || row.roleDetails || {};
  return {
    shortSummary: details.shortSummary || row.short_summary || undefined,
    workArrangement: details.workArrangement || row.work_arrangement || undefined,
    salaryRange: details.salaryRange || row.salary_range || undefined,
    whyThisRoleMatters: details.whyThisRoleMatters || row.why_this_role_matters || undefined,
    responsibilities: details.responsibilities || row.responsibilities || undefined,
    qualifications: details.qualifications || row.qualifications || undefined,
    requiredExperience: details.requiredExperience || row.required_experience || undefined,
    preferredExperience: details.preferredExperience || row.preferred_experience || undefined,
    benefits: details.benefits || undefined,
    faqs: normalizeFaqs(details.faqs || row.faqs),
    roleImage: details.roleImage || row.role_image_url || undefined,
    allowResumeLink: details.allowResumeLink !== false,
    applicationQuestions: normalizeQuestions(details.applicationQuestions || row.application_questions),
  };
};

export const mapPublicJobPost = (row: any): JobPost => ({
  id: row.id,
  requisitionId: row.requisition_id,
  businessUnitId: row.business_unit_id,
  title: row.title,
  slug: row.slug,
  description: row.description || '',
  requirements: row.requirements || '',
  benefits: row.benefits || '',
  locationLabel: row.location_label || 'Location not specified',
  employmentType: row.employment_type || 'Full-Time',
  status: normalizeStatus(row.status),
  publishedAt: toDate(row.published_at),
  channels: row.channels || { careerSite: true, qr: false, social: false, jobBoards: false },
  referralBonus: row.referral_bonus ?? undefined,
  applicationOpenAt: toDate(row.application_open_at || row.open_at || row.open_date),
  applicationCloseAt: toDate(row.application_close_at || row.close_at || row.closing_date),
  isActive: row.is_active ?? true,
  isArchived: row.is_archived ?? false,
  isFeatured: row.is_featured ?? false,
  isUrgent: row.is_urgent ?? row.job_requisitions?.is_urgent ?? false,
  departmentLabel:
    row.department_label ||
    row.department ||
    row.department_name ||
    row.job_requisitions?.department_name ||
    row.job_requisitions?.departments?.name ||
    'Department not specified',
  roleDetails: normalizeRoleDetails(row),
});

export const isJobCurrentlyOpen = (job: JobPost, now = new Date()): boolean => {
  if (job.status !== JobPostStatus.Published) return false;
  if (job.isActive === false || job.isArchived === true) return false;
  if (job.applicationOpenAt && now < job.applicationOpenAt) return false;
  if (job.applicationCloseAt && now > job.applicationCloseAt) return false;
  return true;
};

export const getOpenRolesConfig = (theme: ApplicantPageTheme): OpenRolesConfig => {
  const configured = theme.openRoles || (theme.sections?.openRoles as Partial<OpenRolesConfig> | undefined) || {};
  return {
    enabled: configured.enabled ?? true,
    published: configured.published ?? true,
    pageName: configured.pageName || 'Open Roles',
    pageSlug: configured.pageSlug || 'open-roles',
    navigationLabel: configured.navigationLabel || 'Open Roles',
    displayOrder: Number.isFinite(Number(configured.displayOrder)) ? Number(configured.displayOrder) : 0,
    heroHeadline: configured.heroHeadline || 'Open Roles',
    heroDescription: configured.heroDescription || 'Find a role. Apply in minutes.',
    heroImage: configured.heroImage || theme.heroImage || '',
    benefits: configured.benefits?.length ? configured.benefits : DEFAULT_OPEN_ROLES_BENEFITS,
  };
};

export const mapApplicantPageTheme = (row: any): ApplicantPageTheme => {
  const sections = row.sections || {};
  const theme: ApplicantPageTheme = {
    id: row.id,
    businessUnitId: row.business_unit_id,
    name: row.name || row.page_title || row.slug || 'Career Page',
    slug: row.slug,
    pageTitle: row.page_title || 'Join Our Team',
    heroHeadline: row.hero_headline || '',
    heroDescription: row.hero_description || '',
    heroOverlayColor: sections.heroOverlayColor || 'rgba(0,0,0,0.5)',
    primaryColor: row.primary_color || '#4F46E5',
    backgroundColor: row.background_color || '#F3F4F6',
    heroImage: row.hero_image_url || '',
    logoImage: row.logo_url || '',
    benefits: sections.benefits || [],
    testimonials: sections.testimonials || [],
    contactEmail: sections.contactEmail || '',
    ctaText: row.cta_text || '',
    ctaLink: row.cta_link || '',
    sections,
    isActive: row.is_active ?? true,
  };
  theme.openRoles = getOpenRolesConfig(theme);
  return theme;
};

export const getOpenRolesPath = (careerSlug: string, theme: ApplicantPageTheme): string => {
  const config = getOpenRolesConfig(theme);
  return `/careers/${encodeURIComponent(careerSlug)}/${encodeURIComponent(config.pageSlug)}`;
};

export const getRolePath = (careerSlug: string, job: JobPost): string =>
  `/careers/${encodeURIComponent(careerSlug)}/roles/${encodeURIComponent(job.slug || job.id)}`;

export const getApplicationPath = (careerSlug: string, job: JobPost, openRolesSlug = 'open-roles'): string =>
  `/careers/${encodeURIComponent(careerSlug)}/apply/${encodeURIComponent(job.slug || job.id)}?roleId=${encodeURIComponent(job.id)}&openRoles=${encodeURIComponent(openRolesSlug)}`;
