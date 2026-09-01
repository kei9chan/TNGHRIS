import {
  COEEmployeeSnapshot,
  COELayoutSettings,
  COEPurpose,
  COERequest,
  COETemplate,
  COETemplateStyle,
  getCoePurposeLabel,
} from '../types';

export const COE_PLACEHOLDERS = [
  '{{employee_name}}',
  '{{position}}',
  '{{department}}',
  '{{business_unit}}',
  '{{date_hired}}',
  '{{end_date}}',
  '{{employment_status}}',
  '{{salary}}',
  '{{purpose}}',
  '{{date_today}}',
  '{{business_address}}',
  '{{signatory_name}}',
  '{{signatory_position}}',
] as const;

export const DEFAULT_COE_LAYOUT: COELayoutSettings = {
  marginTopMm: 20,
  marginRightMm: 20,
  marginBottomMm: 20,
  marginLeftMm: 20,
  lineHeight: 1.6,
  textAlignment: 'justify',
  logoAlignment: 'center',
  logoHeightMm: 24,
};
export const COE_SAMPLE_EMPLOYEE: COEEmployeeSnapshot = {
  id: 'sample-employee',
  name: 'Alexandra Reyes',
  email: 'alexandra.reyes@example.com',
  position: 'Guest Experience Supervisor',
  department: 'Operations',
  businessUnit: 'Selected Business Unit',
  businessUnitId: 'sample-business-unit',
  dateHired: '2022-03-14',
  employmentStatus: 'Regular',
  salary: 35000,
  purpose: 'loan application',
  issueDate: new Date().toISOString(),
  requestDate: new Date().toISOString(),
};

export type COEPresetDefinition = {
  key: COETemplateStyle;
  name: string;
  description: string;
  documentTitle: string;
  body: string;
  fontFamily: string;
  primaryColor: string;
  accentColor: string;
  layoutSettings: COELayoutSettings;
};

export const COE_TEMPLATE_PRESETS: COEPresetDefinition[] = [
  {
    key: 'classic-corporate',
    name: 'Classic Corporate COE',
    description: 'Traditional official employment certificate layout.',
    documentTitle: 'Certificate of Employment',
    body: '<p>This is to certify that <strong>{{employee_name}}</strong> is a bona fide employee of <strong>{{business_unit}}</strong> and currently holds the position of <strong>{{position}}</strong> in the {{department}} department. The employee has served from {{date_hired}} {{end_date}}.</p><p>This certification is issued upon the employee\'s request for {{purpose}}.</p><p>Issued this {{date_today}}.</p>',
    fontFamily: 'Times New Roman',
    primaryColor: '#1e3a8a',
    accentColor: '#64748b',
    layoutSettings: { ...DEFAULT_COE_LAYOUT, marginTopMm: 22, marginRightMm: 22, marginBottomMm: 22, marginLeftMm: 22, lineHeight: 1.65 },
  },
  {
    key: 'modern-minimal',
    name: 'Modern Minimal COE',
    description: 'Contemporary whitespace-led official certificate.',
    documentTitle: 'Certificate of Employment',
    body: '<p>This letter confirms that <strong>{{employee_name}}</strong> is employed by <strong>{{business_unit}}</strong> as <strong>{{position}}</strong>, {{department}}. Employment commenced on {{date_hired}} and the current status is {{employment_status}}.</p><p>This certificate is provided for {{purpose}}.</p><p>Issued on {{date_today}}.</p>',
    fontFamily: 'Arial',
    primaryColor: '#111827',
    accentColor: '#94a3b8',
    layoutSettings: { ...DEFAULT_COE_LAYOUT, marginTopMm: 24, marginRightMm: 24, marginBottomMm: 24, marginLeftMm: 24, lineHeight: 1.55, textAlignment: 'left', logoAlignment: 'left', logoHeightMm: 20 },
  },
  {
    key: 'branded-accent',
    name: 'Branded Accent COE',
    description: 'Modern business-unit color accents with an official A4 layout.',
    documentTitle: 'Certificate of Employment',
    body: '<p>To whom it may concern:</p><p>This is to certify that <strong>{{employee_name}}</strong> is employed with <strong>{{business_unit}}</strong> as <strong>{{position}}</strong> under {{department}}, beginning {{date_hired}}. Employment status: {{employment_status}}.</p><p>This certificate is issued for {{purpose}} on {{date_today}}.</p>',
    fontFamily: 'Arial',
    primaryColor: '#4f46e5',
    accentColor: '#c7d2fe',
    layoutSettings: { ...DEFAULT_COE_LAYOUT, marginTopMm: 18, marginRightMm: 22, marginBottomMm: 20, marginLeftMm: 22, logoAlignment: 'left', logoHeightMm: 22 },
  },
  {
    key: 'business-unit-signature',
    name: 'Business-Unit Signature COE',
    description: 'Strong header, signature block, and business-unit footer treatment.',
    documentTitle: 'Certification',
    body: '<p>This is to certify that <strong>{{employee_name}}</strong> has been employed by <strong>{{business_unit}}</strong> as <strong>{{position}}</strong> in {{department}} from {{date_hired}} {{end_date}}.</p><p>This certification is issued at the employee\'s request for {{purpose}} and may be used for lawful purposes.</p><p>Given this {{date_today}} at {{business_address}}.</p>',
    fontFamily: 'Georgia',
    primaryColor: '#0f172a',
    accentColor: '#f59e0b',
    layoutSettings: { ...DEFAULT_COE_LAYOUT, marginBottomMm: 18, lineHeight: 1.65, logoHeightMm: 26 },
  },
];

const escapeHtml = (value: unknown) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#039;');

const formatDate = (value?: string | Date) => {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' });
};

const purposeLabel = (request: COERequest, employee: COEEmployeeSnapshot) => {
  if (employee.purpose) return employee.purpose;
  if (request.purpose === COEPurpose.Others) return request.otherPurposeDetail || 'personal purposes';
  return getCoePurposeLabel(request.purpose, request.otherPurposeDetail).toLowerCase();
};

export const buildCoePlaceholderValues = (
  template: COETemplate,
  request: COERequest,
  employee: COEEmployeeSnapshot,
  currency = 'PHP',
) => ({
  employee_name: employee.name,
  position: employee.position || '—',
  department: employee.department || '—',
  business_unit: employee.businessUnit || template.businessUnitName || '—',
  date_hired: formatDate(employee.dateHired) || '—',
  end_date: employee.endDate ? `to ${formatDate(employee.endDate)}` : 'to the present',
  employment_status: employee.employmentStatus || 'Active',
  salary: employee.salary == null
    ? 'Confidential / not included'
    : new Intl.NumberFormat('en-PH', { style: 'currency', currency }).format(employee.salary),
  purpose: purposeLabel(request, employee),
  date_today: formatDate(employee.issueDate || request.approvedAt || new Date()),
  business_address: template.address || 'the registered business address',
  signatory_name: template.signatoryName,
  signatory_position: template.signatoryPosition,
});

export const validateCoePlaceholders = (body: string): string[] => {
  const allowed = new Set(COE_PLACEHOLDERS.map(value => value.slice(2, -2)));
  const matches = body.matchAll(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g);
  return Array.from(new Set(Array.from(matches)
    .map(match => match[1])
    .filter(value => !allowed.has(value))));
};

export const sanitizeCoeHtml = (html: string) => {
  if (typeof window === 'undefined' || typeof DOMParser === 'undefined') {
    return html
      .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '')
      .replace(/\son\w+\s*=\s*(["']).*?\1/gi, '')
      .replace(/javascript:/gi, '');
  }
  const documentValue = new DOMParser().parseFromString(html, 'text/html');
  documentValue.querySelectorAll('script,iframe,object,embed,form').forEach(node => node.remove());
  documentValue.querySelectorAll('*').forEach(node => {
    Array.from(node.attributes).forEach(attribute => {
      if (/^on/i.test(attribute.name)) node.removeAttribute(attribute.name);
      if ((attribute.name === 'href' || attribute.name === 'src') && /^\s*javascript:/i.test(attribute.value)) {
        node.removeAttribute(attribute.name);
      }
    });
  });
  return documentValue.body.innerHTML;
};

export const renderCoeBody = (
  template: COETemplate,
  request: COERequest,
  employee: COEEmployeeSnapshot,
  currency = 'PHP',
) => {
  const values = buildCoePlaceholderValues(template, request, employee, currency);
  let body = template.body || '';
  Object.entries(values).forEach(([key, value]) => {
    body = body.replace(new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`, 'g'), escapeHtml(value));
  });
  return sanitizeCoeHtml(body);
};

export const applyCoePreset = (
  current: Partial<COETemplate>,
  presetKey: COETemplateStyle,
  businessUnitColor?: string,
): Partial<COETemplate> => {
  const preset = COE_TEMPLATE_PRESETS.find(item => item.key === presetKey) || COE_TEMPLATE_PRESETS[0];
  return {
    ...current,
    name: preset.name,
    description: preset.description,
    documentTitle: preset.documentTitle,
    body: preset.body,
    styleKey: preset.key,
    primaryColor: businessUnitColor || preset.primaryColor,
    accentColor: preset.accentColor,
    fontFamily: preset.fontFamily,
    layoutSettings: { ...preset.layoutSettings },
  };
};
