import React, { createContext, useState, ReactNode, useContext, useCallback, useEffect } from 'react';
import { Settings, ApproverConfigs, GMApproverConfig, BODApproverConfig } from '../types';
import { fetchApproverConfigs, saveGMApprover, saveBODApprovers } from '../services/approverConfigService';

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

const DEFAULT_APPROVER_CONFIGS: ApproverConfigs = {
  gmApprover: { user_id: null, user_name: null },
  bodApprovers: { user_ids: [], user_names: [] },
};

interface SettingsContextType {
  settings: Settings;
  updateSettings: (newSettings: Partial<Settings>) => void;
  isRbacEnabled: boolean;
  setIsRbacEnabled: React.Dispatch<React.SetStateAction<boolean>>;
  approverConfigs: ApproverConfigs;
  updateGMApprover: (config: GMApproverConfig) => Promise<void>;
  updateBODApprovers: (config: BODApproverConfig) => Promise<void>;
  refreshApproverConfigs: () => Promise<void>;
}

export const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

export const SettingsProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [settings, setSettings] = useState<Settings>(defaultAppSettings);
  const [isRbacEnabled, setIsRbacEnabled] = useState(true);
  const [approverConfigs, setApproverConfigs] = useState<ApproverConfigs>(DEFAULT_APPROVER_CONFIGS);

  const updateSettings = useCallback((newSettings: Partial<Settings>) => {
    setSettings(prev => ({ ...prev, ...newSettings }));
  }, []);

  // Load approver configs on mount
  const refreshApproverConfigs = useCallback(async () => {
    try {
      const configs = await fetchApproverConfigs();
      setApproverConfigs(configs);
    } catch (e) {
      console.warn('Failed to load approver configs', e);
    }
  }, []);

  useEffect(() => {
    refreshApproverConfigs();
  }, [refreshApproverConfigs]);

  const updateGMApprover = useCallback(async (config: GMApproverConfig) => {
    await saveGMApprover(config);
    setApproverConfigs(prev => ({ ...prev, gmApprover: config }));
  }, []);

  const updateBODApprovers = useCallback(async (config: BODApproverConfig) => {
    await saveBODApprovers(config);
    setApproverConfigs(prev => ({ ...prev, bodApprovers: config }));
  }, []);

  return (
    <SettingsContext.Provider value={{
      settings, updateSettings, isRbacEnabled, setIsRbacEnabled,
      approverConfigs, updateGMApprover, updateBODApprovers, refreshApproverConfigs,
    }}>
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
