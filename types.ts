
// This file contains all the type definitions for the application.

// =================================================================================
// GENERAL & CORE TYPES
// =================================================================================

export enum Permission {
  View = 'view',
  Create = 'create',
  Edit = 'edit',
  Submit = 'submit',
  Review = 'review',
  Approve = 'approve',
  Reject = 'reject',
  Return = 'return',
  Cancel = 'cancel',
  Finalize = 'finalize',
  Manage = 'manage',
  Delete = 'delete',
  Export = 'export',
  Download = 'download',
  Assign = 'assign',
  Reassign = 'reassign',
  Publish = 'publish',
}

export enum Role {
  Admin = 'Admin',
  HRManager = 'HR Manager',
  HRStaff = 'HR Staff',
  BOD = 'Board of Director',
  GeneralManager = 'GeneralManager',
  OperationsDirector = 'Operations Director',
  BusinessUnitManager = 'Business Unit Manager',
  Manager = 'Manager',
  Employee = 'Employee',
  FinanceStaff = 'Finance Staff',
  Auditor = 'Auditor',
  IT = 'IT',
}

export type Resource =
  | 'Dashboard' | 'Employees' | 'PAN' | 'Files' | 'Feedback' | 'Evaluation' | 'Timekeeping' | 'Clock' | 'OT' | 'MyCases'
  | 'Leave' | 'LeavePolicies' | 'Exceptions' | 'PayrollPrep' | 'PayrollStaging' | 'Payslips' | 'GovernmentReports'
  | 'ReportTemplates' | 'Reports' | 'FinalPay' | 'ClockLog' | 'Settings' | 'AuditLog' | 'Helpdesk'
  | 'Announcements' | 'Recruitment' | 'Requisitions' | 'JobPosts' | 'Applicants' | 'Candidates'
  | 'Interviews' | 'Offers' | 'Offboarding' | 'Analytics' | 'Departments' | 'Loans' | 'User' | 'Sites' | 'Assets' | 'AssetRequests' | 'WorkforcePlanning' | 'Lifecycle' | 'Payroll' | 'Manpower' | 'COE' | 'Benefits' | 'PulseSurvey' | 'Coaching' | 'WFH' | 'CodeOfDiscipline' | 'FeedbackTemplates' | 'Pipeline' | 'WorkforcePlanningAdmin'
  | 'Calendar' | 'OrgChart' | 'DailyTimeReview' | 'MemoLibrary' | 'Employee Correspondence' | 'RolesPermissions' | 'UserManagement' | 'SiteManagement' | 'LeavePolicies' | 'Holidays' | 'AuditLog'
  | 'ApplicationPages' | 'IncidentReports';

export type PermissionsMatrix = {
  [key in Role]?: Partial<Record<Resource, Permission[]>>;
};

export interface NavLink {
  name: string;
  path: string;
  requiredPermission: { resource: Resource; permission: Permission };
  children?: NavLink[];
}

export interface BusinessUnit {
  id: string;
  name: string;
  color?: string;
  code?: string; // e.g., TFR, TNG
  // For Government Forms
  sssNumber?: string;
  tin?: string;
  address?: string;
}

export interface Department {
  id: string;
  name: string;
  businessUnitId: string;
}

export interface Team {
  id: string;
  name: string;
  departmentId: string;
}

export interface Settings {
  appName: string;
  appLogoUrl: string;
  reminderCadence: number;
  emailProvider: 'SendGrid' | 'Mailgun';
  smsProvider: 'Twilio' | 'Vonage';
  pdfHeader: string;
  pdfFooter: string;
  currency: string;
  [key: string]: any; // For dynamic description keys
}

// =================================================================================
// WFH (WORK FROM HOME) TYPES
// =================================================================================

export enum WFHRequestStatus {
  PendingSubmission = 'WFH_PENDING_SUBMISSION',
  PendingDeptHead = 'WFH_PENDING_DEPT_HEAD_APPROVAL',
  PendingGM = 'WFH_PENDING_GM_APPROVAL',
  PendingBOD = 'WFH_PENDING_BOD_APPROVAL',
  ForTimekeeping = 'WFH_FOR_TIMEKEEPING',
  Approved = 'WFH_APPROVED',
  Rejected = 'WFH_REJECTED',
}

export interface WFHRequest {
  id: string;
  employeeId: string;
  employeeName: string;
  date: Date;
  endDate?: Date;
  reason: string;
  status: WFHRequestStatus;
  reportLink?: string; // Optional URL for output/accomplishment report
  approvedBy?: string; // The BOD ID who won the "race"
  approvedAt?: Date;
  rejectionReason?: string;
  createdAt: Date;
  approvalRoute?: 'MANAGER_ONLY' | 'BOD_REQUIRED';
  approvalReason?: string;
  approvalContext?: Record<string, unknown>;
}

// =================================================================================
// COACHING & MENTORING TYPES
// =================================================================================

export enum CoachingStatus {
  Draft = 'Draft',
  Scheduled = 'Scheduled',
  Accepted = 'Accepted',
  Completed = 'Completed',
  Acknowledged = 'Acknowledged',
  Declined = 'Declined'
}

export enum CoachingTrigger {
  Attendance = 'Attendance',
  Performance = 'Performance',
  Behavior = 'Behavior',
  SkillGap = 'Skill Gap',
  CareerDevelopment = 'Career Development'
}

export interface CoachingSession {
  id: string;
  employeeId: string;
  employeeName: string;
  coachId: string;
  coachName: string;
  trigger: CoachingTrigger;
  context: string; // The issue or reason
  date: Date;
  time?: string; // Format HH:mm
  medium?: 'Phone Call' | 'Face to Face' | 'Virtual';
  meetingLink?: string; // Only required if Virtual
  status: CoachingStatus;

  // Phase 2 fields
  rootCause?: string;
  actionPlan?: string;
  followUpDate?: Date;
  employeeSignatureUrl?: string;
  coachSignatureUrl?: string;
  acknowledgedAt?: Date;
}

// =================================================================================
// PULSE SURVEY TYPES
// =================================================================================

export enum PulseSurveyStatus {
  Draft = 'Draft',
  Active = 'Active',
  Closed = 'Closed',
}

export interface PulseSurveyQuestion {
  id: string;
  text: string;
  type: 'rating' | 'text'; // Rating is implicitly 1-5 Likert
}

export interface SurveySection {
  id: string;
  title: string;
  description?: string;
  questions: PulseSurveyQuestion[];
}

export interface PulseSurvey {
  id: string;
  title: string;
  description: string;
  startDate: Date;
  endDate?: Date;
  status: PulseSurveyStatus;
  isAnonymous: boolean;
  sections: SurveySection[];
  targetDepartments?: string[]; // Optional: if empty, targets all
  createdByUserId: string;
  createdAt: Date;
}

export interface SurveyResponse {
  id: string;
  surveyId: string;
  respondentId: string; // User ID. If anonymous, this is still stored to track completion but hidden in reporting.
  submittedAt: Date;
  answers: {
    questionId: string;
    value: number | string; // number for rating, string for text
  }[];
  comments?: string; // General comments for the survey
}

// =================================================================================
// BENEFITS & PERKS TYPES
// =================================================================================

export enum BenefitRequestStatus {
  PendingHR = 'Pending HR Review',
  PendingBOD = 'Pending Board Approval',
  Approved = 'Approved', // Ready for issuance
  Fulfilled = 'Fulfilled', // Voucher given/used
  Rejected = 'Rejected',
  Cancelled = 'Cancelled'
}

export interface BenefitType {
  id: string;
  name: string;
  description: string;
  maxValue?: number; // Optional limit
  requiresBodApproval: boolean;
  isActive: boolean;
}

export interface BenefitRequest {
  id: string;
  employeeId: string;
  employeeName: string; // Denormalized for easier display
  benefitTypeId: string;
  benefitTypeName: string; // Denormalized
  amount?: number;
  details: string; // Justification/Notes
  dateNeeded: Date;
  status: BenefitRequestStatus;
  submissionDate: Date;

  // Approval Trail
  hrEndorsedBy?: string;
  hrEndorsedAt?: Date;
  bodApprovedBy?: string;
  bodApprovedAt?: Date;

  // Fulfillment
  fulfilledBy?: string;
  fulfilledAt?: Date;
  voucherCode?: string;
  rejectionReason?: string;
}

// =================================================================================
// CERTIFICATE OF EMPLOYMENT (COE) TYPES
// =================================================================================

export enum COEPurpose {
  LoanApplication = 'LOAN_APPLICATION',
  VisaTravel = 'VISA_TRAVEL',
  SchoolEducation = 'SCHOOL_EDUCATION',
  GovernmentLegal = 'GOVERNMENT_LEGAL',
  GeneralEmployment = 'GENERAL_EMPLOYMENT',
  Others = 'OTHERS',

  // Retained for existing requests and historical document snapshots.
  Travel = 'TRAVEL',
  VisaApplication = 'VISA_APPLICATION',
  SchoolApplication = 'SCHOOL_APPLICATION',
  LegalPurposes = 'LEGAL_PURPOSES',
}

export const COE_PURPOSE_OPTIONS: Array<{ value: COEPurpose; label: string }> = [
  { value: COEPurpose.LoanApplication, label: 'Loan Application' },
  { value: COEPurpose.VisaTravel, label: 'Visa/Travel' },
  { value: COEPurpose.SchoolEducation, label: 'School/Education' },
  { value: COEPurpose.GovernmentLegal, label: 'Government/Legal' },
  { value: COEPurpose.GeneralEmployment, label: 'General Employment' },
  { value: COEPurpose.Others, label: 'Other' },
];

export const COE_PURPOSE_LABELS: Record<string, string> = {
  [COEPurpose.LoanApplication]: 'Loan Application',
  [COEPurpose.VisaTravel]: 'Visa/Travel',
  [COEPurpose.SchoolEducation]: 'School/Education',
  [COEPurpose.GovernmentLegal]: 'Government/Legal',
  [COEPurpose.GeneralEmployment]: 'General Employment',
  [COEPurpose.Others]: 'Other',
  [COEPurpose.Travel]: 'Visa/Travel',
  [COEPurpose.VisaApplication]: 'Visa/Travel',
  [COEPurpose.SchoolApplication]: 'School/Education',
  [COEPurpose.LegalPurposes]: 'Government/Legal',
};

export const getCoePurposeLabel = (
  purpose?: COEPurpose | string | null,
  otherPurposeDetail?: string | null,
) => {
  if (purpose === COEPurpose.Others && otherPurposeDetail?.trim()) return otherPurposeDetail.trim();
  return COE_PURPOSE_LABELS[String(purpose || '')] || String(purpose || '').replace(/_/g, ' ');
};

export enum COERequestStatus {
  // Legacy value retained so existing records continue to render and filter.
  Pending = 'Pending',
  PendingHRManagerApproval = 'Pending HR Manager Approval',
  ReturnedForRevision = 'Returned for Revision',
  Approved = 'Approved',
  Rejected = 'Rejected',
}

export const isPendingCoeRequestStatus = (status?: COERequestStatus | string | null) =>
  status === COERequestStatus.Pending || status === COERequestStatus.PendingHRManagerApproval;

export enum COEApprovalAuthority {
  HRManager = 'HR_MANAGER',
  HRStaff = 'HR_STAFF',
  HRManagerOrHRStaff = 'HR_MANAGER_OR_HR_STAFF',
}

export const COE_APPROVAL_AUTHORITY_LABELS: Record<COEApprovalAuthority, string> = {
  [COEApprovalAuthority.HRManager]: 'HR Manager only',
  [COEApprovalAuthority.HRStaff]: 'HR Staff only',
  [COEApprovalAuthority.HRManagerOrHRStaff]: 'HR Manager or HR Staff',
};

export const COE_APPROVAL_PENDING_LABELS: Record<COEApprovalAuthority, string> = {
  [COEApprovalAuthority.HRManager]: 'HR Manager Approval',
  [COEApprovalAuthority.HRStaff]: 'HR Staff Approval',
  [COEApprovalAuthority.HRManagerOrHRStaff]: 'HR Manager or HR Staff Approval',
};

export type COETemplateStatus = 'Draft' | 'Published' | 'Archived';

export type COETemplateStyle =
  | 'classic-corporate'
  | 'modern-minimal'
  | 'branded-accent'
  | 'business-unit-signature';

export interface COELayoutSettings {
  marginTopMm: number;
  marginRightMm: number;
  marginBottomMm: number;
  marginLeftMm: number;
  lineHeight: number;
  textAlignment: 'left' | 'center' | 'right' | 'justify';
  logoAlignment: 'left' | 'center' | 'right';
  logoHeightMm: number;
}

export interface COETemplate {
  id: string;
  businessUnitId: string;
  businessUnitName?: string;
  name?: string;
  description?: string;
  documentTitle?: string;
  logoUrl?: string;
  address: string;
  body: string; // HTML content with placeholders like {{employee_name}}, {{date_hired}}, etc.
  signatoryName: string;
  signatoryPosition: string;
  signatureUrl?: string;
  footerText?: string;
  styleKey?: COETemplateStyle;
  primaryColor?: string;
  accentColor?: string;
  fontFamily?: string;
  layoutSettings?: COELayoutSettings;
  status?: COETemplateStatus;
  version?: number;
  isPreset?: boolean;
  presetKey?: string;
  createdFromTemplateId?: string;
  purposes?: COEPurpose[];
  recommendedPurposes?: COEPurpose[];
  isActive: boolean;
}

export interface COEEmployeeSnapshot {
  id: string;
  name: string;
  email?: string;
  position: string;
  department: string;
  departmentId?: string;
  businessUnit: string;
  businessUnitId: string;
  dateHired?: string;
  endDate?: string;
  employmentStatus?: string;
  salary?: number;
  purpose: string;
  issueDate: string;
  requestDate?: string;
}

export interface COEDocumentData {
  request: COERequest;
  template: COETemplate;
  employee: COEEmployeeSnapshot;
  meta: {
    generationSource: 'template' | 'fallback' | 'historical_snapshot';
    fallbackReason?: string;
    snapshotCreatedAt?: string;
    documentVersion: number;
    salaryRedacted?: boolean;
  };
}

export interface COERequest {
  id: string;
  employeeId: string;
  employeeName: string; // Helper for UI
  employeePosition?: string; // Snapshot of role/title at request time
  businessUnitId: string; // Snapshot for filtering
  employeeDepartmentId?: string; // Snapshot for dept-level filtering
  purpose: COEPurpose;
  otherPurposeDetail?: string;
  dateRequested: Date;
  status: COERequestStatus;
  rejectionReason?: string;
  generatedDocumentUrl?: string; // Placeholder for generated PDF
  templateId?: string;
  templateName?: string;
  snapshotCreatedAt?: Date;
  generationSource?: 'template' | 'fallback' | 'historical_snapshot';
  fallbackReason?: string;
  documentVersion?: number;
  approvedBy?: string;
  approvedByName?: string;
  approvedAt?: Date;
  returnReason?: string;
  returnedBy?: string;
  returnedAt?: Date;
  contentEdited?: boolean;
}

// =================================================================================
// WORKFORCE PLANNING TYPES (NEW)
// =================================================================================

export interface ServiceArea {
  id: string;
  businessUnitId: string;
  name: string;
  capacity?: number;
  description?: string;
}

export enum DayTypeTier {
  OffPeak = 'Off-Peak',
  Peak = 'Peak',
  SuperPeak = 'Super Peak',
}

export interface DemandTypeConfig {
  id: string;
  businessUnitId: string;
  tier: DayTypeTier;
  color: string; // Tailwind class or hex
  label: string; // Custom label
  description?: string;
}

export interface StaffingRequirement {
  id: string;
  areaId: string;
  role: string; // Job Position
  dayTypeTier: DayTypeTier;
  minCount: number;
  maxCount?: number;
  startTime?: string; // Optional shift block specifics
  endTime?: string;
}

// =================================================================================
// MANPOWER REQUISITION (ON-CALL) TYPES
// =================================================================================

export enum ManpowerRequestStatus {
  Pending = 'Pending',
  Approved = 'Approved',
  Rejected = 'Rejected'
}

export enum ManpowerApprovalStage {
  BusinessUnitManager = 'BUSINESS_UNIT_MANAGER',
  BodGm = 'BOD_GM',
  Completed = 'COMPLETED',
  Rejected = 'REJECTED',
}

export interface ManpowerApprovalTrailEntry {
  stage: ManpowerApprovalStage | string;
  action: string;
  approverName: string;
  approverRole: string;
  timestamp: string | Date;
  previousStatus?: string;
  newStatus?: string;
  previousStage?: string;
  newStage?: string;
  comments?: string;
}

export interface ManpowerRequestItem {
  id: string;
  // `role`, `currentFte`, `requestedCount`, and `costPerHead` remain as
  // compatibility aliases for records created by the original form.
  role: string;
  departmentId?: string;
  departmentName?: string;
  requiredFte?: number;
  reportingFte?: number;
  onCallNeeded?: number;
  currentFte: number;
  requestedCount: number;
  costPerHead: number;
  ratePerDay?: number;
  totalItemCost: number;
  shiftPreset?: 'Opening' | 'Mid' | 'Closing' | 'Custom' | string;
  shiftTime: string;
  reason?: string;
  departmentNote?: string;
  otherReason?: string;
  justification: string;
}

export interface ManpowerRequest {
  id: string;
  businessUnitId: string;
  departmentId?: string;
  businessUnitName: string;
  requestedBy: string;
  requesterName: string;
  date: Date; // The date the on-calls are needed for
  forecastedPax: number;
  generalNote?: string; // The "Header Reason"
  items: ManpowerRequestItem[];
  grandTotal: number; // Sum of all items
  status: ManpowerRequestStatus;
  approvalStage?: ManpowerApprovalStage | string;
  approvalIssue?: string;
  approvalTrail?: ManpowerApprovalTrailEntry[];
  createdAt: Date;
  approvedBy?: string;
  approvedAt?: Date;
  rejectionReason?: string;
}

// =================================================================================
// PAYROLL CONFIGURATION TYPES
// =================================================================================

export interface SSSTableRow {
  rangeStart: number;
  rangeEnd: number;
  regularSS: number;
  wisp: number;
  ec: number; // Employee Compensation
  totalContribution: number; // Employer + Employee
  employeeShare: number;
  employerShare: number;
}

export interface PhilHealthConfig {
  minSalary: number;
  maxSalary: number;
  rate: number; // Percentage (e.g., 0.05 for 5%)
  employerShareRatio: number; // e.g., 0.5 for 50%
}

export interface TaxTableRow {
  level: number;
  rangeStart: number;
  rangeEnd: number;
  baseTax: number;
  rate: number; // Percentage excess
}

export interface HolidayPolicy {
  type: HolidayType;
  rate: number; // Multiplier (e.g., 1.0, 0.3, 2.0)
  description: string;
}


// =================================================================================
// USER & AUTHENTICATION TYPES
// =================================================================================

export interface SalaryBreakdown {
  basic: number;
  deminimis: number;
  reimbursable: number;
}

export enum RateType {
  Monthly = 'Monthly',
  Daily = 'Daily',
  Hourly = 'Hourly',
}

export enum TaxStatus {
  Single = 'Single',
  Married = 'Married',
  HeadOfFamily = 'Head of Family',
}

export interface AccessScope {
  type: 'GLOBAL' | 'SPECIFIC' | 'HOME_ONLY' | 'SELF' | 'DIRECT_REPORTS' | 'DEPARTMENT';
  allowedBuIds?: string[]; // Only required if type is 'SPECIFIC'
}

export type EmploymentStatus = 'Regular' | 'Probationary' | 'Contractual' | (string & {});

export interface User {
  id: string;
  employeeId?: string;
  authUserId?: string;
  name: string;
  email: string;
  role: Role;
  department: string;
  businessUnit: string;
  departmentId?: string;
  businessUnitId?: string;
  status: 'Active' | 'Inactive';
  isDuplicate?: boolean;
  accountLifecycleReason?: string;
  accountInactivatedAt?: Date;
  accountInactivatedBy?: string;
  accountReactivatedAt?: Date;
  accountReactivatedBy?: string;
  employmentStatus?: EmploymentStatus; // New Field
  isPhotoEnrolled: boolean;
  dateHired?: Date;
  birthDate?: Date;
  endDate?: Date;
  position: string;
  reportsTo?: string;
  managerId?: string;
  salary?: SalaryBreakdown;
  monthlySalary?: number;
  activeDeviceId?: string;
  signatureUrl?: string;
  profilePictureUrl?: string;
  securityPin?: string;
  isGoogleConnected?: boolean;

  // Access Control
  accessScope?: AccessScope;
  roles?: Role[];
  dashboardType?: 'executive' | 'hr' | 'admin' | 'admin_it' | 'manager' | 'employee' | string;
  sensitivePermissions?: Record<string, Permission[]>;
  workflowPermissions?: Record<string, Permission[]>;
  effectiveFeaturePermissions?: Record<string, Permission[]>;
  authorizationDiagnostic?: string;
  permissionUpdatedAt?: Date;
  permissionUpdatedBy?: string;
  permissionUpdatedByName?: string;

  // PII
  sssNo?: string;
  pagibigNo?: string;
  philhealthNo?: string;
  tin?: string;
  emergencyContact?: {
    name: string;
    relationship: string;
    phone: string;
  };
  bankingDetails?: {
    bankName: string;
    accountNumber: string;
    accountType: 'Savings' | 'Checking';
  };
  rateType?: RateType;
  rateAmount?: number;
  taxStatus?: TaxStatus;
  leaveQuotaVacation?: number;
  leaveQuotaSick?: number;
  leaveQuotaOffset?: number;
  leaveLastCreditDate?: Date;
  leaveInfo?: {
    balances: {
      vacation: number;
      sick: number;
    };
    lastCreditDate?: Date;
    accrualRate: number;
  }
}

export interface DeviceBind {
  id: string;
  employeeId: string;
  deviceId: string;
  platform: 'web' | 'ios' | 'android';
  appVersion: string;
  lastLogin: Date;
  isBlocked: boolean;
}

export interface DeviceSecurityProfile {
  platform: string;
  jailbreak_flag: boolean;
  emulator_flag: boolean;
  deviceId: string;
}

// =================================================================================
// ASSET MANAGEMENT TYPES
// =================================================================================
export enum AssetStatus {
  Available = 'Available',
  Assigned = 'Assigned',
  InRepair = 'In Repair',
  Retired = 'Retired',
}

export interface Asset {
  id: string;
  assetTag: string;
  name: string;
  type: 'Laptop' | 'Mobile Phone' | 'Monitor' | 'Software License' | 'Other';
  businessUnitId: string;
  serialNumber?: string;
  purchaseDate: Date;
  value: number;
  status: AssetStatus;
  notes?: string;
  brand?: string;
  model?: string;
  description?: string;
  condition?: string;
  warrantyExpiry?: Date;
}

export interface AssetAssignment {
  id: string;
  assetId: string;
  employeeId: string;
  dateAssigned: Date;
  dateReturned?: Date;
  conditionOnAssign: string;
  conditionOnReturn?: string;
  managerProofUrlOnReturn?: string;
  isAcknowledged?: boolean;
  acknowledgedAt?: Date;
  signedDocumentUrl?: string; // The URL/Base64 of the signed policy PDF
}

export interface AssetRepair {
  id: string;
  assetId: string;
  dateIn: Date;
  dateOut?: Date;
  notes: string;
  cost?: number;
}

export enum AssetRequestStatus {
  Pending = 'Pending',
  Returned = 'Returned',
  Approved = 'Approved',
  Rejected = 'Rejected',
  Fulfilled = 'Fulfilled',
}


export interface AssetRequest {
  id: string;
  requestType: 'Request' | 'Return';
  employeeId: string;
  employeeName: string;
  assetDescription: string;
  justification: string;
  status: AssetRequestStatus;
  requestedAt: Date;
  managerId: string;
  managerNotes?: string;
  approvedAt?: Date;
  rejectedAt?: Date;
  fulfilledAt?: Date;
  assetId?: string; // Optional, for return requests
  employeeSubmissionNotes?: string;
  employeeProofUrl?: string;
  employeeSubmittedAt?: Date;
  rejectionReason?: string;
}

// =================================================================================
// ENRICHED TYPES (For UI Display)
// =================================================================================

export interface EnrichedAsset extends Asset {
  assignedTo?: User;
  dateAssigned?: Date;
  businessUnitName: string;
}

export interface EnrichedAssetRequest extends AssetRequest {
  assetName: string;
  assetTag?: string;
  businessUnitName: string;
  requester: User | undefined;
}

// =================================================================================
// AUDIT & HISTORY TYPES
// =================================================================================

export type AuditAction = 'CREATE' | 'READ' | 'UPDATE' | 'DELETE' | 'LOGIN' | 'LOGOUT' | 'APPROVE' | 'REJECT' | 'GENERATE' | 'EXPORT' | 'SUBMIT';

export interface AuditLog {
  id: string;
  timestamp: Date;
  userId: string;
  userEmail: string;
  action: AuditAction;
  entity: string;
  entityId: string;
  details: string;
}

export enum ChangeHistoryStatus {
  Pending = 'Pending Approval',
  Approved = 'Approved',
  Rejected = 'Rejected',
}

export interface ChangeHistory {
  id: string;
  employeeId: string;
  timestamp: Date;
  changedBy: string;
  field: string;
  oldValue: any;
  newValue: any;
  status: ChangeHistoryStatus;
  submissionId: string;
  rejectionReason?: string;
}

export enum EmployeeDraftStatus {
  Draft = 'Draft',
  Submitted = 'Submitted',
  Approved = 'Approved',
  Rejected = 'Rejected',
}

export interface EmployeeDraft {
  id: string;
  employeeId: string;
  draftData: Partial<User>;
  status: EmployeeDraftStatus;
  createdAt: Date;
  submissionId?: string;
}

// =================================================================================
// FEEDBACK & DISCIPLINE TYPES
// =================================================================================

export interface PipelineStage {
  id: string;
  name: string;
  isLocked?: boolean;
  sort_order?: number;
  code?: string;
}

export enum IRStatus {
  Draft = 'Draft',
  Submitted = 'Submitted',
  HRReview = 'HR Review',
  ReturnedForRevision = 'Returned for Revision',
  Rejected = 'Rejected',
  Converted = 'Converted',
  NoAction = 'NoAction',
  Closed = 'Closed',
}

export interface ChatMessage {
  id: string;
  userId: string;
  userName: string;
  timestamp: Date;
  text: string;
}

export interface FollowUpHistoryItem {
  sentAt: Date;
  sentById: string;
  sentByName: string;
}

export interface IncidentEvidenceItem {
  path: string;
  name: string;
  kind: 'file' | 'link';
}

export interface IncidentReport {
  id: string;
  category: string;
  description: string;
  location: string;
  dateTime: Date;
  involvedEmployeeIds: string[];
  involvedEmployeeNames: string[];
  witnessIds: string[];
  witnessNames: string[];
  reportedBy: string;
  status: IRStatus;
  pipelineStage: string;
  nteIds: string[];
  nteProcessingComplete?: boolean;
  nteProcessingSummary?: {
    totalEmployees: number;
    employeesWithNte: number;
    activeNtes: number;
    statusCounts: Record<string, number>;
    processingIncomplete?: boolean;
  };
  resolutionId?: string;
  chatThread: ChatMessage[];
  attachmentUrl?: string;
  attachmentUrls?: IncidentEvidenceItem[];
  signatureDataUrl?: string;
  assignedToId?: string;
  assignedToName?: string;
  businessUnitId?: string;
  businessUnitName?: string;
  caseNumber?: number;
  createdAt?: Date;
  slaDeadline?: Date;
  followUpCount?: number;
  lastFollowUpAt?: Date;
  followUpHistory?: FollowUpHistoryItem[];
  revisionNotes?: string;
  rejectionReason?: string;
  revisionHistory?: Array<Record<string, unknown>>;
}

export enum NTEStatus {
  Draft = 'Draft',
  PendingApproval = 'PendingApproval',
  Approved = 'Approved',
  Rejected = 'Rejected',
  Issued = 'Issued',
  ResponseSubmitted = 'Response Submitted',
  Waiver = 'Waiver',
  HearingScheduled = 'Hearing Scheduled',
  Closed = 'Closed',
}

export interface HearingAcknowledgment {
  userId: string;
  userName: string;
  role: 'Employee' | 'Panel';
  date: Date;
}

export interface HearingDetails {
  date: Date;
  location: string; // URL for virtual, or physical address
  type: 'Virtual' | 'Face-to-Face';
  panelIds: string[];
  notes?: string;
  acknowledgments: HearingAcknowledgment[];
}

export interface NTE {
  id: string;
  incidentReportId: string;
  employeeId: string;
  employeeName: string;
  status: NTEStatus;
  issuedDate: Date;
  deadline: Date;
  details: string; // The specific allegations
  body: string; // The full rendered body of the notice
  employeeResponse: string;
  responseDate?: Date;
  memoIds: string[];
  disciplineCodeIds: string[];
  evidenceUrl?: string;
  employeeResponseEvidenceUrl?: string;
  employeeResponseSignatureUrl?: string;
  issuedByUserId: string;
  approverSteps?: ApproverStep[];
  decisionMakerSignatureUrl?: string;
  hearingDetails?: HearingDetails;
  nteNumber?: number | string;
  templateId?: string;
  revisionNote?: string;
  revisionRequestedAt?: Date;
  revisionRequestedBy?: string;
  closureReason?: string;
  closedAt?: Date;
  closedBy?: string;
  workflowHistory?: NTEWorkflowEvent[];
}

export interface NTEWorkflowEvent {
  action: 'RETURN_FOR_REVISION' | 'RESUBMITTED' | 'CLOSE' | string;
  note?: string;
  actorId: string;
  actorName: string;
  timestamp: Date | string;
}

export enum ResolutionStatus {
  Draft = 'Draft',
  PendingApproval = 'Pending Approval',
  Approved = 'Approved',
  Issued = 'Issued',
  PendingAcknowledgement = 'Pending Acknowledgement',
  Acknowledged = 'Acknowledged',
  Rejected = 'Rejected',
}

export enum ResolutionType {
  CaseDismissed = 'CaseDismissed',
  VerbalWarning = 'Verbal Warning',
  WrittenWarning = 'Written Warning',
  Suspension = 'Suspension',
  Termination = 'Termination',
}

export enum ApproverStatus {
  Pending = 'Pending',
  Approved = 'Approved',
  ReturnedForRevision = 'Returned for Revision',
  Rejected = 'Rejected',
  Cancelled = 'Cancelled',
}

export interface ApproverStep {
  approvalId?: string;
  userId: string;
  userName: string;
  roleId?: string;
  role?: string;
  roleSnapshot?: string;
  isBod?: boolean;
  required?: boolean;
  status: ApproverStatus;
  assignedAt?: Date;
  timestamp?: Date;
  comments?: string;
  rejectionReason?: string;
}

export interface Resolution {
  id: string;
  incidentReportId: string;
  employeeId: string;
  resolutionType: ResolutionType;
  details: string;
  decisionDate: Date;
  closedByUserId: string;
  status: ResolutionStatus;
  approverSteps: ApproverStep[];
  decisionMakerSignatureUrl?: string;
  supportingDocumentUrl?: string;
  employeeAcknowledgedAt?: Date;
  employeeAcknowledgementSignatureUrl?: string;
  acknowledgementDeadline?: Date;
  sentToEmployeeAt?: Date;
  manualClosureReason?: string;

  // Suspension Specifics
  suspensionType?: 'Consecutive' | 'Non-Consecutive';
  suspensionDays?: number;
  suspensionStartDate?: Date;
  suspensionEndDate?: Date;
  suspensionDates?: Date[];
}

export interface Memo {
  id: string;
  title: string;
  body: string;
  effectiveDate: Date;
  targetDepartments: string[];
  targetBusinessUnits: string[];
  acknowledgementRequired: boolean;
  tags: string[];
  attachments: string[];
  acknowledgementTracker: string[];
  acknowledgementSignatures?: MemoAcknowledgement[];
  status: 'Published' | 'Draft' | 'Archived';
  memoNumber?: string;
  memoType?: string;
  targetEmployeeIds?: string[];
  publicationDate?: Date;
  notes?: string;
}

export interface MemoAcknowledgement {
  userId: string;
  signatureDataUrl?: string;
  acknowledgedAt?: Date;
}

export interface FeedbackTemplate {
  id: string;
  title: string;
  from: string;
  subject: string;
  cc: string;
  body: string; // HTML or markdown with placeholders like {{allegations}}
  signatoryName: string;
  signatoryTitle: string;
  signatorySignatureUrl?: string;
  logoUrl?: string;
}

export enum SeverityLevel {
  Low = 'Low',
  Medium = 'Medium',
  High = 'High',
  Critical = 'Critical',
}

export interface SanctionStep {
  offense: number;
  action: string;
}

export interface DisciplineEntry {
  id: string;
  code: string;
  category: string;
  description: string;
  severityLevel: SeverityLevel;
  sanctions: SanctionStep[];
  businessUnitId?: string;
  isActive?: boolean;
  archivedAt?: Date;
  lastModifiedAt: Date;
  lastModifiedByUserId: string;
}

export interface DisciplineCategory {
  name: string;
  originalName?: string;
  description?: string;
  displayOrder: number;
  isActive: boolean;
  archivedAt?: Date;
  entryCount: number;
}

export type DisciplineImportMode = 'add_only' | 'update_only' | 'add_update';

export interface DisciplineImportRow {
  rowNumber: number;
  code: string;
  category: string;
  severity_level: string;
  description: string;
  sanction_1?: string;
  sanction_2?: string;
  sanction_3?: string;
  sanction_4?: string;
  sanction_5?: string;
  business_unit?: string;
  status?: string;
  [key: string]: unknown;
}

export interface DisciplineImportError {
  rowNumber: number;
  code: string;
  field: string;
  reason: string;
  suggestion: string;
}

export interface DisciplineImportResult {
  importId: string;
  total: number;
  imported: number;
  updated: number;
  skipped: number;
  failed: number;
  errors: DisciplineImportError[];
}

export interface CodeOfDiscipline {
  version: string;
  effectiveDate: Date;
  entries: DisciplineEntry[];
}

// =================================================================================
// PAYROLL & TIMEKEEPING TYPES
// =================================================================================

export interface Site {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  radiusMeters: number;
  businessUnitId: string;
  allowedWifiSSIDs?: string[];
  gracePeriodMinutes?: number;
}

export interface ShiftTemplate {
  id: string;
  name: string;
  startTime: string;
  endTime: string;
  breakMinutes: number;
  gracePeriodMinutes: number;
  businessUnitId: string;
  color: string;
  isFlexible?: boolean;
  minHoursPerDay?: number;
  minDaysPerWeek?: number;
}

export interface ShiftAssignment {
  id: string;
  employeeId: string;
  shiftTemplateId: string;
  date: Date;
  locationId: string;
  assignedAreaId?: string; // For phase 2
}

export interface ShiftRotationTemplate {
  id: string;
  name: string;
  businessUnitId: string;
  sequence: (string | 'OFF')[]; // Array of ShiftTemplate IDs or 'OFF'
}

export interface ShiftRotationAssignment {
  id: string;
  employeeId: string;
  rotationTemplateId: string;
  startDate: Date;
}


export enum AttendanceException {
  Late = 'LATE_IN',
  Undertime = 'UNDERTIME',
  MissingOut = 'MISSING_OUT',
  Absent = 'ABSENT',
  OnLeave = 'ON_LEAVE',
}

export enum AttendanceStatus {
  Pending = 'Pending',
  Reviewed = 'Reviewed',
  Disputed = 'Disputed',
  Finalized = 'Finalized'
}

export interface AttendanceRecord {
  id: string;
  employeeId: string;
  employeeName: string;
  date: Date;
  scheduledStart: Date | null;
  scheduledEnd: Date | null;
  shiftName: string;
  firstIn: Date | null;
  lastOut: Date | null;
  totalWorkMinutes: number;
  breakMinutes: number;
  overtimeMinutes: number;
  exceptions: AttendanceException[];
  hasManualEntry: boolean;
  status: AttendanceStatus;
}

export enum TimeEventType {
  ClockIn = 'CLOCK_IN',
  ClockOut = 'CLOCK_OUT',
  StartBreak = 'START_BREAK',
  EndBreak = 'END_BREAK',
}

export enum TimeEventSource {
  Photo = 'Photo',
  GPS = 'GPS',
  QR = 'QR',
  Manual = 'Manual',
  System = 'System',
  Biometric = 'Biometric',
  Mobile = 'Mobile'
}

export enum AnomalyTag {
  LateIn = 'Late In',
  EarlyOut = 'Early Out',
  LateOut = 'Late Out',
  MissingIn = 'Missing In',
  Manual = 'Manual Entry',
  OutsideFence = 'Outside Geofence',
  DeviceChange = 'Device Change',
  FailedLiveness = 'FailedLiveness',
  ExpiredQR = 'Expired QR',
  AutoClosed = 'Auto-Closed',
}

export interface TimeEventExtra extends DeviceSecurityProfile {
  timezone: string;
  app_version: string;
  ip_hash: string;
  site_name: string;
  anomaly_tags: AnomalyTag[];
  lat?: number;
  lng?: number;
  wifi_ssid?: string;
  pin_last2?: string;
  note?: string;
  liveness?: 'pass' | 'fail';
  face_score?: number;
  model?: string;
}

export interface TimeEvent {
  id: string;
  employeeId: string;
  timestamp: Date;
  type: TimeEventType;
  source: TimeEventSource;
  locationId: string;
  extra: TimeEventExtra;
}

export enum OTStatus {
  Draft = 'Draft',
  Submitted = 'Submitted',
  PendingGM = 'PendingGM',
  PendingBOD = 'PendingBOD',
  Approved = 'Approved',
  Rejected = 'Rejected',
}

export interface OTRequestHistory {
  userId: string;
  userName: string;
  timestamp: Date;
  action: string;
  details?: string;
}

export interface OTRequest {
  id: string;
  employeeId: string;
  employeeName: string;
  date: Date;
  startTime: string;
  endTime: string;
  reason: string;
  otType?: 'Paid' | 'Offset';
  paidOtType?: 'Regular Overtime' | 'Legal Holiday' | 'Special Holiday' | 'Rest Day';
  status: OTStatus;
  submittedAt?: Date;
  isConverted?: boolean;
  convertedAt?: Date;
  approvedHours?: number;
  managerNote?: string;
  historyLog: OTRequestHistory[];
  attachmentUrl?: string;
  approvalRoute?: 'MANAGER_ONLY' | 'BOD_REQUIRED';
  approvalReason?: string;
  approvalContext?: Record<string, unknown>;
}

export enum ExceptionType {
  LateIn = 'LateIn',
  Undertime = 'Undertime',
  MissingIn = 'MissingIn',
  MissingOut = 'MissingOut',
  OutsideFence = 'OutsideFence',
  DoubleLog = 'DoubleLog',
  MissingBreak = 'MissingBreak',
  ExtendedBreak = 'ExtendedBreak',
}

export interface AttendanceExceptionRecord {
  id: string;
  employeeId: string;
  employeeName: string;
  date: Date;
  type: ExceptionType;
  details: string;
  status: 'Pending' | 'Acknowledged';
  sourceEventId: string;
}

export interface PayslipRecord {
  id: string;
  employeeId: string;
  employeeName: string;
  payPeriodStart: Date;
  payPeriodEnd: Date;
  totalEarnings: number;
  totalDeductions: number;
  netPay: number;
  status: 'draft' | 'published' | 'unpublished';
  lastGenerated: Date;
  earningsBreakdown?: {
    regularPay: number;
    otPay: number;
    allowances: number;
  };
  deductionsBreakdown?: {
    sss: number;
    pagibig: number;
    philhealth: number;
    tax: number;
  };
}

export interface GovernmentReport {
  id: string;
  name: string;
  description: string;
  status: 'Generated' | 'Submitted' | 'Not Generated';
}

export enum TemplateStatus {
  Active = 'Active',
  Archived = 'Archived',
}

export interface GovernmentReportTemplate {
  id: string;
  businessUnit: string;
  reportType: string;
  frequency: 'Monthly' | 'Quarterly' | 'Annually';
  status: TemplateStatus;
}

export enum FinalPayStatus {
  Draft = 'Draft',
  HRApproved = 'HR Approved',
  FinanceApproved = 'Finance Approved',
  Released = 'Released',
}

export interface FinalPayRecord {
  id: string;
  employeeId: string;
  employeeName: string;
  lastDay: Date;
  unusedLeaves: number;
  prorated13thMonth: number;
  leaveConversionPay: number;
  deductions: { description: string, amount: number }[];
  totalFinalPay: number;
  status: FinalPayStatus;
}

export enum OTRateType {
  Weekday = 'Weekday',
  Weekend = 'Weekend',
  Holiday = 'Holiday',
}

export interface OTStaging {
  id: string;
  employeeId: string;
  date: Date;
  approvedHours: number;
  rateType: OTRateType;
  sourceOtId: string;
}

export interface PayrollStagingRecord {
  id: string;
  employeeId: string;
  employeeName: string;
  payPeriodStart: Date;
  payPeriodEnd: Date;
  regularHours: number;
  overtimeHours: number;
  allowances: number;
  deductions: number;
  grossPay: number;
  netPay: number;
}

export interface OperatingHours {
  businessUnitId: string;
  hours: {
    [day: string]: { open: string; close: string; }; // e.g., 'Mon', 'Tue'
  }
}

// =================================================================================
// LEAVE TYPES
// =================================================================================
export interface LeaveType {
  id: string;
  name: string;
  paid: boolean;
  unit: 'day' | 'hour';
  minIncrement: number;
  requiresDocAfterDays: number | null;
}

export interface AccrualTier {
  minYears: number;       // e.g., 0
  maxYears: number | null; // e.g., 2 (null means "and up")
  entitlement: number;    // e.g., 5 days
}

export interface LeavePolicy {
  id: string;
  leaveTypeId: string;
  accrualRule: 'monthly' | 'annually' | 'none';
  accrualRate: number; // Deprecated in favor of tiers, kept for backward compatibility
  tiers: AccrualTier[];
  carryOverCap: number;
  allowNegative: boolean;
}

export interface LeaveBalance {
  employeeId: string;
  leaveTypeId: string;
  opening: number;
  accrued: number;
  used: number;
  adjusted: number;
}

export enum LeaveRequestStatus {
  Draft = 'Draft',
  Pending = 'Pending',
  PendingGM = 'PendingGM',
  PendingBOD = 'PendingBOD',
  Approved = 'Approved',
  Rejected = 'Rejected',
  Cancelled = 'Cancelled',
}

export interface LeaveRequest {
  id: string;
  employeeId: string;
  employeeName: string;
  businessUnitId?: string;
  departmentId?: string;
  leaveTypeId: string;
  startDate: Date;
  endDate: Date;
  startTime?: string;
  endTime?: string;
  durationDays: number;
  reason: string;
  status: LeaveRequestStatus;
  approverChain: { userId: string; status: 'Pending' | 'Approved' | 'Rejected', notes?: string }[];
  historyLog: { userId: string; userName: string; timestamp: Date; action: string; details?: string }[];
  attachmentUrl?: string;
  approverId?: string;
  approvalRoute?: 'MANAGER_ONLY' | 'BOD_REQUIRED';
  approvalReason?: string;
  approvalContext?: Record<string, unknown>;
  createdAt?: Date;
}

export enum LeaveLedgerEntryType {
  Accrual = 'Accrual',
  Usage = 'Usage',
  Adjustment = 'Adjustment',
  CarryOverApplied = 'Carry-Over Applied',
  CarryOverExpired = 'Carry-Over Expired',
}

export interface LeaveLedgerEntry {
  id: string;
  employeeId: string;
  leaveTypeId: string;
  date: Date;
  type: LeaveLedgerEntryType;
  change: number; // positive for additions, negative for deductions
  balanceAfter: number;
  notes?: string;
}

export enum HolidayType {
  Regular = 'Regular',
  SpecialNonWorking = 'Special Non-Working',
  DoublePay = 'Double Pay'
}

export interface Holiday {
  id: string;
  date: Date;
  name: string;
  type: HolidayType;
  isPaid: boolean;
}

// =================================================================================
// HELPDESK & CALENDAR TYPES
// =================================================================================
export enum TicketCategory {
  IT = 'IT',
  HR = 'HR',
  Finance = 'Finance',
  General = 'General',
}

export enum TicketPriority {
  Low = 'Low',
  Medium = 'Medium',
  High = 'High',
  Urgent = 'Urgent',
}

export enum TicketStatus {
  New = 'New',
  Assigned = 'Assigned',
  InProgress = 'In Progress',
  PendingResolution = 'Pending Resolution',
  Resolved = 'Resolved',
  Closed = 'Closed',
}

export interface Ticket {
  id: string;
  requesterId: string;
  requesterName: string;
  description: string;
  category: TicketCategory;
  priority: TicketPriority;
  status: TicketStatus;
  createdAt: Date;
  assignedToId?: string;
  assignedToName?: string;
  assignedAt?: Date;
  resolvedAt?: Date;
  slaDeadline?: Date;
  chatThread: ChatMessage[];
  attachments?: string[];
  businessUnitId?: string;
  businessUnitName?: string;
  followUpCount?: number;
  lastFollowUpAt?: Date;
  followUpHistory?: FollowUpHistoryItem[];
}

export enum AnnouncementType {
  General = 'General',
  Policy = 'Policy',
}

export interface Announcement {
  id: string;
  title: string;
  message: string;
  type: AnnouncementType;
  targetGroup: string; // e.g., 'All', 'HR', 'Operations'
  businessUnitId?: string; // Optional ID to link to specific BU
  createdBy: string;
  createdAt: Date;
  attachmentUrl?: string;
  acknowledgementIds: string[];
}

export interface AnnouncementRecipientStatus {
  id: string;
  announcementId: string;
  userId: string;
  employeeName: string;
  businessUnit?: string;
  department?: string;
  notifiedAt?: Date;
  readAt?: Date;
  acknowledgedAt?: Date;
  reminderCount: number;
  lastReminderAt?: Date;
}

export interface CalendarEvent {
  id: string;
  title: string;
  start: Date;
  end: Date;
  color: 'blue' | 'green' | 'red' | 'yellow' | 'purple';
}

export interface KnowledgeBaseCategory {
  id: string;
  name: string;
  description: string;
  icon: string; // Emoji
}

export interface KnowledgeBaseArticle {
  id: string;
  slug: string;
  title: string;
  categoryId: string;
  content: string; // HTML
  tags: string[];
  lastUpdatedAt: Date;
  viewCount: number;
}

// =================================================================================
// PERSONNEL ACTION NOTICE (PAN)
// =================================================================================
export enum PANStatus {
  Draft = 'Draft',
  PendingRecommender = 'Pending Recommender',
  PendingEndorser = 'Pending Endorser',
  PendingApproval = 'Pending Approval',
  PendingEmployee = 'Pending Employee',
  Completed = 'Completed',
  Declined = 'Declined',
  ReturnedForEdits = 'Returned for Edits',
  Cancelled = 'Cancelled',
}

export interface PANParticulars {
  businessUnit?: string;
  businessUnitId?: string;
  employmentStatus?: string;
  position?: string;
  department?: string;
  salary?: SalaryBreakdown;
  otherBusinessUnits?: string[];
}

export type PANActionType =
  | 'general'
  | 'status_change'
  | 'promotion'
  | 'transfer'
  | 'salary_increase'
  | 'job_title_change'
  | 'other';

export type PANTemplateStatus = 'draft' | 'published' | 'archived';
export type PANPaperSize = 'A4' | 'Letter';
export type PANOrientation = 'portrait' | 'landscape';

export type PANSectionKey =
  | 'employee_information'
  | 'action_taken'
  | 'effective_date'
  | 'from_to'
  | 'salary_package'
  | 'remarks'
  | 'approval_signatures'
  | 'employee_acknowledgement';

export interface PANSectionConfig {
  key: PANSectionKey;
  label: string;
  visible: boolean;
  required: boolean;
  order: number;
}

export interface PANFieldConfig {
  key: string;
  label: string;
  visible: boolean;
  required: boolean;
  section: PANSectionKey;
  display: 'text' | 'table' | 'checkbox' | 'signature';
  order: number;
}

export interface PANTemplateSnapshot {
  id?: string;
  name: string;
  version: number;
  businessUnitId?: string;
  actionType: PANActionType;
  documentTitle: string;
  documentCode: string;
  footerText: string;
  colorAccent: string;
  paperSize: PANPaperSize;
  orientation: PANOrientation;
  logoUrl?: string;
  preparerName?: string;
  preparerSignatureUrl?: string;
  sections: PANSectionConfig[];
  fieldConfig: PANFieldConfig[];
}

export interface PANActionTaken {
  changeOfStatus: boolean;
  promotion: boolean;
  transfer: boolean;
  salaryIncrease: boolean;
  changeOfJobTitle: boolean;
  others: string;
}

export enum PANRole {
  Recommender = 'Recommender',
  Endorser = 'Endorser',
  Approver = 'Approver',
  BOD = 'Board of Director',
  Acknowledger = 'Acknowledger',
}

export enum PANStepStatus {
  Waiting = 'Waiting',
  Pending = 'Pending',
  Approved = 'Approved',
  Declined = 'Declined',
  Cancelled = 'Cancelled',
}

export interface PANRoutingStep {
  id: string;
  userId: string;
  name: string;
  role: PANRole;
  status: PANStepStatus;
  order: number;
  timestamp?: Date;
  notes?: string;
}

export interface PAN {
  id: string;
  employeeId: string;
  employeeName: string;
  effectiveDate: Date;
  updatedAt?: Date;
  createdAt?: Date;
  status: PANStatus;
  actionTaken: PANActionTaken;
  particulars: {
    from: PANParticulars;
    to: PANParticulars;
  };
  tenure: string;
  notes: string;
  routingSteps: PANRoutingStep[];
  signedAt?: Date;
  signatureDataUrl?: string;
  signatureName?: string;
  logoUrl?: string;
  pdfHash?: string;
  preparerName?: string;
  preparerSignatureUrl?: string;
  createdByUserId?: string;
  workflowVersion?: number;
  approvalCompletedAt?: Date;
  rejectionReason?: string;
  cancelledAt?: Date;
  cancelledBy?: string;
  cancellationReason?: string;
  acceptedAt?: Date;
  acceptedBy?: string;
  appliedAt?: Date;
  templateId?: string;
  templateVersion?: number;
  templateName?: string;
  templateSnapshot?: PANTemplateSnapshot;
  businessUnitId?: string;
  actionType?: PANActionType;
}

export interface PANTemplate {
  id: string;
  name: string;
  actionTaken: Partial<PANActionTaken>;
  notes: string;
  logoUrl?: string;
  preparerName?: string;
  preparerSignatureUrl?: string;
  createdByUserId: string;
  createdAt: Date;
  updatedAt: Date;
  isDefault?: boolean;
  businessUnitId?: string;
  businessUnitName?: string;
  actionType: PANActionType;
  status: PANTemplateStatus;
  version: number;
  documentTitle: string;
  documentCode: string;
  footerText: string;
  colorAccent: string;
  paperSize: PANPaperSize;
  orientation: PANOrientation;
  sections: PANSectionConfig[];
  fieldConfig: PANFieldConfig[];
  publishedAt?: Date;
  publishedByUserId?: string;
  updatedByUserId?: string;
}


// =================================================================================
// EVALUATION TYPES
// =================================================================================
export enum EmployeeLevel {
  RankAndFile = 'Rank and File',
  Supervisory = 'Supervisory',
  Managerial = 'Managerial',
  Executive = 'Executive',
}

export interface QuestionSet {
  id: string;
  businessUnitId: string;
  name: string;
  description: string;
}

export interface EvaluationQuestion {
  id: string;
  questionSetId: string;
  title: string;
  description: string;
  questionType: 'rating' | 'paragraph';
  isArchived: boolean;
  targetEmployeeLevels: EmployeeLevel[];
  targetEvaluatorRoles: Role[];
}

export enum TimelineStatus {
  Draft = 'Draft',
  Active = 'Active',
  Completed = 'Completed',
}

export interface EvaluationTimeline {
  id: string;
  businessUnitId: string;
  name: string;
  type: 'Monthly' | 'Quarterly' | 'Annual' | 'Onboarding' | 'Custom';
  rolloutDate: Date;
  endDate: Date;
  status: TimelineStatus;
}

export enum RaterGroup {
  Self = 'Self',
  DirectSupervisor = 'Direct Supervisor',
  GeneralManager = 'General Manager',
  Peer = 'Peer',
  DirectReport = 'Direct Report',
}

// NEW: Evaluator Types for Group Assignment
export enum EvaluatorType {
  Individual = 'INDIVIDUAL',
  Group = 'GROUP'
}

export interface EvaluatorGroupFilter {
  businessUnitId?: string;
  departmentId?: string;
}

export interface EvaluatorConfig {
  id: string;
  type: EvaluatorType;
  weight: number;
  userId?: string; // For Individual
  groupFilter?: EvaluatorGroupFilter; // For Group
  isAnonymous: boolean;
  excludeSubject: boolean;
}

export interface Evaluation {
  id: string;
  name: string;
  timelineId: string;
  targetBusinessUnitIds: string[];
  targetEmployeeIds: string[];
  questionSetIds: string[];
  evaluators: EvaluatorConfig[]; // Updated from { userId: string, weight: number }[]
  status: 'InProgress' | 'Completed';
  createdAt: Date;
  updatedAt?: Date;
  isEmployeeVisible: boolean;
  acknowledgedBy?: string[];
  dueDate?: Date;
}

export interface EvaluationSubmission {
  id: string;
  evaluationId: string;
  subjectEmployeeId: string;
  raterId: string;
  raterGroup: RaterGroup;
  scores: { questionId: string; score?: number; answer?: string }[];
  submittedAt: Date;
}

// =================================================================================
// RECRUITMENT TYPES
// =================================================================================

export enum JobRequisitionStatus {
  Draft = 'Draft',
  PendingApproval = 'Pending Approval',
  Approved = 'Approved',
  Rejected = 'Rejected',
  Closed = 'Closed',
}

export enum JobRequisitionRole {
  HR = 'HR',
  BOD = 'Board of Director',
  Final = 'Final',
}

export enum JobRequisitionStepStatus {
  Waiting = 'Waiting',
  Pending = 'Pending',
  Approved = 'Approved',
  Rejected = 'Rejected',
}

export interface JobRequisition {
  id: string;
  reqCode: string;
  title: string;
  departmentId: string;
  businessUnitId: string;
  headcount: number;
  employmentType: 'Full-Time' | 'Part-Time' | 'Contract';
  locationType: 'Onsite' | 'Hybrid' | 'Remote';
  workLocation: string;
  budgetedSalaryMin: number;
  budgetedSalaryMax: number;
  justification: string;
  createdByUserId: string;
  status: JobRequisitionStatus;
  createdAt: Date;
  updatedAt: Date;
  isUrgent?: boolean;
  routingSteps: {
    id: string;
    userId: string;
    name: string;
    role: JobRequisitionRole;
    roleSnapshot?: string;
    isBod?: boolean;
    isRequired?: boolean;
    status: JobRequisitionStepStatus;
    order: number;
    timestamp?: Date;
    notes?: string;
  }[];
}

export enum JobPostStatus {
  Draft = 'Draft',
  Published = 'Published',
  Paused = 'Paused',
  Closed = 'Closed',
}

export interface JobPost {
  id: string;
  requisitionId: string;
  businessUnitId: string;
  title: string;
  slug: string;
  description: string;
  requirements: string;
  benefits: string;
  locationLabel: string;
  employmentType: 'Full-Time' | 'Part-Time' | 'Contract';
  status: JobPostStatus;
  publishedAt?: Date;
  channels: {
    careerSite: boolean;
    qr: boolean;
    social: boolean;
    jobBoards: boolean;
  };
  referralBonus?: number;
  applicationOpenAt?: Date;
  applicationCloseAt?: Date;
  isActive?: boolean;
  isArchived?: boolean;
  isFeatured?: boolean;
  isUrgent?: boolean;
  departmentLabel?: string;
  roleDetails?: RoleDetails;
}

export interface RoleFAQ {
  id: string;
  question: string;
  answer: string;
}

export type RoleApplicationQuestionType = 'shortText' | 'longText' | 'select' | 'yesNo' | 'number' | 'date';

export interface RoleApplicationQuestion {
  id: string;
  label: string;
  type: RoleApplicationQuestionType;
  required: boolean;
  step?: 2 | 3;
  options?: string[];
  helpText?: string;
}

/** Optional public-facing content for the reusable role information page. */
export interface RoleDetails {
  shortSummary?: string;
  workArrangement?: 'On-site' | 'Hybrid' | 'Remote' | string;
  salaryRange?: string;
  whyThisRoleMatters?: string;
  responsibilities?: string;
  qualifications?: string;
  requiredExperience?: string;
  preferredExperience?: string;
  benefits?: string;
  faqs?: RoleFAQ[];
  roleImage?: string;
  allowResumeLink?: boolean;
  collectCurrentCity?: boolean;
  collectLinkedIn?: boolean;
  collectCurrentEmployer?: boolean;
  collectEarliestStartDate?: boolean;
  applicationQuestions?: RoleApplicationQuestion[];
}

export enum CandidateSource {
  CareerSite = 'Career Site',
  JobBoard = 'Job Board',
  Referral = 'Referral',
  Sourced = 'Sourced',
  Internal = 'Internal',
}

export interface Candidate {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  source: CandidateSource;
  tags: string[];
  portfolioUrl?: string;
  consentAt?: Date;
  currentCity?: string;
  currentEmployer?: string;
  yearsRelevantExperience?: string;
  earliestStartDate?: string;
  linkedinUrl?: string;
}

export enum ApplicationStage {
  New = 'New',
  Screen = 'Screen',
  HMReview = 'HM Review',
  Interview = 'Interview',
  Offer = 'Offer',
  Hired = 'Hired',
  Rejected = 'Rejected',
  Withdrawn = 'Withdrawn',
}

export interface Application {
  id: string;
  candidateId: string;
  jobPostId: string;
  requisitionId: string;
  stage: ApplicationStage;
  ownerUserId?: string;
  createdAt: Date;
  updatedAt: Date;
  notes?: string;
  referrer?: string;
  roleId?: string;
  roleSlug?: string;
  roleTitleSnapshot?: string;
  departmentSnapshot?: string;
  locationSnapshot?: string;
  employmentTypeSnapshot?: string;
  workArrangementSnapshot?: string;
  roleAnswers?: Record<string, unknown>;
  sourceApplicationPage?: string;
  applicationReference?: string;
  submissionToken?: string;
  resumeLink?: string;
  resumeFileUrl?: string;
  resumeFilePath?: string;
  coverLetter?: string;
}

export enum InterviewType {
  Virtual = 'Virtual',
  Onsite = 'Onsite',
  Phone = 'Phone Screen',
}

export enum InterviewStatus {
  Scheduled = 'Scheduled',
  Completed = 'Completed',
  Cancelled = 'Cancelled',
}

export type InterviewMeetingProvider = 'Zoom' | 'Google Meet' | 'Custom';

export interface InterviewCalendarAttendeeStatus {
  email: string;
  displayName?: string;
  responseStatus?: string;
}

export interface InterviewIntegrationStatus {
  zoom: {
    connected: boolean;
    hostName?: string;
    hostEmail?: string;
    hostUserId?: string;
    accountName?: string;
    error?: string;
    alternativeHostEligibility?: Record<string, {
      eligible: boolean;
      reason: string;
      email?: string;
    }>;
  };
}

export interface Interview {
  id: string;
  applicationId: string;
  interviewType: InterviewType;
  scheduledStart: Date;
  scheduledEnd: Date;
  location: string; // URL for virtual, address for on-site
  panelUserIds: string[];
  calendarEventId?: string;
  googleCalendarLink?: string;
  googleMeetLink?: string;
  meetingProvider?: InterviewMeetingProvider;
  attendeeMeetingUrl?: string;
  zoomMeetingId?: string;
  zoomHostUserId?: string;
  zoomHostEmail?: string;
  zoomAlternativeHostEmails?: string[];
  customProviderName?: string;
  integrationStatus?: Record<string, unknown>;
  calendarAttendeeStatuses?: InterviewCalendarAttendeeStatus[];
  createdByUserId?: string;
  updatedByUserId?: string;
  updatedAt?: Date;
  interviewRound?: string;
  calendarInviteStatus?: 'not_requested' | 'sent' | 'failed' | 'partial' | string;
  applicantInviteStatus?: 'not_requested' | 'sent' | 'failed' | string;
  panelInviteStatus?: 'not_requested' | 'sent' | 'failed' | string;
  confirmationEmailStatus?: 'not_requested' | 'sent' | 'failed' | string;
  applicantInviteSentAt?: Date;
  panelInviteSentAt?: Date;
  confirmationEmailSentAt?: Date;
  calendarError?: string;
  status: InterviewStatus;
  interviewerId?: string;
  startAt?: string;
  endAt?: string;
  type?: string;
  notes?: string;
  /** UI-only flag used by the scheduling form; never persisted directly. */
  createCalendarEvent?: boolean;
  /** UI-only flag used by the scheduling form; never persisted directly. */
  generateMeetLink?: boolean;
}

export enum HireRecommendation {
  Yes = 'Yes',
  Maybe = 'Maybe',
  No = 'No',
}

export interface InterviewFeedback {
  id: string;
  interviewId: string;
  reviewerUserId: string;
  score: number; // e.g., 1-5 (Overall)
  competencyScores?: Record<string, number>; // New Structured Scoring
  strengths: string;
  concerns: string;
  hireRecommendation: HireRecommendation;
  submittedAt: Date;
}

export type InterviewTemplateFieldType = 'text' | 'textarea' | 'date' | 'rating' | 'choice' | 'yes_no' | 'acknowledgement';
export type InterviewTemplateStatus = 'Draft' | 'Active' | 'Inactive';
export type InterviewRatingStatus = 'Not Started' | 'Draft' | 'Submitted' | 'Returned for Revision' | 'Locked';

export interface InterviewTemplateOption {
  label: string;
  value: string | number;
}

export interface InterviewTemplateField {
  id: string;
  label: string;
  type: InterviewTemplateFieldType;
  required: boolean;
  autoLinked?: boolean;
  system?: boolean;
  description?: string;
  options?: InterviewTemplateOption[];
}

export interface InterviewTemplateSection {
  id: string;
  title: string;
  description?: string;
  order: number;
  fields: InterviewTemplateField[];
}

export interface InterviewRatingScaleOption {
  label: string;
  value: number;
}

export interface InterviewRatingTemplate {
  id: string;
  templateGroupId: string;
  version: number;
  name: string;
  description: string;
  status: InterviewTemplateStatus;
  assignmentBusinessUnitIds: string[];
  assignmentPositions: string[];
  assignmentStages: string[];
  sections: InterviewTemplateSection[];
  ratingScale: InterviewRatingScaleOption[];
  createdByUserId: string;
  createdAt: Date;
  updatedAt: Date;
  isCurrent: boolean;
  supersedesTemplateId?: string;
}

export interface InterviewRatingRecord {
  id: string;
  candidateId: string;
  applicationId: string;
  templateVersionId: string;
  templateGroupId: string;
  templateVersion: number;
  templateSnapshot: InterviewRatingTemplate;
  reviewerUserId: string;
  reviewerNameSnapshot: string;
  reviewerPositionSnapshot: string;
  dueDate?: Date;
  interviewRound: string;
  status: InterviewRatingStatus;
  formData: Record<string, unknown>;
  createdByUserId: string;
  returnedNotes?: string;
  submittedAt?: Date;
  lockedAt?: Date;
  reopenedAt?: Date;
  reopenedByUserId?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface InterviewRatingAttachment {
  id: string;
  ratingId: string;
  fileName: string;
  storagePath: string;
  mimeType: string;
  fileSize?: number;
  category: string;
  uploadedByUserId: string;
  createdAt: Date;
}

export enum OfferStatus {
  Draft = 'Draft',
  Sent = 'Sent',
  Viewed = 'Viewed',
  Accepted = 'Accepted',
  Signed = 'Signed',
  AcceptedAndSigned = 'Accepted and Signed',
  Declined = 'Declined',
  Expired = 'Expired',
  Converted = 'Converted',
}

export type OfferEmploymentType =
  | 'Regular'
  | 'Probationary'
  | 'Seasonal / Fixed-Term'
  | 'Consultant / Contractor'
  | 'Custom'
  // Historical values remain readable without rewriting existing offers.
  | 'Full-Time'
  | 'Part-Time'
  | 'Contract';

export interface Offer {
  id: string;
  applicationId: string;
  offerNumber: string;
  basePay: number;
  basePaySpecified?: boolean;
  allowanceJSON: string;
  startDate: Date;
  probationMonths: number;
  employmentType: OfferEmploymentType;
  employmentTypeCustomName?: string;
  employmentEndDate?: Date;
  supersedesOfferId?: string;
  status: OfferStatus;

  // Expanded fields
  reportingTo?: string; // Manager Name
  jobDescription?: string; // HTML
  paymentSchedule?: string;
  additionalPayInfo?: string; // HTML
  workScheduleDays?: string;
  workScheduleHours?: string;
  workLocation?: string;
  companyBenefits?: string; // HTML
  preEmploymentRequirements?: string; // HTML
  signatoryName?: string;
  signatoryPosition?: string;
  specialClauses?: string;

  // Value-first offer builder (additive; legacy scalar fields remain supported)
  offerDetails?: OfferBuilderDetails;
  draftStep?: number;
  offerExpirationDate?: Date;
  logoUrl?: string;
  logoPath?: string;
  lastSavedAt?: Date;
  sentAt?: Date;
  sentByUserId?: string;
  recipientEmail?: string;
  emailSubject?: string;
  emailMessage?: string;
  secureToken?: string;
  revision?: number;
  viewedAt?: Date;
  acceptedAt?: Date;
  signedAt?: Date;
  declinedAt?: Date;
  declineReason?: string;
  signatureName?: string;
  signatureType?: 'typed' | 'drawn';
  signaturePath?: string;
  signedPdfPath?: string;
  requireSignature?: boolean;
  offerTemplateId?: string;
  offerTemplateName?: string;
  offerTemplateSnapshot?: Record<string, unknown>;
  approvalStatus?: OfferApprovalStatus;
  approvalRequestId?: string;
}

export type OfferApprovalStatus = 'Not Requested' | 'Pending Approval' | 'Returned for Revision' | 'Approved' | 'Rejected' | 'Cancelled';
export type OfferPackageDocumentType = 'Resume' | 'Interview Rating' | 'Offer' | 'Other Supporting Document';
export type OfferPackageDocumentSource = 'resume' | 'rating' | 'rating_attachment' | 'offer' | 'candidate_document';

export interface OfferPackageDocument {
  id: string;
  candidateId: string;
  applicationId?: string;
  documentType: OfferPackageDocumentType;
  fileName: string;
  mimeType: string;
  source: OfferPackageDocumentSource;
  sourceId: string;
  ratingId?: string;
  offerId?: string;
  reviewerName?: string;
  reviewerPosition?: string;
  uploadedAt?: Date;
  status?: string;
  externalUrl?: string;
  storageBucket?: string;
  storagePath?: string;
  isSelectable?: boolean;
  description?: string;
}

export interface OfferApprovalTrailEntry {
  id: string;
  stage: string;
  approverName: string;
  approverRole: string;
  action: string;
  statusBefore?: string;
  statusAfter?: string;
  comments?: string;
  documentsReviewed?: string[];
  createdAt: Date;
}

export interface OfferApprovalRequestSummary {
  id: string;
  offerId: string;
  applicationId: string;
  candidateId: string;
  jobPostId?: string;
  requisitionId?: string;
  status: OfferApprovalStatus;
  approvalStage: string;
  revision: number;
  requesterUserId: string;
  submittedAt: Date;
  updatedAt: Date;
  completedAt?: Date;
  overrideIncompleteRatings: boolean;
  overrideReason?: string;
  packageSnapshot: Record<string, unknown>;
  attachmentSnapshot?: OfferPackageDocument[];
}

export type OfferTemplateStatus = 'Draft' | 'Active' | 'Archived';

export interface OfferSectionConfig {
  id: string;
  label: string;
  visible: boolean;
  order: number;
}

export interface OfferTemplate {
  id: string;
  name: string;
  businessUnitId?: string;
  businessUnit: string;
  description: string;
  category: string;
  status: OfferTemplateStatus;
  templateKey?: string;
  isStarter?: boolean;
  templateData: OfferBuilderDetails;
  logoUrl?: string;
  logoPath?: string;
  headerImageUrl?: string;
  headerImagePath?: string;
  createdByUserId?: string;
  createdAt: Date;
  updatedAt: Date;
  archivedAt?: Date;
  persisted?: boolean;
}

export interface OfferListItem {
  id: string;
  label: string;
  notes?: string;
}

export interface OfferMilestone {
  description: string;
  successCriteria?: string;
}

export interface OfferAllowance {
  id: string;
  name: string;
  amount: number;
  guaranteed: boolean;
}

export interface OfferBenefit {
  id: string;
  name: string;
  description: string;
  included: boolean;
  value?: string;
  eligibility?: string;
  notes?: string;
}

export interface OfferGrowthItem {
  id: string;
  name: string;
  description: string;
  included: boolean;
}

export interface OfferBuilderDetails {
  jobTitle?: string;
  department?: string;
  businessUnit?: string;
  reportingManager?: string;
  jobCode?: string;
  workLocation?: string;
  workSetup?: string;
  personalNote?: string;
  rolePurpose?: string;
  responsibilities?: OfferListItem[];
  successOutcomes?: OfferListItem[];
  milestones?: Record<'30' | '60' | '90', OfferMilestone>;
  currency?: string;
  payFrequency?: string;
  grossMonthlySalary?: number;
  compensationEntered?: boolean;
  grossAnnualizedSalary?: number;
  payrollSchedule?: string;
  probationarySalary?: number;
  regularizationSalary?: number;
  overtimeEligibility?: string;
  commissionOrIncentive?: string;
  bonusEligibility?: string;
  allowances?: OfferAllowance[];
  benefits?: OfferBenefit[];
  growthItems?: OfferGrowthItem[];
  workScheduleDays?: string;
  workScheduleHours?: string;
  additionalTerms?: string;
  customEndDateApplies?: boolean;
  welcomeMessage?: string;
  termsReviewed?: boolean;
  requireSignature?: boolean;
  appearance?: OfferAppearance;
  sectionConfig?: OfferSectionConfig[];
  welcomeEmail?: {
    subject?: string;
    message?: string;
    status?: 'draft' | 'sending' | 'sent' | 'failed' | string;
    recipient?: string;
    senderName?: string;
    senderEmail?: string;
    sentAt?: string;
    attemptedAt?: string;
    error?: string;
    provider?: string;
  };
}

export interface OfferAppearance {
  customized?: boolean;
  preset?: string;
  headerContent?: string;
  offerTitle?: string;
  footerContent?: string;
  primaryColor?: string;
  accentColor?: string;
  textColor?: string;
  pageBackgroundColor?: string;
  backgroundImageUrl?: string;
  backgroundImagePath?: string;
  headerImageUrl?: string;
  headerImagePath?: string;
  fontFamily?: 'Inter' | 'Georgia' | 'Arial' | 'Poppins';
  buttonStyle?: 'Rounded' | 'Pill' | 'Square';
  cardStyle?: 'Soft' | 'Outlined' | 'Flat';
  sectionLayout?: 'Cards' | 'Classic' | 'Compact';
  headerLayout?: 'Split' | 'Centered' | 'Minimal';
}

// Visual Job Post Template Types
export type TemplateMode = 'Solo' | 'Mass';

export interface JobPostIconDetail {
  icon: string; // Base64 or URL
  label: string;
}

export interface JobPostVisualTemplate {
  id: string;
  name: string; // Template Name
  updatedAt: Date;
  createdBy: string;

  // Visuals
  backgroundColor: string;
  cardColor: string;
  textColor: string;
  accentColor: string;
  backgroundImage: string; // Base64
  logoImage: string; // Base64

  // Content
  headline: string;
  jobTitle: string;
  description: string;

  details: JobPostIconDetail[]; // Array of 4

  col1Title: string;
  col1Content: string;
  col2Title: string;
  col2Content: string;

  contactTitle: string;
  email1: string;
  email2: string;
  subjectLine: string;
  buttonText: string;

  // Optional for compatibility
  mode?: TemplateMode;
}

export interface OpenRolesBenefit {
  id: string;
  title: string;
  description: string;
  icon: 'rocket' | 'smile' | 'wallet' | 'heart' | 'star';
}

export interface OpenRolesConfig {
  enabled: boolean;
  published: boolean;
  pageName: string;
  pageSlug: string;
  navigationLabel: string;
  displayOrder: number;
  heroHeadline: string;
  heroDescription: string;
  heroImage?: string;
  benefits: OpenRolesBenefit[];
}

export interface WorkplaceGalleryPhoto {
  id: string;
  url: string;
  caption?: string;
  isFeatured?: boolean;
  isActive?: boolean;
  storagePath?: string;
}

// --- NEW: Application Page / Career Site Builder Types ---
export interface ApplicantPageTheme {
  id: string;
  businessUnitId: string;
  name: string;
  slug: string; // e.g., 'inflatable-island'
  isActive: boolean;

  // Visuals
  pageTitle: string;
  heroHeadline: string;
  heroDescription: string;
  heroOverlayColor: string; // e.g., 'rgba(0,0,0,0.3)'
  heroImage?: string; // Base64 or URL
  logoImage?: string;
  primaryColor: string; // Button backgrounds, accents
  backgroundColor: string; // Page background

  // Content Sections
  sections?: any;
  benefits: {
    id: string;
    title: string;
    description: string;
    icon: 'rocket' | 'smile' | 'wallet' | 'heart' | 'star';
  }[];

  testimonials: {
    id: string;
    quote: string;
    author: string;
    role: string;
  }[];

  workplaceGallery?: WorkplaceGalleryPhoto[];

  // Contact Info for Footer
  contactEmail: string;
  ctaText?: string;
  ctaLink?: string;
  openRoles?: OpenRolesConfig;
}

// =================================================================================
// ONBOARDING & LIFECYCLE TYPES
// =================================================================================
export enum OnboardingTaskType {
  Read = 'Read & Acknowledge',
  Video = 'Watch Video',
  SubmitLink = 'Submit Link',
  Upload = 'Upload Document',
  AssignAsset = 'Assign Asset',
  ReturnAsset = 'Return Asset',
}

export interface OnboardingTaskTemplate {
  id: string;
  name: string;
  description: string;
  ownerRole: Role;
  ownerUserId?: string; // If specific person, overrides role
  dueDays: number; // Days from start date
  dueDateType: 'hire' | 'resignation';
  videoUrl?: string;
  readContent?: string;
  assetId?: string;
  assetDescription?: string;
  taskType: OnboardingTaskType;
  points: number;
  requiresApproval?: boolean;
}

export interface OnboardingChecklistTemplate {
  id: string;
  name: string;
  targetRole: Role;
  tasks: OnboardingTaskTemplate[];
  templateType: 'Onboarding' | 'Offboarding';
}

export enum OnboardingTaskStatus {
  Pending = 'Pending',
  Completed = 'Completed',
  Overdue = 'Overdue',
  PendingApproval = 'Pending Approval',
  Rejected = 'Rejected',
}

export interface OnboardingTask {
  id: string;
  templateTaskId: string;
  employeeId: string;
  name: string;
  description: string;
  ownerUserId: string;
  ownerName: string;
  dueDate: Date;
  status: OnboardingTaskStatus;
  points: number;
  taskType: OnboardingTaskType;
  videoUrl?: string;
  readContent?: string;
  assetId?: string;
  assetDescription?: string;
  submissionValue?: string;
  isAcknowledged?: boolean;
  completedAt?: Date;
  submittedAt?: Date;
  requiresApproval?: boolean;
  approvedBy?: string;
  approvedAt?: Date;
  rejectionReason?: string;
}

export interface OnboardingChecklist {
  id: string;
  employeeId: string;
  templateId: string;
  createdAt: Date;
  status: 'InProgress' | 'Pending' | 'Pending Approval' | 'Approved' | 'Rejected' | 'Completed';
  tasks: OnboardingTask[];
  signatureName?: string;
  signatureDataUrl?: string;
  signedAt?: Date;
}

export interface Milestone {
  title: string;
  tasks: OnboardingTask[];
  isLocked: boolean;
}

// =================================================================================
// OFFBOARDING TYPES
// =================================================================================
export enum ResignationStatus {
  PendingHRReview = 'Pending HR Review',
  ForClearance = 'For Clearance',
  Processing = 'Processing',
  Completed = 'Completed',
  ReturnedForEdits = 'Returned for Edits',
}

export interface Resignation {
  id: string;
  employeeId: string;
  employeeName: string;
  submissionDate: Date;
  lastWorkingDay: Date;
  reason: string;
  status: ResignationStatus;
  attachmentUrl?: string;
  offboardingChecklistId?: string;
  rejectionReason?: string;
}

// =================================================================================
// CONTRACTS & SIGNING TYPES
// =================================================================================
export interface SignatoryBlock {
  name?: string;
  position?: string;
  company?: string;
}

export interface ContractTemplateSection {
  id: string;
  title: string;
  body: string;
}

export interface ContractDocumentSettings {
  pageSize: 'A4' | 'Letter';
  marginTopMm: number;
  marginRightMm: number;
  marginBottomMm: number;
  marginLeftMm: number;
  fontFamily: string;
  fontSizePt: number;
  lineHeight: number;
  showPageNumbers: boolean;
  showFooter: boolean;
}

export interface ContractTemplate {
  id: string;
  title: string;
  description: string;
  owningBusinessUnitId: string;
  isDefault: boolean;
  logoUrl?: string;
  logoPosition?: 'left' | 'center' | 'right';
  logoMaxWidth?: number;
  documentSettings?: ContractDocumentSettings;
  body: string; // HTML content with placeholders
  sections: ContractTemplateSection[];
  footer: string;
  companySignatory?: SignatoryBlock;
  employeeSignatory?: SignatoryBlock;
  witnesses?: { id: string, name: string }[];
  acknowledgmentBody?: string;
  acknowledgmentParties?: { id: string, name: string, idProof: string, idIssue: string }[];
  versions?: {
    id: string;
    version: number;
    createdAt: Date;
    createdByUserId: string;
    notes: string;
    fileName: string;
  }[];
  activeVersion?: number;
}

export enum EnvelopeStatus {
  Draft = 'Draft',
  PendingApproval = 'Pending Approval',
  OutForSignature = 'Out for Signature',
  Completed = 'Completed',
  Declined = 'Declined',
  Voided = 'Voided',
}

export enum RoutingStepStatus {
  Pending = 'Pending',
  Viewed = 'Viewed',
  Completed = 'Completed',
  Declined = 'Declined',
}

export interface RoutingStep {
  id: string;
  userId: string;
  name: string;
  role: 'Signer' | 'Approver' | 'CC';
  status: RoutingStepStatus;
  order: number;
  is_required: boolean;
  timestamp?: Date;
  action?: 'Signed' | 'Approved' | 'Declined' | 'Viewed';
  rejectionReason?: string;
  signatureDataUrl?: string;
}

export enum EnvelopeEventType {
  Created = 'Created',
  Sent = 'Sent',
  Viewed = 'Viewed',
  Signed = 'Signed',
  Approved = 'Approved',
  Declined = 'Declined',
  Completed = 'Completed',
  Voided = 'Voided',
  CommentAdded = 'Comment Added',
}

export interface EnvelopeEvent {
  timestamp: Date;
  type: EnvelopeEventType;
  userName: string;
  details?: string;
}

export interface CorrespondenceAttachment {
  path: string;
  name: string;
  size: number;
  type: string;
  uploadedAt: Date;
  uploadedBy: string;
}

export interface Envelope {
  id: string;
  templateId: string;
  templateTitle: string;
  employeeId: string;
  employeeName: string;
  title: string;
  routingSteps: RoutingStep[];
  dueDate: Date;
  status: EnvelopeStatus;
  createdByUserId: string;
  createdAt: Date;
  events: EnvelopeEvent[];
  contentSnapshot?: Partial<ContractTemplate>; // A snapshot of the template at time of creation
  attachments?: CorrespondenceAttachment[];
}

export enum NotificationType {
  BIRTHDAY = 'BIRTHDAY',
  AWARD_RECEIVED = 'AWARD_RECEIVED',
  AWARD_APPROVAL_REQUEST = 'AWARD_APPROVAL_REQUEST',
  ResignationSubmitted = 'ResignationSubmitted',
  ResignationReturned = 'ResignationReturned',
  TICKET_ASSIGNED_TO_YOU = 'TICKET_ASSIGNED_TO_YOU',
  TICKET_UPDATE_REQUESTER = 'TICKET_UPDATE_REQUESTER',
  InterviewInvite = 'InterviewInvite',
  INTERVIEW_RATING_ASSIGNED = 'INTERVIEW_RATING_ASSIGNED',
  INTERVIEW_RATING_SUBMITTED = 'INTERVIEW_RATING_SUBMITTED',
  INTERVIEW_RATING_RETURNED = 'INTERVIEW_RATING_RETURNED',
  OFFBOARDING_STARTED = 'OFFBOARDING_STARTED',
  NTE_ISSUED = 'NTE_ISSUED',
  NTE_RESPONSE_SUBMITTED = 'NTE_RESPONSE_SUBMITTED',
  RESOLUTION_ISSUED = 'RESOLUTION_ISSUED',
  SCHEDULE_PUBLISHED = 'SCHEDULE_PUBLISHED',
  AssetRequestUpdate = 'AssetRequestUpdate',
  ASSET_ASSIGNED = 'ASSET_ASSIGNED',
  LEAVE_REQUEST = 'LEAVE_REQUEST',
  LEAVE_DECISION = 'LEAVE_DECISION',
  LEAVE_APPROVED = 'LEAVE_APPROVED',
  LEAVE_PENDING_BOD = 'LEAVE_PENDING_BOD',
  MANPOWER_REQUEST_SUBMITTED = 'MANPOWER_REQUEST_SUBMITTED',
  MANPOWER_REQUEST_APPROVED = 'MANPOWER_REQUEST_APPROVED',
  MANPOWER_REQUEST_REJECTED = 'MANPOWER_REQUEST_REJECTED',
  COE_UPDATE = 'COE_UPDATE',
  COACHING_INVITE = 'COACHING_INVITE',
  PAN_UPDATE = 'PAN_UPDATE',
  CASE_ASSIGNED = 'CASE_ASSIGNED',
  BENEFIT_REQUEST_SUBMITTED = 'BENEFIT_REQUEST_SUBMITTED',
  PAN_APPROVAL_REQUEST = 'PAN_APPROVAL_REQUEST',
  ONBOARDING_ASSIGNED = 'ONBOARDING_ASSIGNED',
  OFFBOARDING_ASSIGNED = 'OFFBOARDING_ASSIGNED',
  EVALUATION_ASSIGNED = 'EVALUATION_ASSIGNED',
  PULSE_SURVEY_REMINDER = 'PULSE_SURVEY_REMINDER',
  CONTRACT_SIGNATURE_REQUEST = 'CONTRACT_SIGNATURE_REQUEST',
  CONTRACT_APPROVAL_REQUEST = 'CONTRACT_APPROVAL_REQUEST',
  PROFILE_CHANGE_APPROVED = 'PROFILE_CHANGE_APPROVED',
  OT_APPROVED = 'OT_APPROVED',
  OT_REJECTED = 'OT_REJECTED',
  WFH_APPROVED = 'WFH_APPROVED',
  WFH_REJECTED = 'WFH_REJECTED',
  TICKET_RESOLVED = 'TICKET_RESOLVED',
  ASSET_UPDATE = 'ASSET_UPDATE',
  AWARD_ISSUED = 'AWARD_ISSUED',
  PROFILE_CHANGE_REJECTED = 'PROFILE_CHANGE_REJECTED',
  DOCUMENT_APPROVED = 'DOCUMENT_APPROVED',
  DOCUMENT_REJECTED = 'DOCUMENT_REJECTED',
  GENERAL = 'GENERAL',
  OT_SUBMITTED = 'OT_SUBMITTED',
  WFH_SUBMITTED = 'WFH_SUBMITTED',
  WFH_PENDING_GM = 'WFH_PENDING_GM',
  OT_PENDING_GM = 'OT_PENDING_GM',
  OT_PENDING_BOD = 'OT_PENDING_BOD',
  LEAVE_PENDING_GM = 'LEAVE_PENDING_GM',
  TICKET_NEW = 'TICKET_NEW',
  ASSET_REQUEST_SUBMITTED = 'ASSET_REQUEST_SUBMITTED',
  JOB_REQUISITION_SUBMITTED = 'JOB_REQUISITION_SUBMITTED',
  JOB_REQUISITION_APPROVED = 'JOB_REQUISITION_APPROVED',
  JOB_REQUISITION_REJECTED = 'JOB_REQUISITION_REJECTED',
  INCIDENT_FOLLOW_UP = 'INCIDENT_FOLLOW_UP',
  TICKET_FOLLOW_UP = 'TICKET_FOLLOW_UP',
  ANNOUNCEMENT_PUBLISHED = 'ANNOUNCEMENT_PUBLISHED',
  ANNOUNCEMENT_REMINDER = 'ANNOUNCEMENT_REMINDER',
}

export interface Notification {
  id: string;
  userId: string;
  type: NotificationType;
  title?: string;
  message: string;
  link: string;
  isRead: boolean;
  createdAt: Date;
  relatedEntityId?: string;
  dedupeKey?: string;
}

export interface AwardSignatory {
  name: string;
  title: string;
  signatureUrl?: string;
}

export interface AwardDesign {
  backgroundColor: string;
  backgroundImageUrl?: string;
  borderWidth: number;
  borderColor: string;
  fontFamily: string;
  titleColor: string;
  textColor: string;
  headerText: string; // e.g. "CERTIFICATE OF APPRECIATION"
  bodyText: string; // e.g. "This is awarded to {{employee_name}}..."
  signatories: AwardSignatory[];
  logoUrl?: string;
  accentColor?: string;
  secondaryAccentColor?: string;
  orientation?: 'portrait' | 'landscape';
  badgeStyle?: 'outline' | 'filled' | 'minimal';
  badgeKey?: string;
  layoutVersion?: 'legacy' | 'modern-v2';
  brandName?: string;
  wordmarkText?: string;
}

export interface Award {
  id: string;
  title: string;
  description: string;
  badgeIconUrl: string;
  isActive: boolean;
  design?: AwardDesign;
  businessUnitId?: string;
  category?: string;
  awardValueLabel?: string;
  isDefault?: boolean;
  isPreset?: boolean;
  presetKey?: string;
  badgeKey?: string;
  status?: 'draft' | 'published' | 'archived';
  sortOrder?: number;
  isSystem?: boolean;
  updatedAt?: Date;
}

export enum BadgeLevel {
  Bronze = 'Bronze',
  Silver = 'Silver',
  Gold = 'Gold',
}

export interface EmployeeAward {
  id: string;
  employeeId: string;
  awardId: string;
  dateAwarded: Date;
  notes: string;
  createdByUserId: string;
  level: BadgeLevel;
  businessUnitId?: string;
  departmentId?: string;
  status: ResolutionStatus;
  approverSteps: ApproverStep[];
  rejectionReason?: string;
  isAcknowledgedByEmployee?: boolean;
  certificateSnapshotUrl?: string; // NEW: Stores the Base64 image of the certificate
  approverId?: string;
  approverName?: string;
  submittedAt?: Date;
  decidedAt?: Date;
  issuedAt?: Date;
}

export type UserDocumentType =
  | 'Resume'
  | 'PSA Birth Certificate'
  | 'Birth Certificate'
  | 'Diploma or Transcript of Records'
  | 'NBI Clearance'
  | 'Medical Certificate'
  | 'Government ID (e.g., UMID, Driver\'s License)'
  | 'SSS Document'
  | 'PhilHealth Document'
  | 'Pag-IBIG Document'
  | 'TIN Document'
  | 'Proof of Bank Account'
  | 'Bank Details'
  | 'BIR Form 2316 (from previous employer)'
  | 'Signed Contract'
  | 'Pre-Employment Requirement'
  | 'Others';

export const USER_DOCUMENT_TYPES: UserDocumentType[] = [
  'Resume',
  'PSA Birth Certificate',
  'Birth Certificate',
  'Diploma or Transcript of Records',
  'NBI Clearance',
  'Medical Certificate',
  'Government ID (e.g., UMID, Driver\'s License)',
  'SSS Document',
  'PhilHealth Document',
  'Pag-IBIG Document',
  'TIN Document',
  'Proof of Bank Account',
  'Bank Details',
  'BIR Form 2316 (from previous employer)',
  'Signed Contract',
  'Pre-Employment Requirement',
  'Others'
];


export enum UserDocumentStatus {
  Pending = 'Pending',
  Approved = 'Approved',
  Rejected = 'Rejected',
  Verified = 'Verified',
}

export interface UserDocument {
  id: string;
  employeeId: string;
  documentType: UserDocumentType;
  customDocumentType?: string;
  fileName: string;
  fileUrl: string;
  submittedAt: Date;
  status: UserDocumentStatus;
  reviewedBy?: string;
  reviewedAt?: Date;
  rejectionReason?: string;
  title?: string;
  notes?: string;
  documentSource?: 'Employee' | 'HR';
  uploadedBy?: string;
  uploadedByName?: string;
  storageBucket?: string;
  storagePath?: string;
  versionNumber?: number;
  replacesDocumentId?: string;
  archivedAt?: Date;
}

// =================================================================================
// APPROVER CONFIGURATION TYPES
// =================================================================================

export interface GMApproverConfig {
  user_id: string | null;
  user_name: string | null;
}

export interface BODApproverConfig {
  user_ids: string[];
  user_names: string[];
}

export interface COEApprovalConfig {
  authority: COEApprovalAuthority;
}

export interface ConditionalTimeApprovalConfig {
  user_ids: string[];
  user_names: string[];
  required_user_ids: string[];
  required_bod_approvals: number;
  leave_days_per_remaining_month: number;
  wfh_days_per_month: number;
  weekly_total_hours: number;
  valid?: boolean;
  invalid_reason?: string | null;
}

export interface ApproverConfigs {
  gmApprover: GMApproverConfig;
  bodApprovers: BODApproverConfig;
  coeApproval: COEApprovalConfig;
  conditionalTimeApprovals: ConditionalTimeApprovalConfig;
}

/** Roles that trigger hierarchical (GM → BOD) approval flow */
export const MANAGER_ROLES: Role[] = [
  Role.Manager,
  Role.BusinessUnitManager,
  Role.HRManager,
  Role.OperationsDirector,
];
