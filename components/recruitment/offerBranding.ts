import { OfferAppearance } from '../../types';

export const DEFAULT_APPEARANCE: OfferAppearance = {
  preset: 'TNG',
  headerContent: 'A clear package. No surprises.',
  offerTitle: 'Your Total Opportunity',
  footerContent: 'The Nextperience Recruitment Team',
  primaryColor: '#6D28D9',
  accentColor: '#F59E0B',
  textColor: '#0F172A',
  pageBackgroundColor: '#FFFFFF',
  fontFamily: 'Inter',
  buttonStyle: 'Rounded',
  cardStyle: 'Soft',
  sectionLayout: 'Cards',
};

const PRESETS: Array<{ match: RegExp; values: OfferAppearance }> = [
  { match: /inflatable/i, values: { preset: 'Inflatable Island', primaryColor: '#009C9C', accentColor: '#FF6B6B', textColor: '#0D1B2A', pageBackgroundColor: '#F5FFFF', headerContent: 'Your next adventure starts here.' } },
  { match: /dessert/i, values: { preset: 'The Dessert Museum', primaryColor: '#8F234C', accentColor: '#FF72A8', textColor: '#3A1726', pageBackgroundColor: '#FFF7FA', headerContent: 'A sweet new chapter starts here.' } },
  { match: /gootopia/i, values: { preset: 'Gootopia', primaryColor: '#6D28D9', accentColor: '#A78BFA', textColor: '#251447', pageBackgroundColor: '#FAF7FF', headerContent: 'Build, play, and grow with us.' } },
  { match: /bakebe/i, values: { preset: 'Bakebe', primaryColor: '#7A3E2C', accentColor: '#D97757', textColor: '#332018', pageBackgroundColor: '#FFF9EF', headerContent: 'Create something wonderful with us.' } },
  { match: /fun roof/i, values: { preset: 'The Fun Roof', primaryColor: '#171117', accentColor: '#F00083', textColor: '#211827', pageBackgroundColor: '#FFF7FC', headerContent: 'Take your career to the roof.' } },
];

export const appearanceForBusinessUnit = (businessUnit?: string): OfferAppearance => ({
  ...DEFAULT_APPEARANCE,
  ...(PRESETS.find(item => item.match.test(businessUnit || ''))?.values || {}),
});

export const mergeAppearance = (businessUnit?: string, appearance?: OfferAppearance): OfferAppearance => ({
  ...appearanceForBusinessUnit(businessUnit),
  ...(appearance || {}),
});

