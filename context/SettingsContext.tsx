import React, { createContext, useState, ReactNode, useContext, useCallback } from 'react';
import { Settings } from '../types';
import { mockAppSettings } from '../services/mockData';

interface SettingsContextType {
  settings: Settings;
  updateSettings: (newSettings: Partial<Settings>) => void;
  isRbacEnabled: boolean;
  setIsRbacEnabled: React.Dispatch<React.SetStateAction<boolean>>;
}

export const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

export const SettingsProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [settings, setSettings] = useState<Settings>(mockAppSettings);
  const [isRbacEnabled, setIsRbacEnabled] = useState(true);

  const updateSettings = useCallback((newSettings: Partial<Settings>) => {
    setSettings(prev => {
        const updated = { ...prev, ...newSettings };
        // Also update the mock object to persist across re-renders/hot-reloads
        Object.assign(mockAppSettings, updated);
        return updated;
    });
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
