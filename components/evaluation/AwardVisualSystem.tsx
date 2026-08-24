import React from 'react';
import { AwardDesign } from '../../types';

export type AwardBadgeDefinition = {
  key: string;
  title: string;
  description: string;
  color: string;
};

export type AwardBrandTheme = {
  key: string;
  name: string;
  wordmark: string;
  presetTitle: string;
  primary: string;
  accent: string;
  background: string;
  text: string;
  badgeKey: string;
};

export const STANDARD_AWARD_BADGES: AwardBadgeDefinition[] = [
  { key: 'guest-experience-star', title: 'Guest Experience Star', description: 'Creates moments guests will never forget.', color: '#e11d48' },
  { key: 'customer-delight-champion', title: 'Customer Delight Champion', description: 'Turns every interaction into delight.', color: '#7c3aed' },
  { key: 'team-player-award', title: 'Team Player Award', description: 'Collaborates, supports, and lifts the team.', color: '#4f46e5' },
  { key: 'above-and-beyond', title: 'Above & Beyond', description: 'Goes the extra mile without being asked.', color: '#ea580c' },
  { key: 'service-excellence', title: 'Service Excellence', description: 'Delivers outstanding service, every time.', color: '#0891b2' },
  { key: 'problem-solver', title: 'Problem Solver', description: 'Finds solutions and makes things better.', color: '#0f766e' },
  { key: 'safety-champion', title: 'Safety Champion', description: 'Puts safety first, every single day.', color: '#dc2626' },
  { key: 'reliability-consistency', title: 'Reliability & Consistency', description: 'Dependable, consistent, and always delivers.', color: '#92400e' },
  { key: 'sales-spark', title: 'Sales Spark', description: 'Drives results and creates opportunities.', color: '#0e7490' },
  { key: 'culture-builder', title: 'Culture Builder', description: 'Builds a positive culture where people thrive.', color: '#db2777' },
];

export const AWARD_BRAND_THEMES: AwardBrandTheme[] = [
  {
    key: 'dessert-museum', name: 'Dessert Museum', wordmark: 'THE DESSERT\nMUSEUM', presetTitle: 'Sweet Service Star',
    primary: '#9f1239', accent: '#f43f5e', background: '#fff9f5', text: '#4c0519', badgeKey: 'guest-experience-star',
  },
  {
    key: 'gootopia', name: 'Gootopia', wordmark: 'GOOTOPIA', presetTitle: 'Gootopia Good Vibes',
    primary: '#5b21b6', accent: '#22d3ee', background: '#faf7ff', text: '#312e81', badgeKey: 'customer-delight-champion',
  },
  {
    key: 'bakebe', name: 'Bakebe', wordmark: 'BAKEBE', presetTitle: 'Bakebe Baking Brilliance',
    primary: '#9a3412', accent: '#ea580c', background: '#fffaf2', text: '#431407', badgeKey: 'service-excellence',
  },
  {
    key: 'inflatable-island', name: 'Inflatable Island', wordmark: 'INFLATABLE\nISLAND', presetTitle: 'Inflatable Island Wave Maker',
    primary: '#0f766e', accent: '#fb7185', background: '#effcfc', text: '#134e4a', badgeKey: 'above-and-beyond',
  },
  {
    key: 'fun-roof', name: 'Fun Roof', wordmark: 'FUN\nROOF', presetTitle: 'Fun Roof Rooftop All-Star',
    primary: '#111318', accent: '#ff2d9a', background: '#111318', text: '#ffffff', badgeKey: 'guest-experience-star',
  },
];

const normalizeBusinessUnitName = (name?: string) => (name || '').toLowerCase().replace(/^the\s+/, '').replace(/[^a-z0-9]+/g, ' ').trim();

export const getAwardBrandTheme = (businessUnitName?: string): AwardBrandTheme => {
  const normalized = normalizeBusinessUnitName(businessUnitName);
  const match = normalized ? AWARD_BRAND_THEMES.find(theme => {
    const themeName = normalizeBusinessUnitName(theme.name);
    return normalized === themeName || normalized.includes(themeName) || themeName.includes(normalized);
  }) : undefined;
  return match || {
    key: 'company', name: businessUnitName || 'Company-wide', wordmark: businessUnitName || 'TNG HRIS', presetTitle: 'Company Recognition',
    primary: '#3730a3', accent: '#6366f1', background: '#ffffff', text: '#111827', badgeKey: 'guest-experience-star',
  };
};

export const createModernAwardDesign = (businessUnitName?: string, awardTitle?: string): AwardDesign => {
  const theme = getAwardBrandTheme(businessUnitName);
  return {
    backgroundColor: theme.background,
    backgroundImageUrl: '',
    borderWidth: 0,
    borderColor: theme.primary,
    fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif',
    titleColor: theme.text,
    textColor: theme.text,
    headerText: awardTitle || theme.presetTitle,
    bodyText: 'For {{award_reason}}',
    signatories: [{ name: 'Authorized Signatory', title: 'Management' }],
    logoUrl: '',
    accentColor: theme.accent,
    secondaryAccentColor: theme.primary,
    orientation: 'portrait',
    badgeStyle: 'outline',
    badgeKey: theme.badgeKey,
    layoutVersion: 'modern-v2',
    brandName: theme.name,
    wordmarkText: theme.wordmark,
  };
};

type AwardBadgeIconProps = {
  badgeKey?: string;
  className?: string;
  style?: React.CSSProperties;
};

export const AwardBadgeIcon: React.FC<AwardBadgeIconProps> = ({ badgeKey, className = 'h-6 w-6', style }) => {
  const common = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  const key = badgeKey || 'guest-experience-star';
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className} style={style} {...common}>
      {key === 'customer-delight-champion' && <path d="M20.8 4.7a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.5 1-1a5.5 5.5 0 0 0 0-7.8Z" />}
      {key === 'team-player-award' && <><circle cx="9" cy="8" r="3" /><circle cx="17" cy="9" r="2.2" /><path d="M3.5 20v-1.5A5.5 5.5 0 0 1 9 13h0a5.5 5.5 0 0 1 5.5 5.5V20M14 14.5a4.5 4.5 0 0 1 6.5 4V20" /></>}
      {key === 'above-and-beyond' && <><path d="M4 18 18 4M9 4h9v9" /><path d="M4 12v6h6" /></>}
      {key === 'service-excellence' && <><path d="m12 3 7 3v5c0 4.8-2.9 8-7 10-4.1-2-7-5.2-7-10V6l7-3Z" /><path d="m9 12 2 2 4-5" /></>}
      {key === 'problem-solver' && <><path d="M9 18h6M10 22h4" /><path d="M8.2 14.4A7 7 0 1 1 15.8 14.4C14.7 15.2 14 16.4 14 18h-4c0-1.6-.7-2.8-1.8-3.6Z" /></>}
      {key === 'safety-champion' && <><path d="m12 3 7 3v5c0 4.8-2.9 8-7 10-4.1-2-7-5.2-7-10V6l7-3Z" /><path d="m8.8 12 2.1 2.1 4.4-4.5" /></>}
      {key === 'reliability-consistency' && <><rect x="4" y="5" width="16" height="15" rx="2" /><path d="M8 3v4M16 3v4M4 10h16M8 14h3M8 17h6" /></>}
      {key === 'sales-spark' && <><path d="M4 18V9M10 18v-5M16 18V7M3 21h18" /><path d="m5 8 5-4 4 3 5-4" /></>}
      {key === 'culture-builder' && <><circle cx="12" cy="9" r="2.5" /><circle cx="5.5" cy="11" r="2" /><circle cx="18.5" cy="11" r="2" /><path d="M7.5 20v-1.5A4.5 4.5 0 0 1 12 14h0a4.5 4.5 0 0 1 4.5 4.5V20M2.5 19v-1a3 3 0 0 1 3-3M21.5 19v-1a3 3 0 0 0-3-3" /><path d="M9.5 5.5 12 3l2.5 2.5" /></>}
      {key === 'guest-experience-star' && <path d="m12 3 2.7 5.5 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1-4.4-4.3 6.1-.9L12 3Z" />}
      {!STANDARD_AWARD_BADGES.some(item => item.key === key) && <path d="m12 3 2.7 5.5 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1-4.4-4.3 6.1-.9L12 3Z" />}
    </svg>
  );
};
