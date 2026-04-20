import React, { createContext, useState, ReactNode, useContext, useCallback } from 'react';
import { Settings } from '../types';

const defaultAppSettings: Settings = {
  appName: 'TNG HRIS',
  appLogoUrl: '',
  reminderCadence: 3,
  emailProvider: 'SendGrid',
  smsProvider: 'Twilio',
  pdfHeader: 'The Nines Group',
  pdfFooter: 'Confidential',
  currency: 'PHP'
};

interface SettingsContextType {
  settings: Settings;
  updateSettings: (newSettings: Partial<Settings>) => void;
  isRbacEnabled: boolean;
  setIsRbacEnabled: React.Dispatch<React.SetStateAction<boolean>>;
}

export const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

export const SettingsProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [settings, setSettings] = useState<Settings>(defaultAppSettings);
  const [isRbacEnabled, setIsRbacEnabled] = useState(true);

  const updateSettings = useCallback((newSettings: Partial<Settings>) => {
    setSettings(prev => ({ ...prev, ...newSettings }));
  }, []);

  return (
    <SettingsContext.Provider value={{ settings, updateSettings, isRbacEnabled, setIsRbacEnabled }}>
      {children}
    </SettingsContext.Provider>
  );
};

export const useSettings = () => {
  const context = useContext(SettingsContext);
  if (context === undefined) {
    throw new Error('useSettings must be used within a SettingsProvider');
  }
  return context;
};
