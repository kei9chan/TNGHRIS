type DecisionDetails = Record<string, unknown>;

const ENTITY_NAMES: Record<string, string> = {
  AssetRequest: 'Asset request', BenefitRequest: 'Benefit request', COERequest: 'Certificate request',
  JobRequisition: 'Job requisition', LeaveRequest: 'Leave request', ManpowerRequest: 'Manpower request',
  NTE: 'Notice to Explain', OTRequest: 'Overtime request', PAN: 'Personnel Action Notice',
  WFHRequest: 'Work-from-home request',
};

const textValue = (value: unknown): string => typeof value === 'string' ? value.trim() : '';

export const parseDecisionDetails = (value: string): { summary: string; stage: string; transition: string; comment: string } => {
  let details: DecisionDetails | null = null;
  try {
    const parsed = JSON.parse(value);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) details = parsed as DecisionDetails;
  } catch {
    // Older audit records contain an already-readable sentence.
  }
  if (!details) return { summary: value, stage: '', transition: '', comment: '' };
  const newStage = textValue(details.newStage);
  const newStatus = textValue(details.newStatus);
  const previousStatus = textValue(details.previousStatus);
  const rawStage = textValue(details.approvalStage);
  const comment = textValue(details.comments) || textValue(details.comment) || textValue(details.reason);
  const stage = rawStage.replaceAll('_', ' / ').replace(/\bBod\b/gi, 'BOD').replace(/\bGm\b/gi, 'GM').replace(/\bHr\b/gi, 'HR');
  const transition = previousStatus && newStatus ? `${previousStatus} → ${newStatus}` : newStatus;
  const summary = newStage.toUpperCase() === 'COMPLETED'
    ? 'Final approval completed.'
    : newStatus.toLowerCase() === 'rejected' ? 'Request rejected.' : 'Approval decision recorded.';
  return { summary, stage, transition, comment };
};

export const formatEntityName = (entity: string): string => ENTITY_NAMES[entity]
  || entity.replace(/([a-z])([A-Z])/g, '$1 $2').replaceAll('_', ' ').trim();

export const formatDecisionTime = (timestamp: string): string => new Intl.DateTimeFormat('en-PH', {
  timeZone: 'Asia/Manila', month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
}).format(new Date(timestamp));
