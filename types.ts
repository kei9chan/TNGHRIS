
// This file contains all the type definitions for the application.

// =================================================================================
// GENERAL & CORE TYPES
// =================================================================================

export enum Permission {
  View = 'view',
  Create = 'create',
  Edit = 'edit',
  Approve = 'approve',
  Manage = 'manage', // Includes all other permissions
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
  Recruiter = 'Recruiter',
}

export type Resource =
  | 'Dashboard' | 'Employees' | 'PAN' | 'Files' | 'Feedback' | 'Evaluation' | 'Timekeeping' | 'Clock' | 'OT'
  | 'Leave' | 'LeavePolicies' | 'Exceptions' | 'PayrollPrep' | 'PayrollStaging' | 'Payslips' | 'GovernmentReports'
  | 'ReportTemplates' | 'Reports' | 'FinalPay' | 'ClockLog' | 'Settings' | 'AuditLog' | 'Helpdesk'
  | 'Announcements' | 'Recruitment' | 'Requisitions' | 'JobPosts' | 'Applicants' | 'Candidates'
  | 'Interviews' | 'Offers' | 'Offboarding' | 'Analytics' | 'Departments' | 'Loans' | 'User' | 'Sites' | 'Assets' | 'AssetRequests' | 'WorkforcePlanning' | 'Lifecycle' | 'Payroll' | 'Manpower' | 'COE' | 'Benefits' | 'PulseSurvey' | 'Coaching' | 'WFH';

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
  Pending = 'Pending',
  Approved = 'Approved',
  Rejected = 'Rejected',
}

export interface WFHRequest {
  id: string;
  employeeId: string;
  employeeName: string;
  date: Date;
  reason: string;
  status: WFHRequestStatus;
  reportLink?: string; // Optional URL for output/accomplishment report
  approvedBy?: string; // The BOD ID who won the "race"
  approvedAt?: Date;
  rejectionReason?: string;
  createdAt: Date;
}

// =================================================================================
// COACHING & MENTORING TYPES
// =================================================================================

export enum CoachingStatus {
  Draft = 'Draft',
  Scheduled = 'Scheduled',
  Completed = 'Completed',
  Acknowledged = 'Acknowledged'
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
  Travel = 'TRAVEL',
  VisaApplication = 'VISA_APPLICATION',
  SchoolApplication = 'SCHOOL_APPLICATION',
  LegalPurposes = 'LEGAL_PURPOSES',
  Others = 'OTHERS',
}

export enum COERequestStatus {
  Pending = 'Pending',
  Approved = 'Approved',
  Rejected = 'Rejected',
}

export interface COETemplate {
  id: string;
  businessUnitId: string;
  logoUrl?: string;
  address: string;
  body: string; // HTML content with placeholders like {{employee_name}}, {{date_hired}}, etc.
  signatoryName: string;
  signatoryPosition: string;
  isActive: boolean;
}

export interface COERequest {
  id: string;
  employeeId: string;
  employeeName: string; // Helper for UI
  businessUnitId: string; // Snapshot for filtering
  purpose: COEPurpose;
  otherPurposeDetail?: string;
  dateRequested: Date;
  status: COERequestStatus;
  rejectionReason?: string;
  generatedDocumentUrl?: string; // Placeholder for generated PDF
  approvedBy?: string;
  approvedAt?: Date;
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

export interface ManpowerRequestItem {
  id: string;
  role: string; // e.g. CRA, BEACH GUIDE
  currentFte: number; // Reporting FTE
  requestedCount: number; // Requested Oncall
  costPerHead: number; // Daily rate
  totalItemCost: number; // count * rate
  shiftTime: string; // e.g. 8am-5pm
  justification: string; // e.g. To remove the trapal...
}

export interface ManpowerRequest {
  id: string;
  businessUnitId: string;
  businessUnitName: string;
  requestedBy: string;
  requesterName: string;
  date: Date; // The date the on-calls are needed for
  forecastedPax: number;
  generalNote?: string; // The "Header Reason"
  items: ManpowerRequestItem[];
  grandTotal: number; // Sum of all items
  status: ManpowerRequestStatus;
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
}

export enum TaxStatus {
    Single = 'Single',
    Married = 'Married',
    HeadOfFamily = 'Head of Family',
}

export interface AccessScope {
    type: 'GLOBAL' | 'SPECIFIC' | 'HOME_ONLY';
    allowedBuIds?: string[]; // Only required if type is 'SPECIFIC'
}

export type EmploymentStatus = 'Regular' | 'Probationary' | 'Contractual';

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  department: string;
  businessUnit: string;
  status: 'Active' | 'Inactive';
  employmentStatus?: EmploymentStatus; // New Field
  isPhotoEnrolled: boolean;
  dateHired: Date;
  birthDate?: Date;
  endDate?: Date;
  position: string;
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

export type AuditAction = 'CREATE' | 'READ' | 'UPDATE' | 'DELETE' | 'LOGIN' | 'LOGOUT' | 'APPROVE' | 'REJECT' | 'GENERATE' | 'EXPORT';

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
}

export enum IRStatus {
  Submitted = 'Submitted',
  HRReview = 'HR Review',
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
  resolutionId?: string;
  chatThread: ChatMessage[];
  attachmentUrl?: string;
  signatureDataUrl?: string;
  assignedToId?: string;
  assignedToName?: string;
  businessUnitId?: string;
  businessUnitName?: string;
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
}

export enum ResolutionStatus {
    Draft = 'Draft',
    PendingApproval = 'Pending Approval',
    Approved = 'Approved',
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
    Rejected = 'Rejected',
}

export interface ApproverStep {
    userId: string;
    userName: string;
    status: ApproverStatus;
    timestamp?: Date;
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
  status: 'Published' | 'Draft' | 'Archived';
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
  lastModifiedAt: Date;
  lastModifiedByUserId: string;
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
  status: OTStatus;
  submittedAt?: Date;
  approvedHours?: number;
  managerNote?: string;
  historyLog: OTRequestHistory[];
  attachmentUrl?: string;
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
  Approved = 'Approved',
  Rejected = 'Rejected',
  Cancelled = 'Cancelled',
}

export interface LeaveRequest {
  id: string;
  employeeId: string;
  employeeName: string;
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
  employmentStatus?: string;
  position?: string;
  department?: string;
  salary?: SalaryBreakdown;
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
    Acknowledger = 'Acknowledger',
}

export enum PANStepStatus {
    Pending = 'Pending',
    Approved = 'Approved',
    Declined = 'Declined',
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
  type: 'Quarterly' | 'Annual' | 'Onboarding' | 'Custom';
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
    Final = 'Final',
}

export enum JobRequisitionStepStatus {
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

export interface Interview {
  id: string;
  applicationId: string;
  interviewType: InterviewType;
  scheduledStart: Date;
  scheduledEnd: Date;
  location: string; // URL for virtual, address for on-site
  panelUserIds: string[];
  calendarEventId?: string;
  status: InterviewStatus;
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

export enum OfferStatus {
  Draft = 'Draft',
  Sent = 'Sent',
  Signed = 'Signed',
  Declined = 'Declined',
  Expired = 'Expired',
  Converted = 'Converted to Employee',
}

export interface Offer {
  id: string;
  applicationId: string;
  offerNumber: string;
  basePay: number;
  allowanceJSON: string;
  startDate: Date;
  probationMonths: number;
  employmentType: 'Full-Time' | 'Part-Time' | 'Contract';
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

// --- NEW: Application Page / Career Site Builder Types ---
export interface ApplicantPageTheme {
    id: string;
    businessUnitId: string;
    slug: string; // e.g., 'inflatable-island'
    isActive: boolean;
    
    // Visuals
    pageTitle: string;
    heroHeadline: string;
    heroDescription: string;
    heroOverlayColor: string; // e.g., 'rgba(0,0,0,0.3)'
    heroImage?: string; // Base64 or URL
    primaryColor: string; // Button backgrounds, accents
    backgroundColor: string; // Page background
    
    // Content Sections
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

    // Contact Info for Footer
    contactEmail: string;
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
  status: 'InProgress' | 'Completed';
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

export interface ContractTemplate {
  id: string;
  title: string;
  description: string;
  owningBusinessUnitId: string;
  isDefault: boolean;
  logoUrl?: string;
  logoPosition?: 'left' | 'center' | 'right';
  logoMaxWidth?: number;
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
    OFFBOARDING_STARTED = 'OFFBOARDING_STARTED',
    NTE_ISSUED = 'NTE_ISSUED',
    RESOLUTION_ISSUED = 'RESOLUTION_ISSUED',
    SCHEDULE_PUBLISHED = 'SCHEDULE_PUBLISHED',
    AssetRequestUpdate = 'AssetRequestUpdate',
    ASSET_ASSIGNED = 'ASSET_ASSIGNED',
    LEAVE_REQUEST = 'LEAVE_REQUEST',
    LEAVE_DECISION = 'LEAVE_DECISION',
    MANPOWER_REQUEST_SUBMITTED = 'MANPOWER_REQUEST_SUBMITTED',
    MANPOWER_REQUEST_APPROVED = 'MANPOWER_REQUEST_APPROVED',
    MANPOWER_REQUEST_REJECTED = 'MANPOWER_REQUEST_REJECTED',
    COE_UPDATE = 'COE_UPDATE',
    COACHING_INVITE = 'COACHING_INVITE',
    PAN_UPDATE = 'PAN_UPDATE'
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
    relatedEntityId: string;
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
}

export interface Award {
    id: string;
    title: string;
    description: string;
    badgeIconUrl: string;
    isActive: boolean;
    design?: AwardDesign;
}

export enum BadgeLevel {
    Bronze = 'bronze',
    Silver = 'silver',
    Gold = 'gold',
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
    status: ResolutionStatus;
    approverSteps: ApproverStep[];
    rejectionReason?: string;
    isAcknowledgedByEmployee?: boolean;
    certificateSnapshotUrl?: string; // NEW: Stores the Base64 image of the certificate
}

export type UserDocumentType = 
    | 'PSA Birth Certificate'
    | 'Diploma or Transcript of Records'
    | 'NBI Clearance'
    | 'Government ID (e.g., UMID, Driver\'s License)'
    | 'Proof of Bank Account'
    | 'BIR Form 2316 (from previous employer)'
    | 'Others';

export const USER_DOCUMENT_TYPES: UserDocumentType[] = [
    'PSA Birth Certificate',
    'Diploma or Transcript of Records',
    'NBI Clearance',
    'Government ID (e.g., UMID, Driver\'s License)',
    'Proof of Bank Account',
    'BIR Form 2316 (from previous employer)',
    'Others'
];


export enum UserDocumentStatus {
    Pending = 'Pending',
    Approved = 'Approved',
    Rejected = 'Rejected',
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
}
