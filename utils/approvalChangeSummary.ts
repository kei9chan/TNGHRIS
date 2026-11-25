export type ChangeApprovalKind = 'pan' | 'requisition' | 'pay_package';
export type ChangePreview = { id: string; kind: ChangeApprovalKind; snapshot: string; data: Record<string, any> };
export type SummaryLine = { label: string; value?: string; before?: string; after?: string };
export type ChangeSummary = { title: string; lines: SummaryLine[]; note?: string; reason?: string };
const numeric = (value: unknown): number | undefined => value === null || value === undefined || value === '' || !Number.isFinite(Number(value)) ? undefined : Number(value);
export const approvalMoney = (value: unknown) => numeric(value) === undefined ? 'Not recorded' : `₱${numeric(value)!.toLocaleString('en-PH', { maximumFractionDigits: 2 })}`;
const text = (value: unknown): string => Array.isArray(value) ? value.join(', ') : value == null || value === '' ? 'Not recorded' : String(value);
const readable = (value: unknown): string => typeof value === 'boolean' ? value ? 'Yes' : 'No' : text(value).replaceAll('_', ' ');
const changed = (before: unknown, after: unknown) => JSON.stringify(before ?? null) !== JSON.stringify(after ?? null);
const basis = (value: unknown) => value === 'net_tax' ? 'Net · employer pays withholding tax' : value === 'gross' ? 'Gross · employee pays withholding tax' : text(value);
const delta = (before: unknown, after: unknown) => numeric(before) === undefined || numeric(after) === undefined ? '' : `${Number(after) - Number(before) >= 0 ? '+' : '−'}${approvalMoney(Math.abs(Number(after) - Number(before)))}`;
const amountRate = (p: any) => `${approvalMoney(p?.base_amount)} / ${text(p?.rate_type)}`;
const range = (min: unknown, max: unknown, multiplier = 1) => {
  const low = numeric(min), high = numeric(max);
  if (low === undefined && high === undefined || low === 0 && high === 0) return 'Budget not recorded';
  if (low === undefined || low === 0) return `Up to ${approvalMoney(high! * multiplier)}`;
  if (high === undefined || high === 0) return `From ${approvalMoney(low * multiplier)}`;
  if (high < low) return 'Budget range needs review';
  return low === high ? approvalMoney(low * multiplier) : `${approvalMoney(low * multiplier)}–${approvalMoney(high * multiplier)}`;
};
export function getApprovalChangeSummary(preview: ChangePreview): ChangeSummary {
  const d = preview.data;
  if (preview.kind === 'requisition') {
    const count = numeric(d.headcount);
    const employment = d.employmentType === 'Seasonal' ? `Seasonal · ${text(d.seasonalMonths)} months` : text(d.employmentType);
    return { title: `${count ?? 'Unspecified'} ${count === 1 ? 'hire' : 'hires'} · ${employment}`, lines: [
      { label: 'Salary budget / hire', value: range(d.salaryMin, d.salaryMax) },
      { label: 'Total salary budget', value: count && count > 0 ? range(d.salaryMin, d.salaryMax, count) : 'Headcount not recorded' },
      { label: 'Location', value: [d.locationType, d.location].filter(Boolean).join(' · ') || 'Not recorded' },
    ], note: 'Salary budget only; benefits and employer contributions are additional. Budget period is not specified on the requisition.', reason: d.reason };
  }
  if (preview.kind === 'pan') {
    const labels: Record<string, string> = { changeOfStatus: 'Status change', promotion: 'Promotion', transfer: 'Transfer', salaryIncrease: 'Salary increase', changeOfJobTitle: 'Job title change' };
    const title = [...Object.entries(labels).filter(([key]) => d.action?.[key]).map(([, label]) => label), d.action?.others].filter(Boolean).join(' · ') || 'Personnel action';
    const from = d.particulars?.from || {}, to = d.particulars?.to || {};
    const lines: SummaryLine[] = [];
    for (const [key, label] of [['employmentStatus','Employment status'], ['position','Position'], ['department','Department'], ['businessUnit','Business unit'], ['otherBusinessUnits','Other business units']]) {
      if (changed(from[key], to[key])) lines.push({ label, before: text(from[key]), after: text(to[key]) });
    }
    for (const [key, label] of [['basic','Basic pay'], ['deminimis','De minimis'], ['reimbursable','Reimbursable allowance']]) {
      const before = from.salary?.[key], after = to.salary?.[key];
      if (numeric(before) !== numeric(after)) lines.push({ label: `${label}${delta(before, after) ? ` (${delta(before, after)})` : ''}`, before: approvalMoney(before), after: approvalMoney(after) });
    }
    if (changed(from.salary?.payBasis || 'gross', to.salary?.payBasis || 'gross')) lines.push({ label: 'Tax responsibility', before: basis(from.salary?.payBasis || 'gross'), after: basis(to.salary?.payBasis || 'gross') });
    lines.sort((a, b) => Number(b.label.startsWith('Basic pay')) - Number(a.label.startsWith('Basic pay')));
    return { title, lines: lines.length ? lines : [{ label: 'Changes', value: 'No changed fields recorded. Review the full PAN.' }], reason: d.reason };
  }
  const proposed = d.proposed || {}, previous = d.previous;
  const lines: SummaryLine[] = [{ label: 'Base pay', ...(previous ? { before: amountRate(previous), after: amountRate(proposed) } : { value: amountRate(proposed) }) }];
  if (previous && previous.rate_type === proposed.rate_type && numeric(previous.base_amount) !== numeric(proposed.base_amount)) lines.push({ label: 'Base pay change', value: `${delta(previous.base_amount, proposed.base_amount)} / ${text(proposed.rate_type)}` });
  const components = (p: any): any[] => Array.isArray(p?.components) ? p.components : [];
  // Group identical component names so multiple lines are never silently lost.
  const grouped = (p: any) => {
    const map = new Map<string, any[]>();
    for (const c of components(p)) { const key = c.name || 'Unnamed component'; map.set(key, [...(map.get(key) || []), c]); }
    return map;
  };
  const oldComponents = grouped(previous), newComponents = grouped(proposed);
  const describe = (rows?: any[]) => rows?.map(c => `${approvalMoney(c.amount)} / ${c.frequency || c.recurrence || 'period not recorded'}${c.classification === 'receipt_based' || c.category === 'reimbursable_allowance' ? ' · receipt required' : c.classification === 'conditional' || ['service_charge','variable_pay'].includes(c.category) ? ' · conditional' : ''}`).join('; ') || 'Not included';
  for (const key of new Set([...oldComponents.keys(), ...newComponents.keys()])) {
    const before = oldComponents.get(key), after = newComponents.get(key);
    if (!previous || changed(before, after)) {
      const oldText = describe(before), newText = describe(after);
      lines.push({ label: key, ...(previous ? { before: oldText, after: newText } : { value: newText }) });
      const ruleLabels: Record<string, string> = { taxTreatment: 'tax treatment', classification: 'classification', paidBy: 'paid by', includedInGuaranteedPay: 'guaranteed', affectsEmployerCost: 'employer cost', employeeShare: 'employee share', employerShare: 'employer share', companyPaidEmployeeShare: 'company-paid employee share', eligibilityRule: 'eligibility', policyRef: 'policy', policyLimit: 'policy limit', receiptRequired: 'receipt required', receiptStatus: 'receipt status', payableDate: 'payable date', employerPaidTax: 'employer-paid tax' };
      for (let index = 0; index < Math.max(before?.length || 0, after?.length || 0); index++) {
        const old = before?.[index], next = after?.[index];
        if (!old || !next) continue;
        for (const [field, label] of Object.entries(ruleLabels)) {
          if (changed(old[field], next[field])) lines.push({ label: `${key}${(after?.length || 0) > 1 ? ` ${index + 1}` : ''} · ${label}`, before: readable(old[field]), after: readable(next[field]) });
        }
      }
    }
  }
  const oldTreatment = previous?.treatment || {}, newTreatment = proposed.treatment || {};
  const settingLabels: Record<string, string> = { payBasis: 'Pay basis', coverageMode: 'Pay coverage', taxResponsibility: 'Tax paid by', benefitResponsibility: 'Benefits paid by', taxCoverage: 'Tax coverage', netTarget: 'Net target', estimatedEmployeeDeductions: 'Estimated employee deductions', estimatedEmployerContributions: 'Estimated employer contributions', estimatedEmployerTax: 'Estimated employer tax', expectedReimbursableCost: 'Expected reimbursement cost', tax: 'Taxable base', sss: 'SSS base', philhealth: 'PhilHealth base', pagibig: 'Pag-IBIG base', thirteenthMonth: '13th-month base', proration: 'Proration' };
  for (const [key, label] of Object.entries(settingLabels)) {
    if (changed(oldTreatment[key], newTreatment[key]) && (newTreatment[key] !== undefined || previous)) lines.push({ label, ...(previous ? { before: readable(oldTreatment[key]), after: readable(newTreatment[key]) } : { value: readable(newTreatment[key]) }) });
  }
  return { title: previous ? 'Pay package changes' : 'Proposed pay package', lines, note: previous ? 'Compared with the earlier approved package in the same payroll scope and stream. Amounts retain their own pay frequency.' : 'No earlier approved package in this payroll scope and stream. Amounts retain their own pay frequency.', reason: d.reason };
}
