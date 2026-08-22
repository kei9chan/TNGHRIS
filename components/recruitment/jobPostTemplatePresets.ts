import { JobPostIconDetail, JobPostVisualTemplate } from '../../types';

export interface JobPostTemplateSection {
  id: string;
  title: string;
  content: string;
}

export interface JobPostTemplateMetadata {
  templateKey?: string;
  businessUnit?: string;
  status?: 'Draft' | 'Published' | string;
  isStarter?: boolean;
  ctaLink?: string;
  sections?: JobPostTemplateSection[];
  brandWordmark?: string;
  persisted?: boolean;
}

export type JobPostTemplateRecord = JobPostVisualTemplate & JobPostTemplateMetadata;

const detail = (icon: string, label: string): JobPostIconDetail => ({ icon, label });
const section = (id: string, title: string, bullets: string[]): JobPostTemplateSection => ({
  id,
  title,
  content: bullets.join('\n'),
});

const commonSchedule = 'Shifting schedule, including weekends and holidays';

export const DEMO_TEMPLATE_KEY = 'demo-dessert-museum-guest-experience-associate';

export const JOB_POST_TEMPLATE_PRESETS: JobPostTemplateRecord[] = [
  {
    id: `preset-${DEMO_TEMPLATE_KEY}`,
    templateKey: DEMO_TEMPLATE_KEY,
    name: '[DEMO] Guest Experience Associate — The Dessert Museum',
    businessUnit: 'The Dessert Museum',
    status: 'Draft',
    isStarter: false,
    brandWordmark: 'THE DESSERT MUSEUM',
    updatedAt: new Date(0),
    createdBy: 'System',
    backgroundColor: '#FDE7EF',
    cardColor: '#FFFFFF',
    textColor: '#5A1230',
    accentColor: '#F2254F',
    backgroundImage: '',
    logoImage: '',
    headline: 'MAKE WORK SWEETER.',
    jobTitle: 'Guest Experience Associate',
    description: 'Help guests explore playful spaces, celebrate special moments, and create unforgettable memories at The Dessert Museum.',
    details: [
      detail('📍', 'S Maison, Pasay City'),
      detail('◷', 'Full-time'),
      detail('◉', 'On-site'),
      detail('⌁', commonSchedule),
    ],
    sections: [
      section('what-youll-do', "WHAT YOU’LL DO", [
        'Welcome guests and introduce them to the museum experience.',
        'Manage admissions, queues, guest flow, and basic inquiries.',
        'Support birthday parties, private events, and group visits.',
        'Keep experience areas clean, organized, and guest-ready.',
        'Create warm, memorable, and playful moments for every visitor.',
      ]),
      section('were-looking-for', 'WE’RE LOOKING FOR', [
        'A warm, energetic, and customer-focused communicator.',
        'Previous hospitality, retail, events, attractions, or customer-service experience is an advantage.',
        'Someone organized and calm in a fast-paced environment.',
        'Comfortable working weekends, holidays, and shifting schedules.',
        'A reliable team player who enjoys creating memorable experiences.',
      ]),
      section('perks', 'PERKS', [
        'Work in a creative and immersive attraction.',
        'Be part of memorable events and guest experiences.',
        'Receive training and development opportunities.',
        'Join a fun and collaborative team.',
      ]),
    ],
    col1Title: "WHAT YOU’LL DO",
    col1Content: 'Welcome guests and introduce them to the museum experience.\nManage admissions, queues, guest flow, and basic inquiries.\nSupport birthday parties, private events, and group visits.',
    col2Title: 'WE’RE LOOKING FOR',
    col2Content: 'A warm, energetic, and customer-focused communicator.\nSomeone organized and calm in a fast-paced environment.\nA reliable team player who enjoys creating memorable experiences.',
    contactTitle: 'READY TO MAKE WORK SWEETER?',
    email1: 'recruitment@thenextperience.com',
    email2: 'hr@thenextperience.com',
    subjectLine: 'Application — Guest Experience Associate — The Dessert Museum',
    buttonText: 'APPLY NOW',
    ctaLink: '/careers',
  },
  {
    id: 'preset-dessert-museum-guest-experience-associate',
    templateKey: 'dessert-museum-guest-experience-associate',
    name: 'The Dessert Museum — Guest Experience Associate',
    businessUnit: 'The Dessert Museum',
    status: 'Draft',
    isStarter: true,
    brandWordmark: 'THE DESSERT MUSEUM',
    updatedAt: new Date(0),
    createdBy: 'System',
    backgroundColor: '#FDE7EF',
    cardColor: '#FFFFFF',
    textColor: '#5A1230',
    accentColor: '#F2254F',
    backgroundImage: '',
    logoImage: '',
    headline: 'MAKE WORK SWEETER.',
    jobTitle: 'Guest Experience Associate',
    description: 'Help guests explore colorful immersive rooms, celebrate special moments, and create unforgettable memories in Manila’s sweetest attraction.',
    details: [
      detail('📍', 'S Maison, Pasay City'),
      detail('◷', 'Full-time'),
      detail('◉', 'On-site'),
      detail('⌁', commonSchedule),
    ],
    sections: [
      section('what-youll-do', "WHAT YOU’LL DO", [
        'Welcome guests and introduce them to the museum experience.',
        'Manage admissions, queues, guest flow, and basic inquiries.',
        'Support birthday parties, private events, and group visits.',
        'Keep experience areas clean, organized, and guest-ready.',
        'Create warm, memorable, and playful moments for every visitor.',
      ]),
      section('were-looking-for', 'WE’RE LOOKING FOR', [
        'A warm, energetic, and customer-focused communicator.',
        'Previous hospitality, retail, events, attractions, or customer-service experience is an advantage.',
        'Someone organized and calm in a fast-paced environment.',
        'Comfortable working weekends, holidays, and shifting schedules.',
        'A reliable team player who enjoys creating memorable experiences.',
      ]),
      section('perks', 'PERKS', [
        'Work in a creative and immersive attraction.',
        'Be part of memorable events and guest experiences.',
        'Receive training and development opportunities.',
        'Join a fun and collaborative team.',
      ]),
    ],
    col1Title: "WHAT YOU’LL DO",
    col1Content: 'Welcome guests and introduce them to the museum experience.\nManage admissions, queues, guest flow, and basic inquiries.\nSupport birthday parties, private events, and group visits.',
    col2Title: 'WE’RE LOOKING FOR',
    col2Content: 'A warm, energetic, and customer-focused communicator.\nSomeone organized and calm in a fast-paced environment.\nA reliable team player who enjoys creating memorable experiences.',
    contactTitle: 'READY TO MAKE WORK SWEETER?',
    email1: 'recruitment@thenextperience.com',
    email2: 'hr@thenextperience.com',
    subjectLine: 'Application — Guest Experience Associate — The Dessert Museum',
    buttonText: 'APPLY NOW',
    ctaLink: '/careers',
  },
  {
    id: 'preset-gootopia-experience-facilitator',
    templateKey: 'gootopia-experience-facilitator',
    name: 'Gootopia — Experience Facilitator',
    businessUnit: 'Gootopia',
    status: 'Draft',
    isStarter: true,
    brandWordmark: 'GOOTOPIA',
    updatedAt: new Date(0),
    createdBy: 'System',
    backgroundColor: '#F3EDFF',
    cardColor: '#FFFFFF',
    textColor: '#2B155F',
    accentColor: '#7134B9',
    backgroundImage: '',
    logoImage: '',
    headline: 'ENTER A WEIRD AND WONDERFUL WORKPLACE.',
    jobTitle: 'Experience Facilitator',
    description: 'Guide guests through playful slime experiences, quirky challenges, and colorful hands-on activities in Gootopia’s weird and wonderful world.',
    details: [
      detail('📍', 'Metro Manila'),
      detail('◷', 'Full-time'),
      detail('◉', 'On-site'),
      detail('⌁', commonSchedule),
    ],
    sections: [
      section('what-youll-do', "WHAT YOU’LL DO", [
        'Welcome guests and guide them through the Gootopia experience.',
        'Facilitate slime-making activities and interactive challenges.',
        'Explain safety procedures and keep activity areas organized.',
        'Encourage guests to participate and have fun.',
        'Support parties, events, and group bookings.',
      ]),
      section('were-looking-for', 'WE’RE LOOKING FOR', [
        'Energetic people who enjoy working with guests.',
        'Comfortable leading activities and explaining instructions.',
        'Patient, creative, and enthusiastic.',
        'Comfortable working weekends and holidays.',
        'Events, education, hospitality, or attraction experience is an advantage.',
      ]),
      section('perks', 'PERKS', [
        'Work in a colorful and creative attraction.',
        'Make every guest interaction fun and memorable.',
        'Gain experience in events and guest facilitation.',
        'Join a playful and collaborative team.',
      ]),
    ],
    col1Title: "WHAT YOU’LL DO",
    col1Content: 'Welcome guests and guide them through the Gootopia experience.\nFacilitate slime-making activities and interactive challenges.\nExplain safety procedures and keep activity areas organized.',
    col2Title: 'WE’RE LOOKING FOR',
    col2Content: 'Energetic people who enjoy working with guests.\nComfortable leading activities and explaining instructions.\nPatient, creative, and enthusiastic.',
    contactTitle: 'READY TO JOIN GOOTOPIA?',
    email1: 'recruitment@thenextperience.com',
    email2: 'hr@thenextperience.com',
    subjectLine: 'Application — Experience Facilitator — Gootopia',
    buttonText: 'APPLY NOW',
    ctaLink: '/careers',
  },
  {
    id: 'preset-bakebe-baking-studio-host',
    templateKey: 'bakebe-baking-studio-host',
    name: 'Bakebe — Baking Studio Host',
    businessUnit: 'Bakebe',
    status: 'Draft',
    isStarter: true,
    brandWordmark: 'BAKEBE',
    updatedAt: new Date(0),
    createdBy: 'System',
    backgroundColor: '#FFF6EF',
    cardColor: '#FFFFFF',
    textColor: '#4A2A21',
    accentColor: '#BB5A36',
    backgroundImage: '',
    logoImage: '',
    headline: 'BAKE IT. MAKE IT. MAKE IT YOURS.',
    jobTitle: 'Baking Studio Host',
    description: 'Help guests enjoy creative baking sessions by guiding them through recipes, tools, ingredients, and memorable hands-on experiences.',
    details: [
      detail('📍', 'S Maison / SM Aura'),
      detail('◷', 'Full-time'),
      detail('◉', 'On-site'),
      detail('⌁', commonSchedule),
    ],
    sections: [
      section('what-youll-do', "WHAT YOU’LL DO", [
        'Welcome guests and prepare them for their baking session.',
        'Explain recipes, ingredients, tools, and studio procedures.',
        'Assist guests while they bake, decorate, and create.',
        'Keep workstations clean, organized, and ready.',
        'Support birthdays, group bookings, and events.',
      ]),
      section('were-looking-for', 'WE’RE LOOKING FOR', [
        'Friendly, patient, and service-oriented individuals.',
        'Comfortable explaining instructions and assisting guests.',
        'Interest in baking, workshops, food, or creative activities.',
        'Organized and detail-oriented.',
        'Comfortable working weekends and holidays.',
      ]),
      section('perks', 'PERKS', [
        'Work in a creative baking studio.',
        'Learn and share hands-on baking experiences.',
        'Be part of memorable celebrations and events.',
        'Join a warm and collaborative team.',
      ]),
    ],
    col1Title: "WHAT YOU’LL DO",
    col1Content: 'Welcome guests and prepare them for their baking session.\nExplain recipes, ingredients, tools, and studio procedures.\nAssist guests while they bake, decorate, and create.',
    col2Title: 'WE’RE LOOKING FOR',
    col2Content: 'Friendly, patient, and service-oriented individuals.\nComfortable explaining instructions and assisting guests.\nOrganized and detail-oriented.',
    contactTitle: 'READY TO BAKE WITH US?',
    email1: 'recruitment@thenextperience.com',
    email2: 'hr@thenextperience.com',
    subjectLine: 'Application — Baking Studio Host — Bakebe',
    buttonText: 'APPLY NOW',
    ctaLink: '/careers',
  },
  {
    id: 'preset-inflatable-island-guest-experience-safety-associate',
    templateKey: 'inflatable-island-guest-experience-safety-associate',
    name: 'Inflatable Island — Guest Experience & Safety Associate',
    businessUnit: 'Inflatable Island',
    status: 'Draft',
    isStarter: true,
    brandWordmark: 'INFLATABLE ISLAND',
    updatedAt: new Date(0),
    createdBy: 'System',
    backgroundColor: '#EFFBFC',
    cardColor: '#FFFFFF',
    textColor: '#124D54',
    accentColor: '#0D9CAD',
    backgroundImage: '',
    logoImage: '',
    headline: 'BRING THE FUN TO THE WATER.',
    jobTitle: 'Guest Experience & Safety Associate',
    description: 'Help guests enjoy a safe, exciting, and unforgettable day of floating challenges, beach-club activities, and outdoor adventure in Subic.',
    details: [
      detail('📍', 'Subic, Zambales'),
      detail('◷', 'Full-time'),
      detail('◉', 'On-site'),
      detail('⌁', commonSchedule),
    ],
    sections: [
      section('what-youll-do', "WHAT YOU’LL DO", [
        'Welcome guests and explain day-pass and attraction procedures.',
        'Assist with check-in, activity areas, and guest inquiries.',
        'Monitor guest safety and follow operating procedures.',
        'Keep activity areas clean, organized, and guest-ready.',
        'Support group bookings, events, and peak operating days.',
      ]),
      section('were-looking-for', 'WE’RE LOOKING FOR', [
        'Physically active, alert, and safety-minded individuals.',
        'Comfortable working outdoors and around water.',
        'Friendly and confident when communicating with guests.',
        'Able to remain calm and attentive in busy environments.',
        'Comfortable working weekends, holidays, and peak seasons.',
      ]),
      section('perks', 'PERKS', [
        'Work in a unique outdoor water attraction.',
        'Be part of exciting guest adventures and events.',
        'Gain experience in operations, safety, and guest experience.',
        'Join an energetic and supportive team.',
      ]),
    ],
    col1Title: "WHAT YOU’LL DO",
    col1Content: 'Welcome guests and explain day-pass and attraction procedures.\nAssist with check-in, activity areas, and guest inquiries.\nMonitor guest safety and follow operating procedures.',
    col2Title: 'WE’RE LOOKING FOR',
    col2Content: 'Physically active, alert, and safety-minded individuals.\nComfortable working outdoors and around water.\nFriendly and confident when communicating with guests.',
    contactTitle: 'READY FOR THE NEXT ADVENTURE?',
    email1: 'recruitment@thenextperience.com',
    email2: 'hr@thenextperience.com',
    subjectLine: 'Application — Guest Experience & Safety Associate — Inflatable Island',
    buttonText: 'APPLY NOW',
    ctaLink: '/careers',
  },
  {
    id: 'preset-the-fun-roof-guest-experience-reservations-host',
    templateKey: 'the-fun-roof-guest-experience-reservations-host',
    name: 'The Fun Roof — Guest Experience & Reservations Host',
    businessUnit: 'The Fun Roof',
    status: 'Draft',
    isStarter: true,
    brandWordmark: 'THE FUN ROOF',
    updatedAt: new Date(0),
    createdBy: 'System',
    backgroundColor: '#0B0910',
    cardColor: '#17121D',
    textColor: '#FFF4FA',
    accentColor: '#FF25A8',
    backgroundImage: '',
    logoImage: '',
    headline: 'MAKE NIGHTS WORTH REMEMBERING.',
    jobTitle: 'Guest Experience & Reservations Host',
    description: 'Help guests enjoy rooftop games, themed cabanas, bold drinks, events, and unforgettable nights above Makati.',
    details: [
      detail('📍', 'Makati'),
      detail('◷', 'Full-time'),
      detail('◉', 'On-site'),
      detail('⌁', 'Evening, weekend, and holiday shifts'),
    ],
    sections: [
      section('what-youll-do', "WHAT YOU’LL DO", [
        'Welcome guests and create an energetic rooftop experience.',
        'Handle reservations, table inquiries, and guest requests.',
        'Assist with events, group packages, cabanas, and special occasions.',
        'Coordinate with service and operations teams.',
        'Help maintain a fun, organized, and guest-ready venue.',
      ]),
      section('were-looking-for', 'WE’RE LOOKING FOR', [
        'Outgoing, confident, and service-oriented individuals.',
        'Strong communication and people skills.',
        'Comfortable working in a fast-paced nightlife environment.',
        'Organized and attentive to reservation details.',
        'Comfortable working evenings, weekends, and holidays.',
      ]),
      section('perks', 'PERKS', [
        'Work in a vibrant rooftop entertainment venue.',
        'Gain experience in hospitality, reservations, and events.',
        'Be part of memorable celebrations and nightlife experiences.',
        'Join a fun, high-energy team.',
      ]),
    ],
    col1Title: "WHAT YOU’LL DO",
    col1Content: 'Welcome guests and create an energetic rooftop experience.\nHandle reservations, table inquiries, and guest requests.\nAssist with events, group packages, cabanas, and special occasions.',
    col2Title: 'WE’RE LOOKING FOR',
    col2Content: 'Outgoing, confident, and service-oriented individuals.\nStrong communication and people skills.\nComfortable working in a fast-paced nightlife environment.',
    contactTitle: 'READY TO MAKE NIGHTS WORTH REMEMBERING?',
    email1: 'recruitment@thenextperience.com',
    email2: 'hr@thenextperience.com',
    subjectLine: 'Application — Guest Experience & Reservations Host — The Fun Roof',
    buttonText: 'APPLY NOW',
    ctaLink: '/careers',
  },
];

export const DEFAULT_JOB_POST_TEMPLATE = JOB_POST_TEMPLATE_PRESETS[0];

export const isTemplatePlaceholder = (value?: string | null): boolean => {
  return Boolean(value && /\[(?:TEXT_PLACEHOLDER|LOGO_PLACEHOLDER|BUTTON_TEXT|BACKGROUND_IMAGE)/i.test(value));
};

export const cleanTemplateText = (value?: string | null): string => {
  const text = (value || '').trim();
  return isTemplatePlaceholder(text) ? '' : text;
};

export const cloneTemplate = (template: JobPostTemplateRecord): JobPostTemplateRecord => ({
  ...template,
  details: (template.details || []).map(item => ({ ...item })),
  sections: (template.sections || []).map(item => ({ ...item })),
  updatedAt: new Date(template.updatedAt),
});
