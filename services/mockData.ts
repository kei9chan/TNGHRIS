import {
    User,
    DeviceBind,
    ChangeHistory,
    EmployeeDraft,
    PAN,
    PANTemplate,
    OnboardingChecklistTemplate,
    OnboardingChecklist,
    Resignation,
    AssetAssignment,
    Asset,
    ContractTemplate,
    Envelope,
    NTE,
    Resolution,
    CodeOfDiscipline,
    BusinessUnit,
    Memo,
    FeedbackTemplate,
    JobRequisition,
    Notification,
    Evaluation,
    EvaluationSubmission,
    Ticket,
    UserDocument,
    IncidentReport,
    EmployeeAward,
    OTRequest,
    AttendanceExceptionRecord,
    LeaveRequest,
    Department,
    OperatingHours,
    StaffingRequirement,
    ServiceArea,
    DemandTypeConfig,
    LeaveType,
    TimeEvent,
    ShiftAssignment,
    ShiftTemplate,
    Site,
    AttendanceRecord,
    PayslipRecord,
    GovernmentReport,
    GovernmentReportTemplate,
    FinalPayRecord,
    Settings,
    AuditLog,
    PermissionsMatrix,
    PipelineStage,
    QuestionSet,
    EvaluationQuestion,
    EvaluationTimeline,
    JobPostVisualTemplate,
    JobPost,
    Candidate,
    Application,
    InterviewFeedback,
    Offer,
    Announcement,
    CalendarEvent,
    KnowledgeBaseCategory,
    KnowledgeBaseArticle,
    AssetRequest,
    AssetRepair,
    SSSTableRow,
    PhilHealthConfig,
    TaxTableRow,
    HolidayPolicy,
    Holiday,
    Interview,
    Award,
    ApplicantPageTheme,
    LeaveBalance,
    LeaveLedgerEntry,
    Role,
    Permission,
    SeverityLevel,
    AssetStatus,
    OnboardingTaskType,
    OnboardingTaskStatus,
    IRStatus,
    NTEStatus,
    ResolutionStatus,
    ResolutionType,
    TicketCategory,
    TicketPriority,
    TicketStatus,
    AnnouncementType,
    LeaveRequestStatus,
    JobRequisitionStatus,
    JobRequisitionRole,
    JobRequisitionStepStatus,
    JobPostStatus,
    CandidateSource,
    ApplicationStage,
    InterviewType,
    InterviewStatus,
    OfferStatus,
    BadgeLevel,
    LeaveLedgerEntryType,
    EmployeeLevel,
    RaterGroup,
    PANStatus,
    PANStepStatus,
    PANRole,
    EnvelopeStatus,
    RoutingStepStatus,
    EnvelopeEventType,
    DayTypeTier,
    TimeEventType,
    TimeEventSource,
    ManpowerRequest,
    OTStatus,
    LeavePolicy,
    COETemplate,
    COERequest,
    COEPurpose,
    COERequestStatus,
    EvaluatorType,
    BenefitType,
    BenefitRequest,
    PulseSurvey,
    PulseSurveyStatus,
    SurveyResponse,
    CoachingSession,
    CoachingStatus,
    CoachingTrigger,
    WFHRequest
} from '../types';

export const mockBusinessUnits: BusinessUnit[] = [
    { id: 'bu1', name: 'The Fun Roof', code: 'TFR' },
    { id: 'bu2', name: 'The Dessert Museum', code: 'TDM' },
    { id: 'bu3', name: 'Inflatable Island', code: 'II' },
    { id: 'bu4', name: 'Tiki Tents', code: 'TT' },
    { id: 'bu5', name: 'Corporate HQ', code: 'HQ' },
    { id: 'bu6', name: 'Bakebe SM Aura', code: 'BSA' }
];

// ... (Keep existing Departments, Users, etc. - they are unchanged)
export const mockDepartments: Department[] = [
    { id: 'dept1', name: 'Operations', businessUnitId: 'bu1' },
    { id: 'dept2', name: 'Human Resources', businessUnitId: 'bu5' },
    { id: 'dept3', name: 'IT', businessUnitId: 'bu5' },
    { id: 'dept4', name: 'Finance', businessUnitId: 'bu5' },
    { id: 'dept5', name: 'Marketing', businessUnitId: 'bu5' },
    { id: 'dept6', name: 'Executive', businessUnitId: 'bu5' },
    // Bakebe SM Aura Departments
    { id: 'dept_bsa_ops', name: 'Operations', businessUnitId: 'bu6' },
    { id: 'dept_bsa_mkt', name: 'Marketing', businessUnitId: 'bu6' },
    { id: 'dept_bsa_fin', name: 'Finance and Accounting', businessUnitId: 'bu6' },
    // Inflatable Island Departments
    { id: 'dept_ii_ops', name: 'Operations', businessUnitId: 'bu3' },
    { id: 'dept_ii_sales', name: 'Sales', businessUnitId: 'bu3' },
    { id: 'dept_ii_kitchen', name: 'Kitchen', businessUnitId: 'bu3' },
    { id: 'dept_ii_fin', name: 'Finance', businessUnitId: 'bu3' },
    { id: 'dept_ii_hr', name: 'HR', businessUnitId: 'bu3' },
    { id: 'dept_ii_marketing', name: 'Marketing', businessUnitId: 'bu3' },
    { id: 'dept_ii_lifeguard', name: 'Lifeguard', businessUnitId: 'bu3' },
    { id: 'dept_ii_dining', name: 'Dining', businessUnitId: 'bu3' },
    { id: 'dept_ii_inv', name: 'Inventory', businessUnitId: 'bu3' },
    { id: 'dept_ii_bar', name: 'Bar', businessUnitId: 'bu3' },
    { id: 'dept_ii_purchasing', name: 'Purchasing', businessUnitId: 'bu3' },
    { id: 'dept_ii_sales_res', name: 'Sales and Reservations', businessUnitId: 'bu3' },
];

export const mockUsers: User[] = [
    // --- GLOBAL ROLES (Corporate HQ) ---
    {
        id: 'admin_user',
        name: 'Admin User',
        email: 'admin@tng.com',
        role: Role.Admin,
        accessScope: { type: 'GLOBAL' },
        department: 'IT',
        businessUnit: 'Corporate HQ',
        status: 'Active',
        employmentStatus: 'Regular',
        isPhotoEnrolled: true,
        dateHired: new Date('2020-01-01'),
        position: 'System Administrator',
        managerId: '0',
        salary: { basic: 60000, deminimis: 2000, reimbursable: 1000 },
        leaveInfo: { balances: { vacation: 5, sick: 5 }, accrualRate: 0.4166, lastCreditDate: new Date('2024-01-01') }
    },
    {
        id: 'u_bod',
        name: 'Board Member',
        email: 'bod@tng.com',
        role: Role.BOD,
        accessScope: { type: 'GLOBAL' },
        department: 'Executive',
        businessUnit: 'Corporate HQ',
        status: 'Active',
        employmentStatus: 'Regular',
        isPhotoEnrolled: false,
        dateHired: new Date('2017-01-01'),
        position: 'Director',
        salary: { basic: 150000, deminimis: 0, reimbursable: 10000 },
        leaveInfo: { balances: { vacation: 5, sick: 5 }, accrualRate: 0.4166, lastCreditDate: new Date('2024-01-01') }
    },
    {
        id: 'u_gm',
        name: 'Gary General',
        email: 'gm@tng.com',
        role: Role.GeneralManager,
        accessScope: { type: 'GLOBAL' },
        department: 'Executive',
        businessUnit: 'Corporate HQ',
        status: 'Active',
        employmentStatus: 'Regular',
        isPhotoEnrolled: true,
        dateHired: new Date('2018-06-01'),
        position: 'General Manager',
        managerId: 'u_bod',
        salary: { basic: 120000, deminimis: 5000, reimbursable: 5000 },
        leaveInfo: { balances: { vacation: 5, sick: 5 }, accrualRate: 0.4166, lastCreditDate: new Date('2024-01-01') }
    },
    {
        id: 'u_hr',
        name: 'Helen HR',
        email: 'hr@tng.com',
        role: Role.HRManager,
        accessScope: { type: 'GLOBAL' },
        department: 'Human Resources',
        businessUnit: 'Corporate HQ',
        status: 'Active',
        employmentStatus: 'Regular',
        isPhotoEnrolled: true,
        dateHired: new Date('2019-05-10'),
        position: 'HR Head',
        managerId: 'u_gm',
        salary: { basic: 55000, deminimis: 2000, reimbursable: 1000 },
        leaveInfo: { balances: { vacation: 5, sick: 5 }, accrualRate: 0.4166, lastCreditDate: new Date('2024-01-01') }
    },
    {
        id: 'u_hrstaff',
        name: 'Harry HR Staff',
        email: 'hrstaff@tng.com',
        role: Role.HRStaff,
        accessScope: { type: 'GLOBAL' },
        department: 'Human Resources',
        businessUnit: 'Corporate HQ',
        status: 'Active',
        employmentStatus: 'Regular',
        isPhotoEnrolled: true,
        dateHired: new Date('2022-01-20'),
        position: 'HR Assistant',
        managerId: 'u_hr',
        salary: { basic: 25000, deminimis: 1000, reimbursable: 0 },
        leaveInfo: { balances: { vacation: 5, sick: 5 }, accrualRate: 0.4166, lastCreditDate: new Date('2024-01-01') }
    },
    {
        id: 'u_opsdir',
        name: 'Ophelia Ops',
        email: 'opsdir@tng.com',
        role: Role.OperationsDirector,
        accessScope: { type: 'GLOBAL' },
        department: 'Operations',
        businessUnit: 'Corporate HQ',
        status: 'Active',
        employmentStatus: 'Regular',
        isPhotoEnrolled: true,
        dateHired: new Date('2019-03-15'),
        position: 'Director of Operations',
        managerId: 'u_gm',
        salary: { basic: 90000, deminimis: 3000, reimbursable: 3000 },
        leaveInfo: { balances: { vacation: 5, sick: 5 }, accrualRate: 0.4166, lastCreditDate: new Date('2024-01-01') }
    },
    {
        id: 'u_finance',
        name: 'Fiona Finance',
        email: 'finance@tng.com',
        role: Role.FinanceStaff,
        accessScope: { type: 'GLOBAL' },
        department: 'Finance',
        businessUnit: 'Corporate HQ',
        status: 'Active',
        employmentStatus: 'Regular',
        isPhotoEnrolled: true,
        dateHired: new Date('2021-08-01'),
        position: 'Finance Director',
        managerId: 'u_gm',
        salary: { basic: 80000, deminimis: 1500, reimbursable: 5000 },
        leaveInfo: { balances: { vacation: 5, sick: 5 }, accrualRate: 0.4166, lastCreditDate: new Date('2024-01-01') }
    },
    {
        id: 'u_auditor',
        name: 'Alex Auditor',
        email: 'auditor@tng.com',
        role: Role.Auditor,
        accessScope: { type: 'GLOBAL' },
        department: 'Finance',
        businessUnit: 'Corporate HQ',
        status: 'Active',
        employmentStatus: 'Regular',
        isPhotoEnrolled: true,
        dateHired: new Date('2023-01-10'),
        position: 'Internal Auditor',
        managerId: 'u_bod',
        salary: { basic: 45000, deminimis: 2000, reimbursable: 1000 },
        leaveInfo: { balances: { vacation: 5, sick: 5 }, accrualRate: 0.4166, lastCreditDate: new Date('2024-01-01') }
    },
    {
        id: 'u_recruiter',
        name: 'Rita Recruiter',
        email: 'recruiter@tng.com',
        role: Role.Recruiter,
        accessScope: { type: 'GLOBAL' },
        department: 'Human Resources',
        businessUnit: 'Corporate HQ',
        status: 'Active',
        employmentStatus: 'Regular',
        isPhotoEnrolled: true,
        dateHired: new Date('2022-04-15'),
        position: 'Talent Acquisition Specialist',
        managerId: 'u_hr',
        salary: { basic: 28000, deminimis: 1000, reimbursable: 0 },
        leaveInfo: { balances: { vacation: 5, sick: 5 }, accrualRate: 0.4166, lastCreditDate: new Date('2024-01-01') }
    },
    // --- BAKEBE SM AURA TEAM ---
    {
        id: 'TNG-457',
        name: 'Laner Orque',
        email: 'laner@tng.com',
        role: Role.BusinessUnitManager,
        accessScope: { type: 'HOME_ONLY' }, // Restricted to Bakebe
        department: 'Operations',
        businessUnit: 'Bakebe SM Aura',
        status: 'Active',
        employmentStatus: 'Regular',
        isPhotoEnrolled: true,
        dateHired: new Date('2023-01-15'),
        position: 'Head Pastry Chef',
        managerId: 'u_opsdir',
        salary: { basic: 45000, deminimis: 2000, reimbursable: 1000 },
        monthlySalary: 48000,
        leaveInfo: { balances: { vacation: 5, sick: 5 }, accrualRate: 0.4166, lastCreditDate: new Date('2024-01-01') }
    },
    {
        id: 'TNG-013',
        name: 'Ernesto Sinamban',
        email: 'ernesto@tng.com',
        role: Role.Employee,
        department: 'Operations',
        businessUnit: 'Bakebe SM Aura',
        status: 'Active',
        employmentStatus: 'Regular',
        isPhotoEnrolled: false,
        dateHired: new Date('2023-02-01'),
        position: 'Housekeeping Attendant',
        managerId: 'TNG-457',
        salary: { basic: 16000, deminimis: 0, reimbursable: 0 },
        leaveInfo: { balances: { vacation: 5, sick: 5 }, accrualRate: 0.4166, lastCreditDate: new Date('2024-01-01') }
    },
    {
        id: 'TNG-150',
        name: 'Mark Hermie Labog',
        email: 'mark@tng.com',
        role: Role.Employee,
        department: 'Operations',
        businessUnit: 'Bakebe SM Aura',
        status: 'Active',
        employmentStatus: 'Regular',
        isPhotoEnrolled: false,
        dateHired: new Date('2023-02-15'),
        position: 'Housekeeping Attendant',
        managerId: 'TNG-457',
        salary: { basic: 16000, deminimis: 0, reimbursable: 0 },
        leaveInfo: { balances: { vacation: 5, sick: 5 }, accrualRate: 0.4166, lastCreditDate: new Date('2024-01-01') }
    },
    {
        id: 'TNG-500',
        name: 'Sassy Latosa',
        email: 'sassy@tng.com',
        role: Role.Employee,
        department: 'Operations',
        businessUnit: 'Bakebe SM Aura',
        status: 'Active',
        employmentStatus: 'Regular',
        isPhotoEnrolled: false,
        dateHired: new Date('2023-03-01'),
        position: 'Baking Attendant',
        managerId: 'TNG-457',
        salary: { basic: 18000, deminimis: 0, reimbursable: 0 },
        leaveInfo: { balances: { vacation: 5, sick: 5 }, accrualRate: 0.4166, lastCreditDate: new Date('2024-01-01') }
    },
    {
        id: 'TNG-516',
        name: 'Janelle Convocar',
        email: 'janelle@tng.com',
        role: Role.Employee,
        department: 'Marketing',
        businessUnit: 'Bakebe SM Aura',
        status: 'Active',
        employmentStatus: 'Regular',
        isPhotoEnrolled: false,
        dateHired: new Date('2023-03-15'),
        position: 'Marketing Officer',
        managerId: 'TNG-457', 
        salary: { basic: 25000, deminimis: 1000, reimbursable: 0 },
        leaveInfo: { balances: { vacation: 5, sick: 5 }, accrualRate: 0.4166, lastCreditDate: new Date('2024-01-01') }
    },
    {
        id: 'TNG-242',
        name: 'Merlie Apostol',
        email: 'merlie@tng.com',
        role: Role.FinanceStaff,
        accessScope: { type: 'HOME_ONLY' },
        department: 'Finance and Accounting',
        businessUnit: 'Bakebe SM Aura',
        status: 'Active',
        employmentStatus: 'Regular',
        isPhotoEnrolled: false,
        dateHired: new Date('2023-02-20'),
        position: 'Accounting Analyst',
        managerId: 'u_finance', // Reports to Global Finance
        salary: { basic: 30000, deminimis: 1000, reimbursable: 0 },
        leaveInfo: { balances: { vacation: 5, sick: 5 }, accrualRate: 0.4166, lastCreditDate: new Date('2024-01-01') }
    },
    {
        id: 'TNG-567',
        name: 'Shervel Sasota',
        email: 'shervel@tng.com',
        role: Role.Employee,
        department: 'Operations',
        businessUnit: 'Bakebe SM Aura',
        status: 'Active',
        employmentStatus: 'Regular',
        isPhotoEnrolled: false,
        dateHired: new Date('2023-04-01'),
        position: 'Front Desk Officer',
        managerId: 'TNG-457',
        salary: { basic: 20000, deminimis: 500, reimbursable: 0 },
        leaveInfo: { balances: { vacation: 5, sick: 5 }, accrualRate: 0.4166, lastCreditDate: new Date('2024-01-01') }
    },
    {
        id: 'TNG-570',
        name: 'Danica Abinal',
        email: 'danica@tng.com',
        role: Role.Employee,
        department: 'Operations',
        businessUnit: 'Bakebe SM Aura',
        status: 'Active',
        employmentStatus: 'Regular',
        isPhotoEnrolled: false,
        dateHired: new Date('2023-04-05'),
        position: 'Front Desk Officer',
        managerId: 'TNG-457',
        salary: { basic: 20000, deminimis: 500, reimbursable: 0 },
        leaveInfo: { balances: { vacation: 5, sick: 5 }, accrualRate: 0.4166, lastCreditDate: new Date('2024-01-01') }
    },
    {
        id: 'TNG-576',
        name: 'Ednalyn Plgtain',
        email: 'ednalyn@tng.com',
        role: Role.Employee,
        department: 'Operations',
        businessUnit: 'Bakebe SM Aura',
        status: 'Active',
        employmentStatus: 'Regular',
        isPhotoEnrolled: false,
        dateHired: new Date('2023-04-10'),
        position: 'Baking Attendant',
        managerId: 'TNG-457',
        salary: { basic: 18000, deminimis: 0, reimbursable: 0 },
        leaveInfo: { balances: { vacation: 5, sick: 5 }, accrualRate: 0.4166, lastCreditDate: new Date('2024-01-01') }
    },
    // --- INFLATABLE ISLAND TEAM ---
    {
        id: 'TNG-404',
        name: 'Rogelio Dacanay',
        email: 'rogelio@tng.com',
        role: Role.BusinessUnitManager,
        accessScope: { type: 'HOME_ONLY' }, // Restricted to Inflatable Island
        department: 'Operations',
        businessUnit: 'Inflatable Island',
        status: 'Active',
        employmentStatus: 'Regular',
        isPhotoEnrolled: true,
        dateHired: new Date('2021-05-01'),
        position: 'Resort Director',
        managerId: 'u_opsdir',
        salary: { basic: 60000, deminimis: 2000, reimbursable: 1000 },
        monthlySalary: 63000,
        leaveInfo: { balances: { vacation: 5, sick: 5 }, accrualRate: 0.4166, lastCreditDate: new Date('2024-01-01') }
    },
    {
        id: 'TNG-434',
        name: 'Princess Erica Asa Berdon',
        email: 'princess@tng.com',
        role: Role.HRManager, // Local HR
        accessScope: { type: 'HOME_ONLY' }, // Restricted to Inflatable Island
        department: 'HR',
        businessUnit: 'Inflatable Island',
        status: 'Active',
        employmentStatus: 'Regular',
        isPhotoEnrolled: true,
        dateHired: new Date('2022-06-15'),
        position: 'HR Generalist',
        managerId: 'TNG-404', // Reports to Resort Director? Or Global HR?
        salary: { basic: 35000, deminimis: 1000, reimbursable: 0 },
        leaveInfo: { balances: { vacation: 5, sick: 5 }, accrualRate: 0.4166, lastCreditDate: new Date('2024-01-01') }
    },
    {
        id: 'TNG-426',
        name: 'Eric Justin Felipe',
        email: 'eric@tng.com',
        role: Role.Manager,
        department: 'Kitchen',
        businessUnit: 'Inflatable Island',
        status: 'Active',
        employmentStatus: 'Regular',
        isPhotoEnrolled: true,
        dateHired: new Date('2022-03-10'),
        position: 'Head Chef',
        managerId: 'TNG-404',
        salary: { basic: 32000, deminimis: 1000, reimbursable: 0 },
        leaveInfo: { balances: { vacation: 5, sick: 5 }, accrualRate: 0.4166, lastCreditDate: new Date('2024-01-01') }
    },
    {
        id: 'TNG-442',
        name: 'Hilary Jeane Lopera',
        email: 'hilary@tng.com',
        role: Role.FinanceStaff,
        accessScope: { type: 'HOME_ONLY' },
        department: 'Finance',
        businessUnit: 'Inflatable Island',
        status: 'Active',
        employmentStatus: 'Regular',
        isPhotoEnrolled: true,
        dateHired: new Date('2022-04-01'),
        position: 'Accounting Associate',
        managerId: 'u_finance', // Dotted line to Finance Director, solid to BUM?
        salary: { basic: 25000, deminimis: 1000, reimbursable: 0 },
        leaveInfo: { balances: { vacation: 5, sick: 5 }, accrualRate: 0.4166, lastCreditDate: new Date('2024-01-01') }
    },
    {
        id: 'TNG-509',
        name: 'Joan Clavo',
        email: 'joan@tng.com',
        role: Role.FinanceStaff,
        accessScope: { type: 'HOME_ONLY' },
        department: 'Finance',
        businessUnit: 'Inflatable Island',
        status: 'Active',
        employmentStatus: 'Regular',
        isPhotoEnrolled: false,
        dateHired: new Date('2023-01-20'),
        position: 'Accounting Staff',
        managerId: 'TNG-442',
        salary: { basic: 20000, deminimis: 500, reimbursable: 0 },
        leaveInfo: { balances: { vacation: 5, sick: 5 }, accrualRate: 0.4166, lastCreditDate: new Date('2024-01-01') }
    },
    {
        id: 'TNG-075',
        name: 'Romart Bumanlag',
        email: 'romart@tng.com',
        role: Role.Employee,
        department: 'Sales',
        businessUnit: 'Inflatable Island',
        status: 'Active',
        employmentStatus: 'Regular',
        isPhotoEnrolled: true,
        dateHired: new Date('2021-08-15'),
        position: 'Sales Account Executive',
        managerId: 'TNG-404',
        salary: { basic: 22000, deminimis: 1000, reimbursable: 0 },
        leaveInfo: { balances: { vacation: 5, sick: 5 }, accrualRate: 0.4166, lastCreditDate: new Date('2024-01-01') }
    },
    {
        id: 'TNG-344',
        name: 'Myrna Trimor',
        email: 'myrna@tng.com',
        role: Role.Employee,
        department: 'Operations',
        businessUnit: 'Inflatable Island',
        status: 'Active',
        employmentStatus: 'Regular',
        isPhotoEnrolled: false,
        dateHired: new Date('2021-09-01'),
        position: 'CR Attendant (Cleaner)',
        managerId: 'TNG-404',
        salary: { basic: 15000, deminimis: 0, reimbursable: 0 },
        leaveInfo: { balances: { vacation: 5, sick: 5 }, accrualRate: 0.4166, lastCreditDate: new Date('2024-01-01') }
    },
    {
        id: 'TNG-347',
        name: 'Shemaiah Primavera',
        email: 'shemaiah@tng.com',
        role: Role.Employee,
        department: 'Kitchen',
        businessUnit: 'Inflatable Island',
        status: 'Active',
        employmentStatus: 'Regular',
        isPhotoEnrolled: false,
        dateHired: new Date('2021-09-10'),
        position: 'Line Cook',
        managerId: 'TNG-426',
        salary: { basic: 16000, deminimis: 0, reimbursable: 0 },
        leaveInfo: { balances: { vacation: 5, sick: 5 }, accrualRate: 0.4166, lastCreditDate: new Date('2024-01-01') }
    },
    {
        id: 'TNG-371',
        name: 'Gio Gadiana',
        email: 'gio@tng.com',
        role: Role.Employee,
        department: 'Lifeguard',
        businessUnit: 'Inflatable Island',
        status: 'Active',
        employmentStatus: 'Regular',
        isPhotoEnrolled: false,
        dateHired: new Date('2021-10-01'),
        position: 'Lifeguard',
        managerId: 'TNG-404',
        salary: { basic: 17000, deminimis: 0, reimbursable: 0 },
        leaveInfo: { balances: { vacation: 5, sick: 5 }, accrualRate: 0.4166, lastCreditDate: new Date('2024-01-01') }
    },
    {
        id: 'TNG-441',
        name: 'Hennessey Montemayor',
        email: 'hennessey@tng.com',
        role: Role.Employee,
        department: 'Operations',
        businessUnit: 'Inflatable Island',
        status: 'Active',
        employmentStatus: 'Regular',
        isPhotoEnrolled: false,
        dateHired: new Date('2022-02-01'),
        position: 'Cashier',
        managerId: 'TNG-404',
        salary: { basic: 18000, deminimis: 500, reimbursable: 0 },
        leaveInfo: { balances: { vacation: 5, sick: 5 }, accrualRate: 0.4166, lastCreditDate: new Date('2024-01-01') }
    },
    {
        id: 'TNG-452',
        name: 'John Michael Apog',
        email: 'john@tng.com',
        role: Role.Employee,
        department: 'Dining',
        businessUnit: 'Inflatable Island',
        status: 'Active',
        employmentStatus: 'Regular',
        isPhotoEnrolled: false,
        dateHired: new Date('2022-03-01'),
        position: 'Dining Staff',
        managerId: 'TNG-404',
        salary: { basic: 15000, deminimis: 0, reimbursable: 0 },
        leaveInfo: { balances: { vacation: 5, sick: 5 }, accrualRate: 0.4166, lastCreditDate: new Date('2024-01-01') }
    },
    {
        id: 'TNG-460',
        name: 'Camille Ollesca',
        email: 'camille@tng.com',
        role: Role.Employee,
        department: 'Operations',
        businessUnit: 'Inflatable Island',
        status: 'Active',
        employmentStatus: 'Regular',
        isPhotoEnrolled: false,
        dateHired: new Date('2022-04-01'),
        position: 'Marketing Officer/Content Creator',
        managerId: 'TNG-404',
        salary: { basic: 25000, deminimis: 1000, reimbursable: 0 },
        leaveInfo: { balances: { vacation: 5, sick: 5 }, accrualRate: 0.4166, lastCreditDate: new Date('2024-01-01') }
    },
    {
        id: 'TNG-481',
        name: 'Christopher Paolo Soriano',
        email: 'christopher@tng.com',
        role: Role.Employee,
        department: 'Inventory',
        businessUnit: 'Inflatable Island',
        status: 'Active',
        employmentStatus: 'Regular',
        isPhotoEnrolled: false,
        dateHired: new Date('2022-05-01'),
        position: 'Inventory Cost Controller',
        managerId: 'TNG-404',
        salary: { basic: 22000, deminimis: 0, reimbursable: 0 },
        leaveInfo: { balances: { vacation: 5, sick: 5 }, accrualRate: 0.4166, lastCreditDate: new Date('2024-01-01') }
    },
    {
        id: 'TNG-495',
        name: 'Joel Palermo',
        email: 'joel@tng.com',
        role: Role.Employee,
        department: 'Bar',
        businessUnit: 'Inflatable Island',
        status: 'Active',
        employmentStatus: 'Regular',
        isPhotoEnrolled: false,
        dateHired: new Date('2022-06-01'),
        position: 'Bartender',
        managerId: 'TNG-404',
        salary: { basic: 18000, deminimis: 0, reimbursable: 0 },
        leaveInfo: { balances: { vacation: 5, sick: 5 }, accrualRate: 0.4166, lastCreditDate: new Date('2024-01-01') }
    },
    {
        id: 'TNG-511',
        name: 'Jordan Villorante',
        email: 'jordan@tng.com',
        role: Role.Employee,
        department: 'Kitchen',
        businessUnit: 'Inflatable Island',
        status: 'Active',
        employmentStatus: 'Regular',
        isPhotoEnrolled: false,
        dateHired: new Date('2022-07-01'),
        position: 'Line Cook',
        managerId: 'TNG-426',
        salary: { basic: 16000, deminimis: 0, reimbursable: 0 },
        leaveInfo: { balances: { vacation: 5, sick: 5 }, accrualRate: 0.4166, lastCreditDate: new Date('2024-01-01') }
    },
    {
        id: 'TNG-533',
        name: 'Danica Mae Christy',
        email: 'danica.c@tng.com',
        role: Role.Employee,
        department: 'Marketing',
        businessUnit: 'Inflatable Island',
        status: 'Active',
        employmentStatus: 'Regular',
        isPhotoEnrolled: false,
        dateHired: new Date('2022-08-01'),
        position: 'Graphic Artist',
        managerId: 'TNG-404',
        salary: { basic: 20000, deminimis: 0, reimbursable: 0 },
        leaveInfo: { balances: { vacation: 5, sick: 5 }, accrualRate: 0.4166, lastCreditDate: new Date('2024-01-01') }
    },
    {
        id: 'TNG-395',
        name: 'Crisvic Sierra',
        email: 'crisvic@tng.com',
        role: Role.Employee,
        department: 'Kitchen',
        businessUnit: 'Inflatable Island',
        status: 'Active',
        employmentStatus: 'Regular',
        isPhotoEnrolled: false,
        dateHired: new Date('2021-11-01'),
        position: 'Line Cook',
        managerId: 'TNG-426',
        salary: { basic: 16000, deminimis: 0, reimbursable: 0 },
        leaveInfo: { balances: { vacation: 5, sick: 5 }, accrualRate: 0.4166, lastCreditDate: new Date('2024-01-01') }
    },
    {
        id: 'TNG-407',
        name: 'Kathrine Caryl Guerra',
        email: 'kathrine@tng.com',
        role: Role.Employee,
        department: 'Dining',
        businessUnit: 'Inflatable Island',
        status: 'Active',
        employmentStatus: 'Regular',
        isPhotoEnrolled: false,
        dateHired: new Date('2022-01-15'),
        position: 'Dining Staff',
        managerId: 'TNG-404',
        salary: { basic: 15000, deminimis: 0, reimbursable: 0 },
        leaveInfo: { balances: { vacation: 5, sick: 5 }, accrualRate: 0.4166, lastCreditDate: new Date('2024-01-01') }
    },
    {
        id: 'TNG-498',
        name: 'Piolo Alcala',
        email: 'piolo@tng.com',
        role: Role.Employee,
        department: 'Sales and Reservations',
        businessUnit: 'Inflatable Island',
        status: 'Active',
        employmentStatus: 'Regular',
        isPhotoEnrolled: false,
        dateHired: new Date('2022-06-15'),
        position: 'Sales & Reservations Officer',
        managerId: 'TNG-404',
        salary: { basic: 18000, deminimis: 0, reimbursable: 0 },
        leaveInfo: { balances: { vacation: 5, sick: 5 }, accrualRate: 0.4166, lastCreditDate: new Date('2024-01-01') }
    },
    {
        id: 'TNG-561',
        name: 'Bernadette Isidro',
        email: 'bernadette@tng.com',
        role: Role.Employee,
        department: 'Purchasing',
        businessUnit: 'Inflatable Island',
        status: 'Active',
        employmentStatus: 'Regular',
        isPhotoEnrolled: false,
        dateHired: new Date('2023-03-01'),
        position: 'Purchasing Officer',
        managerId: 'TNG-404',
        salary: { basic: 20000, deminimis: 0, reimbursable: 0 },
        leaveInfo: { balances: { vacation: 5, sick: 5 }, accrualRate: 0.4166, lastCreditDate: new Date('2024-01-01') }
    },
    {
        id: 'TNG-559',
        name: 'Alexis Egmao',
        email: 'alexis@tng.com',
        role: Role.Employee,
        department: 'Dining',
        businessUnit: 'Inflatable Island',
        status: 'Active',
        employmentStatus: 'Regular',
        isPhotoEnrolled: false,
        dateHired: new Date('2023-02-15'),
        position: 'Dining Staff',
        managerId: 'TNG-404',
        salary: { basic: 15000, deminimis: 0, reimbursable: 0 },
        leaveInfo: { balances: { vacation: 5, sick: 5 }, accrualRate: 0.4166, lastCreditDate: new Date('2024-01-01') }
    },
    {
        id: 'TNG-560',
        name: 'Melchor Angeles',
        email: 'melchor@tng.com',
        role: Role.Employee,
        department: 'Operations',
        businessUnit: 'Inflatable Island',
        status: 'Active',
        employmentStatus: 'Regular',
        isPhotoEnrolled: false,
        dateHired: new Date('2023-02-20'),
        position: 'Beach Guide',
        managerId: 'TNG-404',
        salary: { basic: 15000, deminimis: 0, reimbursable: 0 },
        leaveInfo: { balances: { vacation: 5, sick: 5 }, accrualRate: 0.4166, lastCreditDate: new Date('2024-01-01') }
    },
    {
        id: 'TNG-562',
        name: 'Regie Baluyut',
        email: 'regie@tng.com',
        role: Role.Employee,
        department: 'Bar',
        businessUnit: 'Inflatable Island',
        status: 'Active',
        employmentStatus: 'Regular',
        isPhotoEnrolled: false,
        dateHired: new Date('2023-02-25'),
        position: 'SULA Bartender',
        managerId: 'TNG-404',
        salary: { basic: 16000, deminimis: 0, reimbursable: 0 },
        leaveInfo: { balances: { vacation: 5, sick: 5 }, accrualRate: 0.4166, lastCreditDate: new Date('2024-01-01') }
    }
];

export const mockDeviceBinds: DeviceBind[] = [];
export const mockChangeHistory: ChangeHistory[] = [];
export const mockEmployeeDrafts: EmployeeDraft[] = [];
export const mockManpowerRequests: ManpowerRequest[] = []; 
export const mockWFHRequests: WFHRequest[] = [];

export const mockBenefitTypes: BenefitType[] = [
    { id: 'bt1', name: 'Meal Voucher', description: 'Daily meal allowance', maxValue: 200, requiresBodApproval: false, isActive: true },
    { id: 'bt2', name: 'Salary Loan', description: 'Emergency cash advance', maxValue: 10000, requiresBodApproval: true, isActive: true }
];

export const mockBenefitRequests: BenefitRequest[] = [];


export const mockPANTemplates: PANTemplate[] = [
    {
        id: 'pt1',
        name: 'Regularization',
        actionTaken: { changeOfStatus: true, promotion: false, transfer: false, salaryIncrease: true, changeOfJobTitle: false, others: '' },
        notes: 'Employee has successfully passed the probationary period effective {{effective_date}}. Salary adjusted accordingly.',
        createdByUserId: '5',
        createdAt: new Date(),
        updatedAt: new Date(),
        isDefault: true
    },
    {
        id: 'pt2',
        name: 'Promotion',
        actionTaken: { changeOfStatus: false, promotion: true, transfer: false, salaryIncrease: true, changeOfJobTitle: true, others: '' },
        notes: 'Promoted to new role effective {{effective_date}} due to outstanding performance.',
        createdByUserId: '5',
        createdAt: new Date(),
        updatedAt: new Date(),
    }
];

export const mockPANs: PAN[] = [
    {
        id: 'PAN-2024-001',
        employeeId: 'TNG-013', 
        employeeName: 'Ernesto Sinamban',
        effectiveDate: new Date('2024-06-01'),
        status: PANStatus.Draft,
        actionTaken: { changeOfStatus: false, promotion: true, transfer: false, salaryIncrease: true, changeOfJobTitle: true, others: '' },
        particulars: {
            from: { position: 'Housekeeping Attendant', salary: { basic: 16000, deminimis: 0, reimbursable: 0 } },
            to: { position: 'Senior Housekeeping', salary: { basic: 18000, deminimis: 0, reimbursable: 0 } }
        },
        tenure: '1.5 Years',
        notes: 'Draft promotion for review.',
        routingSteps: [],
    },
];

export const mockOnboardingTemplates: OnboardingChecklistTemplate[] = [
    {
        id: 't1',
        name: 'Standard Onboarding',
        targetRole: Role.Employee,
        templateType: 'Onboarding',
        tasks: [
            {
                id: 'task1',
                name: 'Submit ID',
                description: 'Upload a valid government ID',
                ownerRole: Role.Employee,
                dueDays: 3,
                dueDateType: 'hire',
                taskType: OnboardingTaskType.Upload,
                points: 10
            },
            {
                id: 'task2',
                name: 'Read Employee Handbook',
                description: 'Read the attached handbook',
                ownerRole: Role.Employee,
                dueDays: 5,
                dueDateType: 'hire',
                taskType: OnboardingTaskType.Read,
                readContent: '<h1>Welcome!</h1><p>Please read the company policies carefully.</p>',
                points: 5
            }
        ]
    },
    {
        id: 't2',
        name: 'Standard Offboarding',
        targetRole: Role.Employee,
        templateType: 'Offboarding',
        tasks: [
            {
                id: 'off1',
                name: 'Return Laptop',
                description: 'Return company laptop to IT',
                ownerRole: Role.Employee,
                dueDays: 0,
                dueDateType: 'resignation',
                taskType: OnboardingTaskType.ReturnAsset,
                points: 0
            }
        ]
    }
];
export const mockOnboardingChecklists: OnboardingChecklist[] = [
    {
        id: 'cl1',
        employeeId: 'TNG-500',
        templateId: 't1',
        createdAt: new Date(),
        status: 'InProgress',
        tasks: [
            {
                id: 'ot1',
                templateTaskId: 'task1',
                employeeId: 'TNG-500',
                name: 'Submit ID',
                description: 'Upload a valid government ID',
                ownerUserId: 'TNG-500',
                ownerName: 'Sassy Latosa',
                dueDate: new Date(Date.now() + 86400000 * 3),
                status: OnboardingTaskStatus.Pending,
                points: 10,
                taskType: OnboardingTaskType.Upload
            }
        ]
    }
];
export const mockResignations: Resignation[] = [];
export const mockAssetAssignments: AssetAssignment[] = [];
export const mockAssets: Asset[] = [
    {
        id: 'asset1',
        assetTag: 'NB-001',
        name: 'MacBook Pro',
        type: 'Laptop',
        businessUnitId: 'bu1',
        purchaseDate: new Date('2023-01-15'),
        value: 80000,
        status: AssetStatus.Available
    },
    {
        id: 'asset2',
        assetTag: 'PH-001',
        name: 'iPhone 13',
        type: 'Mobile Phone',
        businessUnitId: 'bu1',
        purchaseDate: new Date('2023-02-10'),
        value: 45000,
        status: AssetStatus.Available
    }
];
export const mockContractTemplates: ContractTemplate[] = [
    {
        id: 'ct1',
        title: 'Standard Regularization Contract',
        description: 'Standard contract for regular employees',
        owningBusinessUnitId: 'bu1',
        isDefault: true,
        body: '<p>This Employment Contract is made and entered into...</p>',
        sections: [{ id: 's1', title: 'Compensation', body: '<p>The Employee shall receive a monthly salary of {{rate}}.</p>'}],
        footer: '<p>Confidential - TNG</p>'
    }
];
export const mockEnvelopes: Envelope[] = [
    {
        id: 'ENV-001',
        templateId: 'ct1',
        templateTitle: 'Standard Regularization Contract',
        employeeId: 'TNG-500', 
        employeeName: 'Sassy Latosa',
        title: 'Regularization Contract',
        routingSteps: [
            { id: 'step1', userId: 'u_hr', name: 'Helen HR', role: 'Approver', status: RoutingStepStatus.Completed, order: 1, is_required: true, timestamp: new Date() },
            { id: 'step2', userId: 'TNG-500', name: 'Sassy Latosa', role: 'Signer', status: RoutingStepStatus.Pending, order: 2, is_required: true }
        ],
        dueDate: new Date(Date.now() + 86400000 * 3), // 3 days from now
        status: EnvelopeStatus.OutForSignature,
        createdByUserId: 'u_hr',
        createdAt: new Date(),
        events: [
            { timestamp: new Date(), type: EnvelopeEventType.Created, userName: 'Helen HR' },
            { timestamp: new Date(), type: EnvelopeEventType.Sent, userName: 'Helen HR' }
        ]
    }
];
export const mockNTEs: NTE[] = [];
export const mockResolutions: Resolution[] = [];
export const mockCodeOfDiscipline: CodeOfDiscipline = {
    version: '1.0',
    effectiveDate: new Date('2024-01-01'),
    entries: [
        {
            id: 'code1',
            code: 'A.1',
            category: 'Attendance',
            description: 'Unauthorized Absences',
            severityLevel: SeverityLevel.Medium,
            sanctions: [{ offense: 1, action: 'Verbal Warning' }, { offense: 2, action: 'Written Warning' }],
            lastModifiedAt: new Date(),
            lastModifiedByUserId: '1'
        },
        {
            id: 'code2',
            code: 'B.1',
            category: 'Conduct',
            description: 'Insubordination',
            severityLevel: SeverityLevel.High,
            sanctions: [{ offense: 1, action: 'Written Warning' }, { offense: 2, action: 'Suspension' }],
            lastModifiedAt: new Date(),
            lastModifiedByUserId: '1'
        }
    ]
};
export const mockMemos: Memo[] = [
    {
        id: 'memo1',
        title: 'Holiday Notice',
        body: '<p>Please be advised that the office will be closed on...</p>',
        effectiveDate: new Date(),
        targetDepartments: ['All'],
        targetBusinessUnits: ['All'],
        acknowledgementRequired: true,
        tags: ['Holiday'],
        attachments: [],
        acknowledgementTracker: [],
        status: 'Published'
    }
];
export const mockFeedbackTemplates: FeedbackTemplate[] = [
    {
        id: 'ft1',
        title: 'Standard NTE',
        from: 'HR Department',
        subject: 'Notice to Explain',
        cc: 'Manager',
        body: '<p>Dear {{employee_name}},</p><p>This is a Notice to Explain regarding {{allegations}}.</p>',
        signatoryName: 'HR Manager',
        signatoryTitle: 'Head of HR'
    }
];
export const mockIncidentReports: IncidentReport[] = [
    {
        id: 'IR-001',
        category: 'Attendance',
        description: 'Employee was absent without leave.',
        location: 'Office',
        dateTime: new Date(),
        involvedEmployeeIds: ['TNG-500'],
        involvedEmployeeNames: ['Sassy Latosa'],
        witnessIds: [],
        witnessNames: [],
        reportedBy: 'TNG-457',
        status: IRStatus.Submitted,
        pipelineStage: 'ir-review',
        nteIds: [],
        chatThread: [],
        businessUnitId: 'bu1',
        assignedToId: 'u_hr',
        assignedToName: 'Helen HR'
    }
];
export const mockJobRequisitions: JobRequisition[] = [
    {
        id: 'req1',
        reqCode: 'REQ-001',
        title: 'Frontend Developer',
        departmentId: 'dept3',
        businessUnitId: 'bu5',
        headcount: 1,
        employmentType: 'Full-Time',
        locationType: 'Hybrid',
        workLocation: 'Makati',
        budgetedSalaryMin: 50000,
        budgetedSalaryMax: 80000,
        justification: 'Expansion',
        createdByUserId: 'admin_user',
        status: JobRequisitionStatus.Approved,
        createdAt: new Date(),
        updatedAt: new Date(),
        isUrgent: true,
        routingSteps: []
    },
    {
        id: 'req2',
        reqCode: 'REQ-002',
        title: 'Park Attendant',
        departmentId: 'dept1', // Operations
        businessUnitId: 'bu3', // Inflatable Island
        headcount: 5,
        employmentType: 'Full-Time',
        locationType: 'Onsite',
        workLocation: 'Subic',
        budgetedSalaryMin: 15000,
        budgetedSalaryMax: 18000,
        justification: 'Staffing for new season',
        createdByUserId: 'u_opsdir',
        status: JobRequisitionStatus.Approved,
        createdAt: new Date(),
        updatedAt: new Date(),
        isUrgent: false,
        routingSteps: []
    }
];
export const mockNotifications: Notification[] = [];
export const mockJobPostVisualTemplates: JobPostVisualTemplate[] = [
    {
        id: 'jpt1',
        name: 'Standard Blue',
        updatedAt: new Date(),
        createdBy: 'Admin',
        backgroundColor: '#EBF8FF',
        cardColor: '#FFFFFF',
        textColor: '#1F2937',
        accentColor: '#3B82F6',
        backgroundImage: '',
        logoImage: '',
        headline: 'WE ARE HIRING',
        jobTitle: 'JOIN OUR TEAM',
        description: 'We are looking for talented individuals.',
        details: [
            { icon: '', label: 'Full Time' },
            { icon: '', label: 'Competitive Salary' },
            { icon: '', label: 'Remote Work' },
            { icon: '', label: 'Great Benefits' }
        ],
        col1Title: 'Responsibilities',
        col1Content: '- Develop features\n- Write clean code',
        col2Title: 'Requirements',
        col2Content: '- 3+ years experience\n- React knowledge',
        contactTitle: 'Apply Now',
        email1: 'careers@tng.com',
        email2: '',
        subjectLine: 'Application for [Role]',
        buttonText: 'APPLY HERE'
    }
];
export const mockJobPosts: JobPost[] = [
    {
        id: 'post1',
        requisitionId: 'req1',
        businessUnitId: 'bu5',
        title: 'Frontend Developer',
        slug: 'frontend-developer',
        description: 'We need a React expert.',
        requirements: '3+ years React experience.',
        benefits: 'HMO, Leaves',
        locationLabel: 'Makati, Philippines',
        employmentType: 'Full-Time',
        status: JobPostStatus.Published,
        publishedAt: new Date(),
        channels: { careerSite: true, qr: false, social: true, jobBoards: false },
        referralBonus: 5000
    },
    {
        id: 'post2',
        requisitionId: 'req2',
        businessUnitId: 'bu3', // Inflatable Island
        title: 'Park Attendant',
        slug: 'park-attendant',
        description: 'Join the fun at Inflatable Island! Ensure guest safety and assist with operations.',
        requirements: 'Strong swimmer, customer service oriented.',
        benefits: 'Free park access, meal allowance',
        locationLabel: 'Subic, Zambales',
        employmentType: 'Full-Time',
        status: JobPostStatus.Published,
        publishedAt: new Date(),
        channels: { careerSite: true, qr: true, social: true, jobBoards: false },
        referralBonus: 1000
    }
];
export const mockCandidates: Candidate[] = [];
export const mockApplications: Application[] = [];
export const mockInterviewFeedbacks: InterviewFeedback[] = [];
export const mockOffers: Offer[] = [];
export const mockApplicantPageThemes: ApplicantPageTheme[] = [
    {
        id: 'APT-001',
        businessUnitId: 'bu3', // Inflatable Island
        slug: 'inflatable-island',
        isActive: true,
        pageTitle: 'Inflatable Island Careers',
        heroHeadline: 'Make a Splash, Join the Fun at Inflatable Island',
        heroDescription: "Work at Asia's biggest floating playground! We offer exciting work, great benefits, and a happy team who loves creating smiles for kids and families.",
        heroOverlayColor: 'rgba(0, 120, 255, 0.1)',
        primaryColor: '#8B5CF6', // Violet/Purple
        backgroundColor: '#E0F2FE', // Light Blue
        heroImage: 'https://res.cloudinary.com/dy1bghrrm/image/upload/v1715685030/inflatable-island_c8g92a.jpg', // Updated Pink Theme Image
        contactEmail: 'careers@inflatableisland.com',
        benefits: [
            { id: 'b1', title: 'Growth Opportunities', description: 'Advance your career at a fast-growing company', icon: 'rocket' },
            { id: 'b2', title: 'Fun Workplace', description: 'Enjoy a lively environment with a tight knit team', icon: 'smile' },
            { id: 'b3', title: 'Competitive Pay', description: 'Salary + Bonuses, benefits, and tree park passes', icon: 'wallet' },
            { id: 'b4', title: 'Make an Impact', description: 'Create unforgettable memories for our guests', icon: 'heart' }
        ],
        testimonials: [
            { id: 't1', quote: "Every day is a new adventure, and my coworkers are like family.", author: "Samantha", role: "Park Supervisor" },
            { id: 't2', quote: "It's so rewarding to see kids and parents having a blast.", author: "Josh", role: "Attendant" }
        ]
    }
];
export const mockEvaluations: Evaluation[] = [
    {
        id: 'eval1',
        name: 'Q1 2025 Performance Review',
        timelineId: 'tl1',
        targetBusinessUnitIds: ['bu1'],
        targetEmployeeIds: ['TNG-500'],
        questionSetIds: ['qs1'],
        evaluators: [
            { 
                id: 'ev1',
                type: EvaluatorType.Individual,
                userId: 'TNG-457', 
                weight: 100,
                isAnonymous: false,
                excludeSubject: true
            }
        ],
        status: 'InProgress',
        createdAt: new Date(),
        isEmployeeVisible: false,
        dueDate: new Date(new Date().getTime() + 14 * 24 * 60 * 60 * 1000), // 14 days from now
    }
];
export const mockEvaluationSubmissions: EvaluationSubmission[] = [];
export const mockQuestionSets: QuestionSet[] = [
    { id: 'qs1', name: 'Core Competencies', description: 'Standard company values', businessUnitId: 'bu1' }
];
export const mockEvaluationQuestions: EvaluationQuestion[] = [
    { id: 'q1', questionSetId: 'qs1', title: 'Teamwork', description: 'Works well with others', questionType: 'rating', isArchived: false, targetEmployeeLevels: [EmployeeLevel.RankAndFile], targetEvaluatorRoles: [Role.Manager] },
    { id: 'q2', questionSetId: 'qs1', title: 'Communication', description: 'Communicates clearly', questionType: 'rating', isArchived: false, targetEmployeeLevels: [EmployeeLevel.RankAndFile], targetEvaluatorRoles: [Role.Manager] }
];
export const mockEvaluationTimelines: EvaluationTimeline[] = [
    { id: 'tl1', businessUnitId: 'bu1', name: 'Q1 2025', type: 'Quarterly', rolloutDate: new Date('2025-01-01'), endDate: new Date('2025-03-31'), status: 'Active' as any }
];

// Updated Mock Awards with Design object
export const mockAwards: Award[] = [
    { 
        id: 'aw1', 
        title: 'Employee of the Month', 
        description: 'Outstanding performance', 
        badgeIconUrl: 'https://cdn-icons-png.flaticon.com/512/3112/3112946.png', 
        isActive: true,
        design: {
            backgroundColor: '#fdf2f8', // pink-50
            backgroundImageUrl: '',
            borderWidth: 10,
            borderColor: '#f472b6', // pink-400
            fontFamily: 'serif',
            titleColor: '#be185d', // pink-700
            textColor: '#374151', // gray-700
            headerText: 'CERTIFICATE OF ACHIEVEMENT',
            bodyText: 'This certificate is proudly presented to\n\n{{employee_name}}\n\nfor being awarded {{award_title}} on {{date}}.\n\n{{citation}}',
            signatories: [
                { name: 'Kay Lacap', title: 'President', signatureUrl: '' }, // Add signature URL if available
                { name: 'Jerson Masiglat', title: 'General Manager', signatureUrl: '' }
            ]
        }
    },
     { 
        id: 'aw2', 
        title: 'Service Excellence', 
        description: 'For going above and beyond', 
        badgeIconUrl: 'https://cdn-icons-png.flaticon.com/512/2583/2583319.png', 
        isActive: true,
        design: {
            backgroundColor: '#fff7ed', // orange-50
            backgroundImageUrl: '',
            borderWidth: 5,
            borderColor: '#fb923c', // orange-400
            fontFamily: 'sans-serif',
            titleColor: '#c2410c', // orange-700
            textColor: '#1f2937', // gray-800
            headerText: 'SERVICE EXCELLENCE AWARD',
            bodyText: 'Presented to {{employee_name}}\n\nIn recognition of your outstanding service and dedication.\n\nAwarded on {{date}}.',
            signatories: [
                { name: 'Gary General', title: 'General Manager', signatureUrl: '' }
            ]
        }
    }
];
export const mockEmployeeAwards: EmployeeAward[] = [];
export const mockAnnouncements: Announcement[] = [
    {
        id: 'ann1',
        title: 'Town Hall Meeting',
        message: 'Join us for the quarterly town hall.',
        type: AnnouncementType.General,
        targetGroup: 'All',
        createdBy: 'Admin',
        createdAt: new Date(),
        acknowledgementIds: []
    }
];
export const mockCalendarEvents: CalendarEvent[] = [
    { id: 'evt1', title: 'Team Building', start: new Date(new Date().setDate(new Date().getDate() + 5)), end: new Date(new Date().setDate(new Date().getDate() + 5)), color: 'blue' }
];
export const mockKbCategories: KnowledgeBaseCategory[] = [
    { id: 'kbc1', name: 'General', description: 'General company info', icon: '🏢' },
    { id: 'kbc2', name: 'HR Policies', description: 'Leave, benefits, etc.', icon: '📖' }
];
export const mockKbArticles: KnowledgeBaseArticle[] = [
    { id: 'kba1', slug: 'how-to-file-leave', title: 'How to File Leave', categoryId: 'kbc2', content: '<p>Go to the payroll tab...</p>', tags: ['leave', 'guide'], lastUpdatedAt: new Date(), viewCount: 10 }
];
export const mockTickets: Ticket[] = [
    {
        id: 'T-1001',
        requesterId: 'TNG-500',
        requesterName: 'Sassy Latosa',
        description: 'Cannot access email',
        category: TicketCategory.IT,
        priority: TicketPriority.High,
        status: TicketStatus.New,
        createdAt: new Date(),
        chatThread: [],
        businessUnitId: 'bu1',
        assignedToId: 'admin_user',
        assignedToName: 'Admin User'
    }
];
export const mockUserDocuments: UserDocument[] = [];
export const mockOtRequests: OTRequest[] = [
    // Existing mock
    {
        id: 'OT-1001',
        employeeId: 'TNG-500', 
        employeeName: 'Sassy Latosa',
        date: new Date(),
        startTime: '18:00',
        endTime: '20:00',
        reason: 'Closing tasks',
        status: OTStatus.Submitted,
        submittedAt: new Date(),
        historyLog: []
    },
    {
        id: 'OT-1002',
        employeeId: 'TNG-500', 
        employeeName: 'Sassy Latosa',
        date: new Date(new Date().setDate(new Date().getDate() - 2)), // 2 days ago
        startTime: '18:00',
        endTime: '21:00',
        reason: 'Inventory Audit',
        status: OTStatus.Approved,
        approvedHours: 3,
        submittedAt: new Date(),
        historyLog: []
    }
];
export const mockAttendanceExceptions: AttendanceExceptionRecord[] = [];
export const mockLeaveRequests: LeaveRequest[] = [];

export const mockOperatingHours: OperatingHours[] = [
    {
        businessUnitId: 'bu1', // The Fun Roof
        hours: {
            'Mon': { open: '10:00', close: '22:00' },
            'Tue': { open: '10:00', close: '22:00' },
            'Wed': { open: '10:00', close: '22:00' },
            'Thu': { open: '10:00', close: '00:00' },
            'Fri': { open: '10:00', close: '02:00' },
            'Sat': { open: '10:00', close: '02:00' },
            'Sun': { open: '10:00', close: '22:00' },
        }
    }
];

export const mockServiceAreas: ServiceArea[] = [
    { id: 'area1', businessUnitId: 'bu1', name: 'Reception', capacity: 2 },
    { id: 'area2', businessUnitId: 'bu1', name: 'Bar', capacity: 3 },
    { id: 'area3', businessUnitId: 'bu1', name: 'Floor', capacity: 5 },
];

export const mockDemandTypes: DemandTypeConfig[] = [
    { id: 'dt1', businessUnitId: 'bu1', tier: DayTypeTier.OffPeak, label: 'Weekday', color: 'bg-blue-100 text-blue-800' },
    { id: 'dt2', businessUnitId: 'bu1', tier: DayTypeTier.Peak, label: 'Weekend', color: 'bg-purple-100 text-purple-800' },
    { id: 'dt3', businessUnitId: 'bu1', tier: DayTypeTier.SuperPeak, label: 'Holiday/Event', color: 'bg-red-100 text-red-800' },
];

export const mockStaffingRequirements: StaffingRequirement[] = [
    { id: 'req1', areaId: 'area1', role: 'Staff', dayTypeTier: DayTypeTier.OffPeak, minCount: 1 },
    { id: 'req2', areaId: 'area1', role: 'Staff', dayTypeTier: DayTypeTier.Peak, minCount: 2 },
    { id: 'req3', areaId: 'area2', role: 'Staff', dayTypeTier: DayTypeTier.Peak, minCount: 2 },
];

export const mockLeaveTypes: LeaveType[] = [
    { id: 'lt1', name: 'Vacation Leave', paid: true, unit: 'day', minIncrement: 0.5, requiresDocAfterDays: 3 },
    { id: 'lt2', name: 'Sick Leave', paid: true, unit: 'day', minIncrement: 0.5, requiresDocAfterDays: 1 }
];

export const mockShiftTemplates: ShiftTemplate[] = [
    {
        id: 'st1',
        name: 'Morning Shift',
        startTime: '09:00',
        endTime: '18:00',
        breakMinutes: 60,
        gracePeriodMinutes: 15,
        businessUnitId: 'bu1',
        color: 'blue'
    },
    {
        id: 'st2',
        name: 'Mid Shift',
        startTime: '13:00',
        endTime: '22:00',
        breakMinutes: 60,
        gracePeriodMinutes: 15,
        businessUnitId: 'bu1',
        color: 'yellow'
    },
    {
        id: 'st3',
        name: 'Closing Shift',
        startTime: '17:00',
        endTime: '02:00',
        breakMinutes: 60,
        gracePeriodMinutes: 15,
        businessUnitId: 'bu1',
        color: 'purple'
    },
    {
        id: 'st4',
        name: 'Flexible',
        startTime: '00:00',
        endTime: '00:00',
        breakMinutes: 60,
        gracePeriodMinutes: 0,
        businessUnitId: 'bu1',
        color: 'green',
        isFlexible: true,
        minHoursPerDay: 8,
        minDaysPerWeek: 5
    }
];

// Helper to generate dates relative to today
const today = new Date();
const getDate = (offset: number) => {
    const d = new Date(today);
    d.setDate(today.getDate() + offset);
    d.setHours(0,0,0,0);
    return d;
};

// Generate Assignments for this week (Sunday to Saturday)
const currentDay = today.getDay(); // 0-6
const sundayOffset = -currentDay; 
const weekDates = Array.from({ length: 7 }, (_, i) => getDate(sundayOffset + i));

export const mockShiftAssignments: ShiftAssignment[] = [
    // John Doe - Morning Shift M-F
    ...weekDates.slice(1, 6).map((date, i) => ({
        id: `assign-john-${i}`,
        employeeId: 'TNG-500',
        shiftTemplateId: 'st1',
        date: date,
        locationId: 'site1'
    })),
    // Add a shift for John Doe today to demo context in OT Calendar
    {
        id: `assign-john-today`,
        employeeId: 'TNG-500', // John Doe
        shiftTemplateId: 'st1',
        date: new Date(),
        locationId: 'site1'
    },
];

export const mockTimeEvents: TimeEvent[] = [];

// Populate some time events for the past days in the current week
weekDates.forEach(date => {
    if (date <= today) {
        // John Doe (Morning 9-6)
        if (date.getDay() >= 1 && date.getDay() <= 5) {
            const inTime = new Date(date); inTime.setHours(8, 55, 0);
            const outTime = new Date(date); outTime.setHours(18, 0, 0);
            
            // Skip today's out time if it's earlier than now
            // or make today a partial day
            if (date.toDateString() !== today.toDateString() || today.getHours() > 18) {
                 mockTimeEvents.push({
                    id: `te-john-in-${date.getTime()}`,
                    employeeId: 'TNG-500',
                    timestamp: inTime,
                    type: TimeEventType.ClockIn,
                    source: TimeEventSource.Biometric,
                    locationId: 'site1',
                    extra: { timezone: 'Asia/Manila', app_version: '1.0', ip_hash: 'abc', site_name: 'Main Office', anomaly_tags: [], platform: 'bio', jailbreak_flag: false, emulator_flag: false, deviceId: 'bio-1' }
                });
                mockTimeEvents.push({
                    id: `te-john-out-${date.getTime()}`,
                    employeeId: 'TNG-500',
                    timestamp: outTime,
                    type: TimeEventType.ClockOut,
                    source: TimeEventSource.Biometric,
                    locationId: 'site1',
                    extra: { timezone: 'Asia/Manila', app_version: '1.0', ip_hash: 'abc', site_name: 'Main Office', anomaly_tags: [], platform: 'bio', jailbreak_flag: false, emulator_flag: false, deviceId: 'bio-1' }
                });
            } else if (date.toDateString() === today.toDateString() && today.getHours() >= 9) {
                 // John clocked in today
                 mockTimeEvents.push({
                    id: `te-john-in-${date.getTime()}`,
                    employeeId: 'TNG-500',
                    timestamp: inTime,
                    type: TimeEventType.ClockIn,
                    source: TimeEventSource.Biometric,
                    locationId: 'site1',
                    extra: { timezone: 'Asia/Manila', app_version: '1.0', ip_hash: 'abc', site_name: 'Main Office', anomaly_tags: [], platform: 'bio', jailbreak_flag: false, emulator_flag: false, deviceId: 'bio-1' }
                });
            }
        }
    }
});


export const mockSites: Site[] = [
    {
        id: 'site1',
        name: 'Main Office',
        latitude: 14.5995,
        longitude: 120.9842,
        radiusMeters: 100,
        businessUnitId: 'bu1'
    }
];
export const mockAttendanceRecords: AttendanceRecord[] = [];
export const mockPayslips: PayslipRecord[] = [];
export const mockGovernmentReports: GovernmentReport[] = [
    { id: 'SSS-R1A', name: 'SSS R-1A', description: 'Employment Report', status: 'Not Generated' },
    { id: '13TH-MONTH', name: '13th Month Pay', description: 'Mandatory 13th Month Pay Report', status: 'Not Generated' },
    { id: 'BIR-ALPHALIST', name: 'BIR Alphalist', description: 'Annual Alphalist of Employees', status: 'Not Generated' }
];
export const mockGovernmentReportTemplates: GovernmentReportTemplate[] = [];
export const mockFinalPayRecords: FinalPayRecord[] = [];
export const mockAppSettings: Settings = {
    appName: 'TNG HRIS',
    appLogoUrl: '',
    reminderCadence: 3,
    emailProvider: 'SendGrid',
    smsProvider: 'Twilio',
    pdfHeader: 'The Nines Group',
    pdfFooter: 'Confidential',
    currency: 'PHP'
};
export const mockAuditLogs: AuditLog[] = [];
export const mockPermissions: PermissionsMatrix = {
    [Role.Admin]: {
        'Dashboard': [Permission.View],
        'Employees': [Permission.Manage],
        'Settings': [Permission.Manage],
        'Recruitment': [Permission.Manage],
        'Evaluation': [Permission.Manage],
        'Payroll': [Permission.Manage],
        'Feedback': [Permission.Manage],
        'Helpdesk': [Permission.Manage],
        'Analytics': [Permission.View],
        'Manpower': [Permission.Manage],
        'COE': [Permission.Manage],
        'Benefits': [Permission.Manage],
        'PulseSurvey': [Permission.Manage],
        'Coaching': [Permission.Manage],
        'WFH': [Permission.Manage],
    },
    [Role.Employee]: {
        'Dashboard': [Permission.View],
        'Employees': [Permission.View],
        'PAN': [Permission.View],
        'COE': [Permission.Create, Permission.View],
        'Benefits': [Permission.Create, Permission.View],
        'PulseSurvey': [Permission.View],
        'Coaching': [Permission.View],
        'WFH': [Permission.Create, Permission.View, Permission.Edit],
    },
    // Managers
    [Role.Manager]: {
        'Dashboard': [Permission.View],
        'Employees': [Permission.View],
        'Evaluation': [Permission.View],
        'Payroll': [Permission.View],
        'Manpower': [Permission.View],
        'OT': [Permission.Approve],
        'Leave': [Permission.Approve],
        'Feedback': [Permission.View],
        'Helpdesk': [Permission.View],
        'COE': [Permission.Create, Permission.View],
        'Benefits': [Permission.View],
        'PulseSurvey': [Permission.View],
        'Coaching': [Permission.Create, Permission.View],
        'WFH': [Permission.View],
    },
    // HR Manager
    [Role.HRManager]: {
        'Dashboard': [Permission.View],
        'Employees': [Permission.Manage],
        'PAN': [Permission.Manage],
        'Lifecycle': [Permission.Manage],
        'Assets': [Permission.Manage],
        'AssetRequests': [Permission.Manage],
        'Settings': [Permission.Manage],
        'Recruitment': [Permission.Manage],
        'Evaluation': [Permission.Manage],
        'Payroll': [Permission.Manage],
        'Feedback': [Permission.Manage],
        'Helpdesk': [Permission.Manage],
        'Analytics': [Permission.View],
        'Manpower': [Permission.Manage],
        'COE': [Permission.Manage],
        'Benefits': [Permission.Manage],
        'PulseSurvey': [Permission.Manage],
        'Coaching': [Permission.Manage],
        'WFH': [Permission.View],
    },
    // HR Staff
    [Role.HRStaff]: {
        'Dashboard': [Permission.View],
        'Employees': [Permission.Create, Permission.View, Permission.Edit],
        'PAN': [Permission.Create, Permission.View, Permission.Edit],
        'Lifecycle': [Permission.Create, Permission.View, Permission.Edit],
        'Assets': [Permission.Create, Permission.View, Permission.Edit],
        'AssetRequests': [Permission.Create, Permission.View, Permission.Edit, Permission.Approve],
        'Analytics': [Permission.View],
        'Payroll': [Permission.Create, Permission.View, Permission.Edit],
        'Feedback': [Permission.Create, Permission.View, Permission.Edit],
        'Helpdesk': [Permission.Manage],
        'Manpower': [Permission.Create, Permission.View],
        'COE': [Permission.Manage],
        'Benefits': [Permission.Manage],
        'PulseSurvey': [Permission.Manage],
        'Coaching': [Permission.Create, Permission.View, Permission.Edit],
        'WFH': [Permission.View],
    },
    [Role.BusinessUnitManager]: {
        'Dashboard': [Permission.View],
        'Employees': [Permission.View],
        'Evaluation': [Permission.View],
        'Payroll': [Permission.View],
        'Timekeeping': [Permission.View, Permission.Edit], // Schedule
        'WorkforcePlanning': [Permission.Manage], // Workforce Planning
        'Manpower': [Permission.Create, Permission.View, Permission.Approve],
        'OT': [Permission.View, Permission.Approve],
        'Leave': [Permission.View, Permission.Approve],
        'WFH': [Permission.Create, Permission.View, Permission.Approve],
        'Feedback': [Permission.View],
        'Helpdesk': [Permission.View],
        'COE': [Permission.Create, Permission.View],
        'Benefits': [Permission.View],
        'PulseSurvey': [Permission.View],
        'Coaching': [Permission.Create, Permission.View],
    },
    [Role.OperationsDirector]: {
        'Dashboard': [Permission.View],
        'Employees': [Permission.View],
        'Evaluation': [Permission.View],
        'Payroll': [Permission.View],
        'Feedback': [Permission.View],
        'Manpower': [Permission.Approve],
        'COE': [Permission.Create, Permission.View],
        'Benefits': [Permission.View],
        'PulseSurvey': [Permission.View],
        'Coaching': [Permission.Create, Permission.View],
        'WFH': [Permission.View],
    },
    [Role.BOD]: {
        'Dashboard': [Permission.View],
        'Employees': [Permission.View],
        'Payroll': [Permission.View],
        'Manpower': [Permission.Approve],
        'COE': [Permission.Create, Permission.View],
        'Benefits': [Permission.Approve, Permission.View],
        'PulseSurvey': [Permission.View],
        'Coaching': [Permission.View],
        'WFH': [Permission.Approve, Permission.View],
    },
    [Role.GeneralManager]: {
        'Dashboard': [Permission.View],
        'Employees': [Permission.View],
        'Payroll': [Permission.View],
        'Manpower': [Permission.Approve],
        'COE': [Permission.Create, Permission.View],
        'Benefits': [Permission.View],
        'PulseSurvey': [Permission.View],
        'Coaching': [Permission.View],
        'WFH': [Permission.View],
    },
    [Role.FinanceStaff]: {
         'Dashboard': [Permission.View],
         'Employees': [Permission.View],
         'Payroll': [Permission.Manage],
         'Benefits': [Permission.View],
    },
    [Role.Auditor]: {
        'Dashboard': [Permission.View],
        'AuditLog': [Permission.View],
        'Benefits': [Permission.View],
    },
    [Role.Recruiter]: {
        'Dashboard': [Permission.View],
        'Recruitment': [Permission.Manage],
        'Benefits': [Permission.View],
    },
};
export const mockPipelineStages: PipelineStage[] = [
    { id: 'ir-review', name: 'IR Review' },
    { id: 'nte-for-approval', name: 'NTE Approval' },
    { id: 'nte-sent', name: 'NTE Sent' },
    { id: 'hr-review-response', name: 'HR Review Response' },
    { id: 'bod-gm-approval', name: 'BOD/GM Approval' },
    { id: 'resolution', name: 'Resolution' },
    { id: 'closed', name: 'Closed', isLocked: true },
    { id: 'converted-coaching', name: 'Converted to Coaching', isLocked: true }
];
export const mockAssetRequests: AssetRequest[] = [];
export const mockAssetRepairs: AssetRepair[] = [];
export const mockSSSTable: SSSTableRow[] = [
    { rangeStart: 4250, rangeEnd: 4749.99, regularSS: 202.5, wisp: 0, ec: 10, totalContribution: 650, employeeShare: 202.5, employerShare: 447.5 }
];
export const mockPhilHealthConfig: PhilHealthConfig = {
    minSalary: 10000,
    maxSalary: 80000,
    rate: 0.04,
    employerShareRatio: 0.5
};
export const mockTaxTable: TaxTableRow[] = [
    { level: 1, rangeStart: 0, rangeEnd: 20833, baseTax: 0, rate: 0 },
    { level: 2, rangeStart: 20833, rangeEnd: 33332, baseTax: 0, rate: 0.20 }
];
export const mockHolidayPolicies: HolidayPolicy[] = [
    { type: 'Regular' as any, rate: 1.0, description: 'Regular Holiday' },
    { type: 'Special Non-Working' as any, rate: 0.3, description: 'Special Non-Working Holiday' }
];
export const mockHolidays: Holiday[] = [
    { id: 'h1', name: 'New Year', date: new Date('2025-01-01'), type: 'Regular' as any, isPaid: true }
];
export const mockInterviews: Interview[] = [];
export const mockLeaveBalances: LeaveBalance[] = [
    { employeeId: 'TNG-500', leaveTypeId: 'lt1', opening: 5, accrued: 1.25, used: 2, adjusted: 0 },
    { employeeId: 'TNG-500', leaveTypeId: 'lt2', opening: 5, accrued: 1.25, used: 1, adjusted: 0 },
];

// Mock Leave Ledger
export const mockLeaveLedger: LeaveLedgerEntry[] = [
    // Seed Data for John Doe
    {
        id: 'ledger-init-1',
        employeeId: 'TNG-500', 
        leaveTypeId: 'lt1', // Vacation
        date: new Date('2024-01-01'),
        type: LeaveLedgerEntryType.Accrual,
        change: 5, // Opening balance
        balanceAfter: 5,
        notes: 'Opening Balance 2024'
    },
    {
        id: 'ledger-init-2',
        employeeId: 'TNG-500', 
        leaveTypeId: 'lt2', // Sick
        date: new Date('2024-01-01'),
        type: LeaveLedgerEntryType.Accrual,
        change: 5, // Opening balance
        balanceAfter: 5,
        notes: 'Opening Balance 2024'
    },
    // Seed Data for Board Member (u_bod)
    {
        id: 'ledger-init-3',
        employeeId: 'u_bod', 
        leaveTypeId: 'lt1', // Vacation
        date: new Date('2024-01-01'),
        type: LeaveLedgerEntryType.Accrual,
        change: 5, 
        balanceAfter: 5,
        notes: 'Opening Balance 2024'
    }
];

export const mockLeavePolicies: LeavePolicy[] = [
    { 
        id: 'lp1', 
        leaveTypeId: 'lt1', 
        accrualRule: 'monthly', 
        accrualRate: 5, 
        tiers: [
            { minYears: 0, maxYears: null, entitlement: 5 }
        ],
        carryOverCap: 5, 
        allowNegative: false 
    },
    { 
        id: 'lp2', 
        leaveTypeId: 'lt2', 
        accrualRule: 'monthly', 
        accrualRate: 5, 
        tiers: [
            { minYears: 0, maxYears: null, entitlement: 5 }
        ],
        carryOverCap: 0, 
        allowNegative: false 
    }
];

export const mockCOETemplates: COETemplate[] = [
    {
        id: 'coe-tpl-1',
        businessUnitId: 'bu1', // The Fun Roof
        address: '123 Fun Street, Manila',
        body: '<p>This is to certify that <strong>{{employee_name}}</strong> has been employed with us since {{date_hired}}.</p>',
        signatoryName: 'Helen HR',
        signatoryPosition: 'HR Manager',
        isActive: true
    },
     {
        id: 'coe-tpl-2',
        businessUnitId: 'bu6', // Bakebe SM Aura
        address: 'SM Aura Premier, Taguig',
        body: '<p>This is to certify that <strong>{{employee_name}}</strong> is an employee of Bakebe...</p>',
        signatoryName: 'Laner Orque',
        signatoryPosition: 'Bakebe Manager',
        isActive: true
    },
    {
        id: 'coe-tpl-3',
        businessUnitId: 'bu5', // Corporate HQ
        address: 'Corporate Center, Makati',
        body: '<p>This is to certify that <strong>{{employee_name}}</strong> is employed at TNG HQ...</p>',
        signatoryName: 'Kay',
        signatoryPosition: 'Owner',
        isActive: true
    }
];

export const mockCOERequests: COERequest[] = [
     {
        id: 'coe-req-1',
        employeeId: 'TNG-500', // Sassy
        employeeName: 'Sassy Latosa',
        businessUnitId: 'bu6', // Fixed to match employee BU
        purpose: COEPurpose.Travel,
        dateRequested: new Date('2023-10-25'),
        status: COERequestStatus.Pending
    },
     {
        id: 'coe-req-2',
        employeeId: '0', // Kay
        employeeName: 'Kay',
        businessUnitId: 'bu5', // HQ
        purpose: COEPurpose.LoanApplication,
        dateRequested: new Date('2023-11-25'),
        status: COERequestStatus.Pending
    }
];

export const mockPulseSurveys: PulseSurvey[] = [
    {
        id: 'survey-q1-2025',
        title: 'Q1 2025 Employee Engagement Survey',
        description: 'We want to hear from you! Help us improve our workplace.',
        startDate: new Date('2025-03-01'),
        endDate: new Date('2025-03-15'),
        status: PulseSurveyStatus.Active,
        isAnonymous: true,
        createdByUserId: 'u_hr',
        createdAt: new Date('2025-02-25'),
        sections: [
            {
                id: 'sec-1',
                title: 'Work Environment',
                questions: [
                    { id: 'q-1-1', text: 'I feel physically safe in my workplace.', type: 'rating' },
                    { id: 'q-1-2', text: 'My work environment is clean and comfortable.', type: 'rating' },
                    { id: 'q-1-3', text: 'I have the tools and resources I need to do my job effectively.', type: 'rating' }
                ]
            },
            {
                id: 'sec-2',
                title: 'Leadership & Management',
                questions: [
                    { id: 'q-2-1', text: 'My manager provides clear direction and expectations.', type: 'rating' },
                    { id: 'q-2-2', text: 'My manager recognizes and appreciates good work.', type: 'rating' },
                    { id: 'q-2-3', text: 'Leadership communicates important information in a timely and transparent way.', type: 'rating' },
                    { id: 'q-2-4', text: 'I trust the leadership team to make good decisions.', type: 'rating' }
                ]
            },
            {
                id: 'sec-3',
                title: 'Team & Collaboration',
                questions: [
                    { id: 'q-3-1', text: 'I feel respected by my colleagues.', type: 'rating' },
                    { id: 'q-3-2', text: 'My team works well together to achieve goals.', type: 'rating' },
                    { id: 'q-3-3', text: 'There is open communication within my team.', type: 'rating' }
                ]
            },
            {
                id: 'sec-4',
                title: 'Growth & Development',
                questions: [
                    { id: 'q-4-1', text: 'I have opportunities to learn new skills.', type: 'rating' },
                    { id: 'q-4-2', text: 'I receive useful feedback to improve my performance.', type: 'rating' },
                    { id: 'q-4-3', text: 'There are career growth opportunities for me in this organization.', type: 'rating' }
                ]
            },
            {
                id: 'sec-5',
                title: 'Compensation & Benefits',
                questions: [
                    { id: 'q-5-1', text: 'I am fairly compensated for my work.', type: 'rating' },
                    { id: 'q-5-2', text: 'Our benefits package meets my needs.', type: 'rating' },
                    { id: 'q-5-3', text: 'I understand how my performance is linked to rewards.', type: 'rating' }
                ]
            }
        ]
    }
];

export const mockSurveyResponses: SurveyResponse[] = [
    // Generate some dummy responses for the heatmap demo
    {
        id: 'resp-1',
        surveyId: 'survey-q1-2025',
        respondentId: 'TNG-013', // Operations
        submittedAt: new Date(),
        answers: [
            { questionId: 'q-1-1', value: 4 }, { questionId: 'q-1-2', value: 3 }, { questionId: 'q-1-3', value: 4 },
            { questionId: 'q-2-1', value: 5 }, { questionId: 'q-2-2', value: 4 }, { questionId: 'q-2-3', value: 3 }, { questionId: 'q-2-4', value: 4 },
            { questionId: 'q-3-1', value: 5 }, { questionId: 'q-3-2', value: 5 }, { questionId: 'q-3-3', value: 4 },
            { questionId: 'q-4-1', value: 2 }, { questionId: 'q-4-2', value: 3 }, { questionId: 'q-4-3', value: 2 },
            { questionId: 'q-5-1', value: 3 }, { questionId: 'q-5-2', value: 4 }, { questionId: 'q-5-3', value: 3 }
        ],
        comments: 'Overall good, but need more training opportunities.'
    },
    {
        id: 'resp-2',
        surveyId: 'survey-q1-2025',
        respondentId: 'TNG-150', // Operations
        submittedAt: new Date(),
        answers: [
            { questionId: 'q-1-1', value: 5 }, { questionId: 'q-1-2', value: 4 }, { questionId: 'q-1-3', value: 5 },
            { questionId: 'q-2-1', value: 4 }, { questionId: 'q-2-2', value: 3 }, { questionId: 'q-2-3', value: 4 }, { questionId: 'q-2-4', value: 5 },
            { questionId: 'q-3-1', value: 4 }, { questionId: 'q-3-2', value: 4 }, { questionId: 'q-3-3', value: 5 },
            { questionId: 'q-4-1', value: 3 }, { questionId: 'q-4-2', value: 3 }, { questionId: 'q-4-3', value: 3 },
            { questionId: 'q-5-1', value: 4 }, { questionId: 'q-5-2', value: 4 }, { questionId: 'q-5-3', value: 4 }
        ],
        comments: 'Happy with the team.'
    },
    {
        id: 'resp-3',
        surveyId: 'survey-q1-2025',
        respondentId: 'TNG-516', // Marketing
        submittedAt: new Date(),
        answers: [
            { questionId: 'q-1-1', value: 5 }, { questionId: 'q-1-2', value: 5 }, { questionId: 'q-1-3', value: 5 },
            { questionId: 'q-2-1', value: 2 }, { questionId: 'q-2-2', value: 2 }, { questionId: 'q-2-3', value: 1 }, { questionId: 'q-2-4', value: 2 },
            { questionId: 'q-3-1', value: 3 }, { questionId: 'q-3-2', value: 2 }, { questionId: 'q-3-3', value: 3 },
            { questionId: 'q-4-1', value: 5 }, { questionId: 'q-4-2', value: 5 }, { questionId: 'q-4-3', value: 5 },
            { questionId: 'q-5-1', value: 2 }, { questionId: 'q-5-2', value: 3 }, { questionId: 'q-5-3', value: 2 }
        ],
        comments: 'Leadership needs to communicate better.'
    },
     {
        id: 'resp-4',
        surveyId: 'survey-q1-2025',
        respondentId: 'TNG-242', // Finance
        submittedAt: new Date(),
        answers: [
            { questionId: 'q-1-1', value: 4 }, { questionId: 'q-1-2', value: 4 }, { questionId: 'q-1-3', value: 4 },
            { questionId: 'q-2-1', value: 4 }, { questionId: 'q-2-2', value: 4 }, { questionId: 'q-2-3', value: 4 }, { questionId: 'q-2-4', value: 4 },
            { questionId: 'q-3-1', value: 4 }, { questionId: 'q-3-2', value: 4 }, { questionId: 'q-3-3', value: 4 },
            { questionId: 'q-4-1', value: 4 }, { questionId: 'q-4-2', value: 4 }, { questionId: 'q-4-3', value: 4 },
            { questionId: 'q-5-1', value: 4 }, { questionId: 'q-5-2', value: 4 }, { questionId: 'q-5-3', value: 4 }
        ],
        comments: 'No issues.'
    }
];

export const mockCoachingSessions: CoachingSession[] = [
    {
        id: 'CS-101',
        employeeId: 'TNG-013', // Ernesto
        employeeName: 'Ernesto Sinamban',
        coachId: 'TNG-457', // Laner
        coachName: 'Laner Orque',
        trigger: CoachingTrigger.Performance,
        context: 'Output consistency has dropped in the last week.',
        date: new Date('2023-10-25'),
        status: CoachingStatus.Scheduled
    },
    {
        id: 'CS-102',
        employeeId: 'TNG-500', // Sassy
        employeeName: 'Sassy Latosa',
        coachId: 'u_hr', // Helen HR
        coachName: 'Helen HR',
        trigger: CoachingTrigger.CareerDevelopment,
        context: 'Discussing potential promotion path to Senior Baker.',
        date: new Date('2023-10-20'),
        status: CoachingStatus.Completed,
        actionPlan: 'Complete advanced pastry course by Q4.'
    },
    // Added for Analytics & Impact Phase
    {
        id: 'CS-103',
        employeeId: 'TNG-500', // Sassy
        employeeName: 'Sassy Latosa',
        coachId: 'TNG-457', // Laner
        coachName: 'Laner Orque',
        trigger: CoachingTrigger.Attendance,
        context: 'Late arrival on Monday.',
        date: new Date('2023-09-15'),
        status: CoachingStatus.Completed,
        actionPlan: 'Adjust commute time.',
        rootCause: 'Traffic',
        followUpDate: new Date('2023-09-30')
    },
    {
        id: 'CS-104',
        employeeId: 'TNG-500', // Sassy
        employeeName: 'Sassy Latosa',
        coachId: 'TNG-457', // Laner
        coachName: 'Laner Orque',
        trigger: CoachingTrigger.Attendance,
        context: 'Late arrival on Wednesday.',
        date: new Date('2023-10-01'),
        status: CoachingStatus.Completed,
        actionPlan: 'Set earlier alarm.',
        rootCause: 'Overslept',
        followUpDate: new Date('2023-10-15')
    }
];
