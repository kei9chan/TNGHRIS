import { OfferBuilderDetails, OfferSectionConfig, OfferTemplate } from '../../types';
import { appearanceForBusinessUnit } from './offerBranding';
import { DEFAULT_ADDITIONAL_OFFER_TERMS } from './offerEmployment';

export const DEFAULT_OFFER_SECTIONS: OfferSectionConfig[] = [
  ['candidate-role', 'Candidate and Role'], ['job-description', 'Job Description'], ['responsibilities', 'Responsibilities'],
  ['start-date', 'Start Date'], ['employment-type', 'Employment Type'], ['employment-end-date', 'Employment End Date'], ['department', 'Department'],
  ['reporting-to', 'Reporting To'], ['compensation', 'Compensation'], ['monthly-salary', 'Monthly Salary'],
  ['annualized-salary', 'Annualized Salary'], ['probationary-salary', 'Probationary Salary'],
  ['regularization-salary', 'Regularization Salary'], ['allowances', 'Allowances'],
  ['bonuses-incentives', 'Bonuses and Incentives'], ['work-schedule-location', 'Work Schedule and Location'],
  ['benefits-conditions', 'Benefits and Conditions'], ['benefits-growth', 'Benefits and Growth'],
  ['milestones', '30/60/90-Day Expectations'], ['career-growth', 'Career Growth'], ['additional-terms', 'Additional Terms & Conditions'], ['next-steps', 'Next Steps'],
  ['acceptance-decline', 'Acceptance and Decline'], ['signature', 'Signature Section'],
].map(([id, label], order) => ({ id, label, visible: true, order }));

const templateDetails = (businessUnit: string, jobTitle: string): OfferBuilderDetails => ({
  jobTitle,
  department: 'Guest Experience',
  businessUnit,
  reportingManager: 'Operations Manager',
  workLocation: 'Metro Manila, Philippines',
  workSetup: 'Onsite',
  rolePurpose: 'Create safe, memorable guest experiences while supporting smooth day-to-day operations and strong team performance.',
  responsibilities: [
    { id: 'r1', label: 'Welcome guests and deliver warm, attentive service.' },
    { id: 'r2', label: 'Follow operating, safety, cash-handling, and reporting procedures.' },
    { id: 'r3', label: 'Work closely with the team to keep the venue guest-ready.' },
  ],
  successOutcomes: [
    { id: 's1', label: 'Consistently high guest satisfaction.' },
    { id: 's2', label: 'Accurate and timely operating reports.' },
    { id: 's3', label: 'Strong teamwork and reliable shift execution.' },
  ],
  milestones: {
    '30': { description: 'Complete onboarding and learn core systems and standards.', successCriteria: 'Can complete daily duties with appropriate support.' },
    '60': { description: 'Own regular shift responsibilities and contribute improvements.', successCriteria: 'Consistent service and reporting quality.' },
    '90': { description: 'Complete a performance review and agree on next growth priorities.', successCriteria: 'Meets role expectations and has a documented development plan.' },
  },
  currency: 'PHP',
  payFrequency: 'Monthly',
  payrollSchedule: '15th and 30th of each month',
  grossMonthlySalary: 40000,
  grossAnnualizedSalary: 480000,
  compensationEntered: true,
  probationarySalary: 40000,
  regularizationSalary: 40000,
  commissionOrIncentive: 'Performance-based, subject to policy and eligibility.',
  bonusEligibility: 'Subject to company policy, eligibility, and performance.',
  allowances: [],
  benefits: [
    { id: 'hmo', name: 'HMO', description: 'Healthcare coverage subject to plan eligibility.', included: true, value: 'Standard plan' },
    { id: 'government', name: 'Government contributions', description: 'SSS, PhilHealth and Pag-IBIG contributions as required by law.', included: true },
    { id: 'leave', name: 'Paid leave', description: 'Paid leave subject to company policy and eligibility.', included: true },
    { id: 'discount', name: 'Staff discounts', description: 'Discounts on eligible products and services.', included: true },
  ],
  growthItems: [
    { id: 'onboarding', name: '30-day onboarding', description: 'A structured introduction to the team, tools, and role expectations.', included: true },
    { id: 'coaching', name: '60-day coaching check-in', description: 'A coaching conversation to review progress and remove blockers.', included: true },
    { id: 'review', name: '90-day performance review', description: 'A review point to align on progress and next steps.', included: true },
    { id: 'learning', name: 'Learning and development', description: 'Opportunities to build role-relevant skills.', included: true },
  ],
  welcomeMessage: `We’re excited to welcome you to ${businessUnit}. Here’s a clear look at your role, compensation, benefits, and growth opportunity.`,
  requireSignature: true,
  termsReviewed: false,
  additionalTerms: DEFAULT_ADDITIONAL_OFFER_TERMS,
  appearance: { ...appearanceForBusinessUnit(businessUnit), headerLayout: 'Split' },
  sectionConfig: DEFAULT_OFFER_SECTIONS.map(item => ({ ...item })),
});

const preset = (key: string, businessUnit: string, name: string, jobTitle: string, category: string): OfferTemplate => ({
  id: `starter-${key}`,
  name,
  businessUnit,
  description: `A reusable ${businessUnit} employment-offer template with editable branding, compensation, benefits, and response sections.`,
  category,
  status: 'Active',
  templateKey: key,
  isStarter: true,
  templateData: templateDetails(businessUnit, jobTitle),
  createdAt: new Date(0),
  updatedAt: new Date(0),
  persisted: false,
});

export const OFFER_TEMPLATE_PRESETS: OfferTemplate[] = [
  preset('dessert-museum-offer', 'The Dessert Museum', 'Dessert Museum — Guest Experience', 'Guest Experience Associate', 'Guest Experience'),
  preset('gootopia-offer', 'Gootopia', 'Gootopia — Experience Facilitator', 'Experience Facilitator', 'Guest Experience'),
  preset('bakebe-offer', 'Bakebe', 'Bakebe — Baking Studio Host', 'Baking Studio Host', 'Studio Operations'),
  preset('inflatable-island-offer', 'Inflatable Island Beach Club', 'Inflatable Island — Guest Experience & Safety', 'Guest Experience & Safety Associate', 'Operations'),
  preset('fun-roof-offer', 'The Fun Roof', 'Fun Roof — Guest Experience & Reservations', 'Guest Experience & Reservations Host', 'Hospitality'),
  preset('sprinkle-saloon-offer', 'The Sprinkle Saloon', 'Sprinkle Saloon — Guest Experience', 'Guest Experience Associate', 'Guest Experience'),
];

export const cloneOfferTemplate = (template: OfferTemplate): OfferTemplate => ({
  ...template,
  templateData: JSON.parse(JSON.stringify(template.templateData)),
  createdAt: new Date(template.createdAt),
  updatedAt: new Date(template.updatedAt),
});
