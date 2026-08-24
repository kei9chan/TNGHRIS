import {
  PAN,
  PANActionTaken,
  PANActionType,
  PANFieldConfig,
  PANSectionConfig,
  PANTemplate,
  PANTemplateSnapshot,
} from '../types';

export const DEFAULT_PAN_SECTIONS: PANSectionConfig[] = [
  { key: 'employee_information', label: 'Employee information', visible: true, required: true, order: 1 },
  { key: 'action_taken', label: 'Action taken', visible: true, required: true, order: 2 },
  { key: 'effective_date', label: 'Effectivity date', visible: true, required: true, order: 3 },
  { key: 'from_to', label: 'From vs To comparison', visible: true, required: true, order: 4 },
  { key: 'salary_package', label: 'Salary package', visible: true, required: false, order: 5 },
  { key: 'remarks', label: 'Remarks / justifications', visible: true, required: false, order: 6 },
  { key: 'approval_signatures', label: 'Approval / signature blocks', visible: true, required: true, order: 7 },
  { key: 'employee_acknowledgement', label: 'Employee acknowledgement', visible: true, required: true, order: 8 },
];

export const DEFAULT_PAN_FIELDS: PANFieldConfig[] = [
  { key: 'employee_name', label: "Employee's Name", visible: true, required: true, section: 'employee_information', display: 'text', order: 1 },
  { key: 'date_hired', label: 'Date Hired', visible: true, required: false, section: 'employee_information', display: 'text', order: 2 },
  { key: 'department', label: 'Department', visible: true, required: false, section: 'from_to', display: 'table', order: 3 },
  { key: 'position', label: 'Position', visible: true, required: false, section: 'from_to', display: 'table', order: 4 },
  { key: 'business_unit', label: 'Business Unit / Company', visible: true, required: false, section: 'from_to', display: 'table', order: 5 },
  { key: 'other_business_units', label: 'Other Business Unit(s) / Affiliates', visible: true, required: false, section: 'from_to', display: 'table', order: 6 },
  { key: 'employment_status', label: 'Employment Status', visible: true, required: false, section: 'from_to', display: 'table', order: 7 },
  { key: 'salary', label: 'Salary / Compensation', visible: true, required: false, section: 'salary_package', display: 'table', order: 8 },
  { key: 'remarks', label: 'Remarks / Justifications', visible: true, required: false, section: 'remarks', display: 'text', order: 9 },
  { key: 'signatures', label: 'Signatures', visible: true, required: true, section: 'approval_signatures', display: 'signature', order: 10 },
];

export const getPANActionType = (action?: Partial<PANActionTaken>): PANActionType => {
  if (action?.transfer) return 'transfer';
  if (action?.promotion) return 'promotion';
  if (action?.salaryIncrease) return 'salary_increase';
  if (action?.changeOfJobTitle) return 'job_title_change';
  if (action?.changeOfStatus) return 'status_change';
  if (action?.others) return 'other';
  return 'general';
};

export const PAN_ACTION_TYPE_LABELS: Record<PANActionType, string> = {
  general: 'General Personnel Action',
  status_change: 'Employment Status Change',
  promotion: 'Promotion',
  transfer: 'Transfer / Business Unit Change',
  salary_increase: 'Salary Increase',
  job_title_change: 'Job Title Change',
  other: 'Other Personnel Action',
};

export const shouldShowSalary = (pan: Partial<PAN>, template?: Partial<PANTemplate | PANTemplateSnapshot>) => {
  const section = template?.sections?.find(item => item.key === 'salary_package');
  if (section && !section.visible) return false;
  return !!pan.actionTaken?.salaryIncrease || section?.required === true;
};

export const createTemplateSnapshot = (template: PANTemplate): PANTemplateSnapshot => ({
  id: template.id,
  name: template.name,
  version: template.version,
  businessUnitId: template.businessUnitId,
  actionType: template.actionType,
  documentTitle: template.documentTitle,
  documentCode: template.documentCode,
  footerText: template.footerText,
  colorAccent: template.colorAccent,
  paperSize: template.paperSize,
  orientation: template.orientation,
  logoUrl: template.logoUrl,
  preparerName: template.preparerName,
  preparerSignatureUrl: template.preparerSignatureUrl,
  sections: template.sections,
  fieldConfig: template.fieldConfig,
});

export const selectPANTemplate = (
  templates: PANTemplate[],
  businessUnitId: string | undefined,
  actionType: PANActionType,
) => {
  const published = templates.filter(item => item.status === 'published');
  return published.find(item => item.businessUnitId === businessUnitId && item.actionType === actionType)
    || published.find(item => item.businessUnitId === businessUnitId && item.isDefault)
    || published.find(item => !item.businessUnitId && item.isDefault && item.actionType === actionType)
    || published.find(item => !item.businessUnitId && item.isDefault)
    || published.find(item => !item.businessUnitId && item.actionType === actionType)
    || published[0];
};

export const normalizeTemplateSections = (value: unknown): PANSectionConfig[] => {
  if (!Array.isArray(value) || !value.length) return DEFAULT_PAN_SECTIONS.map(item => ({ ...item }));
  const supplied = new Map(value.map(item => [item?.key, item]));
  return DEFAULT_PAN_SECTIONS.map(defaultItem => ({ ...defaultItem, ...(supplied.get(defaultItem.key) || {}) }))
    .sort((a, b) => a.order - b.order);
};

export const normalizeTemplateFields = (value: unknown): PANFieldConfig[] => {
  if (!Array.isArray(value) || !value.length) return DEFAULT_PAN_FIELDS.map(item => ({ ...item }));
  const supplied = new Map(value.map(item => [item?.key, item]));
  return DEFAULT_PAN_FIELDS.map(defaultItem => ({ ...defaultItem, ...(supplied.get(defaultItem.key) || {}) }))
    .sort((a, b) => a.order - b.order);
};
