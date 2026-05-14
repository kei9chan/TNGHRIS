import React, { useEffect, useState, useCallback } from 'react';
import Card from '../../components/ui/Card';
import Input from '../../components/ui/Input';
import Button from '../../components/ui/Button';
import { Settings as SettingsType, Permission, GMApproverConfig, BODApproverConfig } from '../../types';
import FileUploader from '../../components/ui/FileUploader';
import { useSettings } from '../../context/SettingsContext';
import { usePermissions } from '../../hooks/usePermissions';
import { CURRENCIES } from '../../constants';
import { supabase } from '../../services/supabaseClient';

interface UserOption {
    id: string;
    name: string;
    role: string;
}

const Settings: React.FC = () => {
    const {
        settings, updateSettings, isRbacEnabled, setIsRbacEnabled,
        approverConfigs, updateGMApprover, updateBODApprovers,
    } = useSettings();
    const [localSettings, setLocalSettings] = React.useState<SettingsType>(settings);
    const [isLoading, setIsLoading] = React.useState(false);
    const { can } = usePermissions();

    // Approver config local state
    const [allUsers, setAllUsers] = useState<UserOption[]>([]);
    const [selectedGM, setSelectedGM] = useState<string>('');
    const [selectedBODs, setSelectedBODs] = useState<string[]>([]);
    const [approverSaving, setApproverSaving] = useState(false);
    const [approverMsg, setApproverMsg] = useState('');

    // Load all users for the dropdowns
    useEffect(() => {
        const loadUsers = async () => {
            const { data, error } = await supabase
                .from('hris_users')
                .select('id, full_name, role')
                .order('full_name');
            if (!error && data) {
                setAllUsers(data.map((u: any) => ({ id: u.id, name: u.full_name || 'Unnamed', role: u.role })));
            }
        };
        loadUsers();
    }, []);

    // Sync from context when configs load
    useEffect(() => {
        setSelectedGM(approverConfigs.gmApprover.user_id || '');
        setSelectedBODs(approverConfigs.bodApprovers.user_ids || []);
    }, [approverConfigs]);

    useEffect(() => {
        setLocalSettings(settings);
    }, [settings]);

    const handleFile = (file: File) => {
        const reader = new FileReader();
        reader.onloadend = () => {
            setLocalSettings(prev => ({ ...prev, appLogoUrl: reader.result as string }));
        };
        reader.readAsDataURL(file);
    };

    const handleSave = () => {
        setIsLoading(true);
        updateSettings(localSettings);
        setTimeout(() => {
            setIsLoading(false);
            alert("Settings saved successfully!");
        }, 1000);
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value, type } = e.target;
        const parsedValue = type === 'number' ? parseInt(value) || 0 : value;
        setLocalSettings(prev => ({ ...prev, [name]: parsedValue }));
    };

    // ---------------------------------------------------------------
    // Approver Config Handlers
    // ---------------------------------------------------------------
    const handleSaveApproverConfig = useCallback(async () => {
        setApproverSaving(true);
        setApproverMsg('');
        try {
            // Save GM
            const gmUser = allUsers.find(u => u.id === selectedGM);
            const gmConfig: GMApproverConfig = {
                user_id: selectedGM || null,
                user_name: gmUser?.name || null,
            };
            await updateGMApprover(gmConfig);

            // Save BOD
            const bodNames = selectedBODs.map(id => {
                const u = allUsers.find(x => x.id === id);
                return u?.name || 'Unknown';
            });
            const bodConfig: BODApproverConfig = {
                user_ids: selectedBODs,
                user_names: bodNames,
            };
            await updateBODApprovers(bodConfig);

            setApproverMsg('Approver configuration saved successfully!');
        } catch (e: any) {
            setApproverMsg(`Error: ${e.message || 'Failed to save approver config'}`);
        } finally {
            setApproverSaving(false);
        }
    }, [selectedGM, selectedBODs, allUsers, updateGMApprover, updateBODApprovers]);

    const toggleBOD = (userId: string) => {
        setSelectedBODs(prev =>
            prev.includes(userId)
                ? prev.filter(id => id !== userId)
                : [...prev, userId]
        );
    };


    return (
        <div className="space-y-6">
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">System Settings</h1>

            <Card title="Feature Toggles">
                <div className="flex items-center justify-between">
                    <div>
                        <h4 className="font-medium text-gray-900 dark:text-white">RBAC Enabled</h4>
                        <p className="text-sm text-gray-500 dark:text-gray-400">Controls visibility of role-based features and banners.</p>
                    </div>
                    <label htmlFor="rbac-toggle" className="flex items-center cursor-pointer">
                        <div className="relative">
                            <input type="checkbox" id="rbac-toggle" className="sr-only" checked={isRbacEnabled} onChange={() => setIsRbacEnabled(!isRbacEnabled)} />
                            <div className={`block w-14 h-8 rounded-full ${isRbacEnabled ? 'bg-indigo-600' : 'bg-gray-300'}`}></div>
                            <div className={`dot absolute left-1 top-1 bg-white w-6 h-6 rounded-full transition-transform ${isRbacEnabled ? 'translate-x-6' : ''}`}></div>
                        </div>
                    </label>
                </div>
            </Card>

            {/* ====== Approver Configuration ====== */}
            <Card title="Approver Configuration">
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                    Configure who approves manager-level WFH, OT, and Leave requests. Managerial requests flow: <strong>Requester → GM → BOD (final)</strong>.
                </p>

                {/* GM Approver — single select */}
                <div className="mb-6">
                    <label htmlFor="gm-approver" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        General Manager (GM) Approver
                    </label>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
                        Select a single user who will approve all manager-level requests as GM. This is the first approval tier.
                    </p>
                    <select
                        id="gm-approver"
                        value={selectedGM}
                        onChange={(e) => setSelectedGM(e.target.value)}
                        className="block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                    >
                        <option value="">— Select GM Approver —</option>
                        {allUsers.map(u => (
                            <option key={u.id} value={u.id}>
                                {u.name} ({u.role})
                            </option>
                        ))}
                    </select>
                </div>

                {/* BOD Approvers — multi select via checkboxes */}
                <div className="mb-6">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Board of Directors (BOD) — Final Approvers
                    </label>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
                        Select one or more users who can give final approval on manager-level requests. Any one of these users can approve.
                    </p>
                    <div className="max-h-48 overflow-y-auto border border-gray-300 dark:border-gray-600 rounded-md p-2 space-y-1">
                        {allUsers.length === 0 && (
                            <p className="text-sm text-gray-400">Loading users...</p>
                        )}
                        {allUsers.map(u => (
                            <label key={u.id} className="flex items-center gap-2 p-1 hover:bg-gray-50 dark:hover:bg-gray-700 rounded cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={selectedBODs.includes(u.id)}
                                    onChange={() => toggleBOD(u.id)}
                                    className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
                                />
                                <span className="text-sm text-gray-700 dark:text-gray-300">
                                    {u.name} <span className="text-gray-400">({u.role})</span>
                                </span>
                            </label>
                        ))}
                    </div>
                    {selectedBODs.length > 0 && (
                        <p className="mt-2 text-xs text-indigo-600 dark:text-indigo-400">
                            {selectedBODs.length} BOD approver{selectedBODs.length > 1 ? 's' : ''} selected
                        </p>
                    )}
                </div>

                {approverMsg && (
                    <p className={`text-sm mb-3 ${approverMsg.startsWith('Error') ? 'text-red-600' : 'text-green-600'}`}>
                        {approverMsg}
                    </p>
                )}

                {can('Settings', Permission.Manage) && (
                    <Button onClick={handleSaveApproverConfig} isLoading={approverSaving} variant="secondary">
                        Save Approver Configuration
                    </Button>
                )}
            </Card>

            <Card title="Branding">
                <div className="space-y-4">
                    <Input 
                        label="Application Name"
                        id="appName"
                        name="appName"
                        type="text"
                        value={localSettings.appName}
                        onChange={handleChange}
                    />
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Application Logo</label>
                        <FileUploader onFileUpload={handleFile} />
                        {localSettings.appLogoUrl && (
                            <div className="mt-4 flex items-center space-x-4">
                                <img src={localSettings.appLogoUrl} alt="Branding logo preview" className="max-h-24 p-2 bg-gray-100 dark:bg-gray-700 rounded-md" />
                                <Button variant="danger" size="sm" onClick={() => setLocalSettings(prev => ({ ...prev, appLogoUrl: '' }))}>
                                    Remove
                                </Button>
                            </div>
                        )}
                    </div>
                </div>
            </Card>

            <Card title="General Settings">
                <div className="space-y-4">
                    <Input 
                        label="Reminder Cadence (days)"
                        id="reminderCadence"
                        name="reminderCadence"
                        type="number"
                        value={localSettings.reminderCadence}
                        onChange={handleChange}
                    />
                    <Input 
                        label="PDF Header Text"
                        id="pdfHeader"
                        name="pdfHeader"
                        type="text"
                        value={localSettings.pdfHeader}
                        onChange={handleChange}
                    />
                    <Input 
                        label="PDF Footer Text"
                        id="pdfFooter"
                        name="pdfFooter"
                        type="text"
                        value={localSettings.pdfFooter}
                        onChange={handleChange}
                    />
                </div>
            </Card>

             <Card title="Localization">
                <div className="space-y-4">
                    <div>
                        <label htmlFor="main-currency" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Main Currency</label>
                        <select 
                            id="main-currency"
                            name="currency"
                            value={localSettings.currency} 
                            onChange={handleChange} 
                            className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                        >
                            {CURRENCIES.map(curr => (
                                <option key={curr.code} value={curr.code}>
                                    {curr.code} - {curr.name}
                                </option>
                            ))}
                        </select>
                        <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">This will affect how monetary values are displayed across the system. (Display only, no conversion)</p>
                    </div>
                </div>
            </Card>

            <div className="flex justify-end">
                {can('Settings', Permission.Manage) && (
                    <Button onClick={handleSave} isLoading={isLoading}>
                        Save Settings
                    </Button>
                )}
            </div>
        </div>
    );
};

export default Settings;