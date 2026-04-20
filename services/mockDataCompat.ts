/**
 * mockDataCompat.ts — DEPRECATED compatibility shim
 * 
 * This file re-exports empty arrays / default objects for all the mock
 * identifiers that pages still reference after stripping the original
 * mockData.ts imports.  The actual data is now fetched from Supabase 
 * via the corresponding service modules.
 *
 * As each page is migrated to use Supabase service calls directly,
 * its imports from this file should be removed.  Once no file imports
 * from here, delete this module.
 */

import type {
    Notification, User, BusinessUnit, Department,
    Announcement, JobRequisition, JobPost, Application, Candidate, Offer, Interview,
    IncidentReport, NTE, Resolution, Memo, PipelineStage, CoachingSession,
    Evaluation, EvaluationSubmission, EvaluationQuestion, EvaluationTimeline, QuestionSet,
    Award, EmployeeAward,
    PulseSurvey, SurveyResponse,
    Ticket, KnowledgeBaseCategory, KnowledgeBaseArticle,
    OTRequest, AttendanceRecord, AttendanceExceptionRecord, ShiftAssignment, ShiftTemplate, Site, TimeEvent,
    PayslipRecord, GovernmentReport, GovernmentReportTemplate, FinalPayRecord,
    LeaveRequest, LeaveType, LeaveBalance, LeavePolicy, LeaveLedgerEntry,
    Holiday, HolidayPolicy,
    OperatingHours, ServiceArea, DemandTypeConfig, StaffingRequirement,
    COERequest, COETemplate,
    PAN, PANTemplate,
    BenefitType, BenefitRequest,
    ManpowerRequest,
    Asset, AssetAssignment, AssetRequest, AssetRepair,
    UserDocument, ChangeHistory, EmployeeDraft,
    CalendarEvent, AuditLog, Settings,
    ContractTemplate,
    OnboardingChecklistTemplate, OnboardingChecklist,
    ShiftRotationTemplate, ShiftRotationAssignment,
    Envelope, CodeOfDiscipline, FeedbackTemplate,
    SSSTableRow, PhilHealthConfig, TaxTableRow,
    WFHRequest,
} from '../types';

// ---------------------------------------------------------------------------
// Empty-array / default-value shims
// ---------------------------------------------------------------------------

export const mockUsers: User[] = [];
export const mockBusinessUnits: BusinessUnit[] = [];
export const mockDepartments: Department[] = [];
export const mockNotifications: Notification[] = [];
export const mockAnnouncements: Announcement[] = [];
export const mockCalendarEvents: CalendarEvent[] = [];
export const mockAuditLogs: AuditLog[] = [];

// Recruitment
export const mockJobRequisitions: JobRequisition[] = [];
export const mockJobPosts: JobPost[] = [];
export const mockApplications: Application[] = [];
export const mockCandidates: Candidate[] = [];
export const mockOffers: Offer[] = [];
export const mockInterviews: Interview[] = [];

// Feedback & Discipline
export const mockIncidentReports: IncidentReport[] = [];
export const mockNTEs: NTE[] = [];
export const mockResolutions: Resolution[] = [];
export const mockMemos: Memo[] = [];
export const mockPipelineStages: PipelineStage[] = [];
export const mockCoachingSessions: CoachingSession[] = [];
export const mockCodeOfDiscipline: CodeOfDiscipline = { version: '1.0', effectiveDate: new Date(), entries: [] };
export const mockFeedbackTemplates: FeedbackTemplate[] = [];

// Evaluation
export const mockEvaluations: Evaluation[] = [];
export const mockEvaluationSubmissions: EvaluationSubmission[] = [];
export const mockEvaluationQuestions: EvaluationQuestion[] = [];
export const mockEvaluationTimelines: EvaluationTimeline[] = [];
export const mockQuestionSets: QuestionSet[] = [];
export const mockAwards: Award[] = [];
export const mockEmployeeAwards: EmployeeAward[] = [];

// Pulse Surveys
export const mockPulseSurveys: PulseSurvey[] = [];
export const mockSurveyResponses: SurveyResponse[] = [];

// Helpdesk
export const mockTickets: Ticket[] = [];
export const mockKbCategories: KnowledgeBaseCategory[] = [];
export const mockKbArticles: KnowledgeBaseArticle[] = [];

// Payroll & Timekeeping
export const mockOtRequests: OTRequest[] = [];
export const mockAttendanceRecords: AttendanceRecord[] = [];
export const mockAttendanceExceptions: AttendanceExceptionRecord[] = [];
export const mockShiftAssignments: ShiftAssignment[] = [];
export const mockShiftTemplates: ShiftTemplate[] = [];
export const mockSites: Site[] = [];
export const mockTimeEvents: TimeEvent[] = [];
export const mockPayslips: PayslipRecord[] = [];
export const mockGovernmentReports: GovernmentReport[] = [];
export const mockGovernmentReportTemplates: GovernmentReportTemplate[] = [];
export const mockFinalPayRecords: FinalPayRecord[] = [];
export const mockOperatingHours: OperatingHours[] = [];
export const mockServiceAreas: ServiceArea[] = [];
export const mockDemandTypes: DemandTypeConfig[] = [];
export const mockStaffingRequirements: StaffingRequirement[] = [];
export const mockShiftRotationTemplates: ShiftRotationTemplate[] = [];
export const mockShiftRotationAssignments: ShiftRotationAssignment[] = [];

// Leave
export const mockLeaveRequests: LeaveRequest[] = [];
export const mockLeaveTypes: LeaveType[] = [];
export const mockLeaveBalances: LeaveBalance[] = [];
export const mockLeavePolicies: LeavePolicy[] = [];
export const mockLeaveLedger: LeaveLedgerEntry[] = [];
export const mockHolidays: Holiday[] = [];
export const mockHolidayPolicies: HolidayPolicy[] = [];

// COE
export const mockCOERequests: COERequest[] = [];
export const mockCOETemplates: COETemplate[] = [];

// PAN
export const mockPANs: PAN[] = [];
export const mockPANTemplates: PANTemplate[] = [];

// Benefits
export const mockBenefitTypes: BenefitType[] = [];
export const mockBenefitRequests: BenefitRequest[] = [];

// Manpower
export const mockManpowerRequests: ManpowerRequest[] = [];

// Assets
export const mockAssets: Asset[] = [];
export const mockAssetAssignments: AssetAssignment[] = [];
export const mockAssetRequests: AssetRequest[] = [];
export const mockAssetRepairs: AssetRepair[] = [];

// Employee Documents
export const mockUserDocuments: UserDocument[] = [];
export const mockChangeHistory: ChangeHistory[] = [];
export const mockEmployeeDrafts: EmployeeDraft[] = [];

// Contracts & Envelopes
export const mockContractTemplates: ContractTemplate[] = [];
export const mockContractInstances: any[] = [];
export const mockEnvelopes: Envelope[] = [];

// Onboarding
export const mockOnboardingTemplates: OnboardingChecklistTemplate[] = [];
export const mockOnboardingChecklists: OnboardingChecklist[] = [];

// Resignations
export const mockResignations: any[] = [];

// WFH
export const mockWFHRequests: WFHRequest[] = [];

// Payroll Config
export const mockSSSTable: SSSTableRow[] = [];
export const mockPhilHealthConfig: PhilHealthConfig = { minSalary: 10000, maxSalary: 80000, rate: 0.04, employerShareRatio: 0.5 };
export const mockTaxTable: TaxTableRow[] = [];

// Settings
export const mockAppSettings: Settings = {
    appName: 'TNG HRIS',
    appLogoUrl: '',
    reminderCadence: 3,
    emailProvider: 'SendGrid',
    smsProvider: 'Twilio',
    pdfHeader: 'The Nines Group',
    pdfFooter: 'Confidential',
    currency: 'PHP',
};

// RBAC
export const mockPermissions: Record<string, Record<string, string[]>> = {};
