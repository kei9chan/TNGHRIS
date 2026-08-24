import React, { useEffect, useState, useCallback } from 'react';
import Card from '../../components/ui/Card';
import Input from '../../components/ui/Input';
import Button from '../../components/ui/Button';
import { Settings as SettingsType, Permission, GMApproverConfig, BODApproverConfig, ConditionalTimeApprovalConfig, Role } from '../../types';
import FileUploader from '../../components/ui/FileUploader';
import { useSettings } from '../../context/SettingsContext';
import { usePermissions } from '../../hooks/usePermissions';
import { CURRENCIES } from '../../constants';
import { supabase } from '../../services/supabaseClient';

interface UserOption {
    id: string;
    name: string;
    email: string;
    role: string;
    roles: string[];
    businessUnit: string;
}

const Settings: React.FC = () => {
    const {
        settings, updateSettings, isRbacEnabled, setIsRbacEnabled,
        approverConfigs, updateGMApprover, updateBODApprovers, updateConditionalTimeApprovals,
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
    const [conditionalApprovers, setConditionalApprovers] = useState<string[]>([]);
    const [requiredConditionalApprovers, setRequiredConditionalApprovers] = useState<string[]>([]);
    const [leaveThreshold, setLeaveThreshold] = useState(1);
    const [wfhThreshold, setWfhThreshold] = useState(4);
    const [weeklyHoursThreshold, setWeeklyHoursThreshold] = useState(50);
    const [conditionalChangeNote, setConditionalChangeNote] = useState('');
    const [conditionalMsg, setConditionalMsg] = useState('');
    const [conditionalSaving, setConditionalSaving] = useState(false);

    // Load all users for the dropdowns
    useEffect(() => {
        const loadUsers = async () => {
            const [{ data, error }, { data: roleRows }] = await Promise.all([
              supabase
                .from('hris_users')
                .select('id, full_name, email, role, business_unit')
                .eq('status', 'Active')
                .order('full_name'),
              supabase.from('user_roles').select('user_id, role_id, is_active').eq('is_active', true),
            ]);
            if (!error && data) {
                setAllUsers(data.map((u: any) => ({
                    id: u.id,
                    name: u.full_name || 'Unnamed',
                    email: u.email,
                    role: u.role,
                    roles: Array.from(new Set([u.role, ...(roleRows || []).filter((r: any) => r.user_id === u.id).map((r: any) => r.role_id)])),
                    businessUnit: u.business_unit || 'All business units',
                })));
            }
        };
        loadUsers();
    }, []);

    // Sync from context when configs load
    useEffect(() => {
        setSelectedGM(approverConfigs.gmApprover.user_id || '');
        setSelectedBODs(approverConfigs.bodApprovers.user_ids || []);
        const conditional = approverConfigs.conditionalTimeApprovals;
        setConditionalApprovers(conditional.user_ids || []);
        setRequiredConditionalApprovers(conditional.required_user_ids || []);
        setLeaveThreshold(conditional.leave_days_per_remaining_month ?? 1);
        setWfhThreshold(conditional.wfh_days_per_month ?? 4);
        setWeeklyHoursThreshold(conditional.weekly_total_hours ?? 50);
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

    const toggleConditionalApprover = (userId: string) => {
        setConditionalApprovers(prev => {
            if (prev.includes(userId)) {
                setRequiredConditionalApprovers(required => required.filter(id => id !== userId));
                return prev.filter(id => id !== userId);
            }
            return [...prev, userId];
        });
    };

    const handleSaveConditionalRouting = async () => {
        setConditionalMsg('');
        const requiredBods = allUsers.filter(u => requiredConditionalApprovers.includes(u.id) && u.roles.includes(Role.BOD));
        if (!conditionalApprovers.length || !requiredBods.length) {
            setConditionalMsg('Error: Select at least one active BOD and mark that BOD as required.');
            return;
        }
        if (!conditionalChangeNote.trim()) {
            setConditionalMsg('Error: Add a reason or change note for the audit log.');
            return;
        }
        setConditionalSaving(true);
        try {
            const config: ConditionalTimeApprovalConfig = {
                user_ids: conditionalApprovers,
                user_names: conditionalApprovers.map(id => allUsers.find(u => u.id === id)?.name || 'Unknown'),
                required_user_ids: requiredConditionalApprovers,
                required_bod_approvals: 1,
                leave_days_per_remaining_month: leaveThreshold,
                wfh_days_per_month: wfhThreshold,
                weekly_total_hours: weeklyHoursThreshold,
            };
            await updateConditionalTimeApprovals(config, conditionalChangeNote.trim());
            setConditionalChangeNote('');
            setConditionalMsg('Conditional routing saved. New escalations will use this approver group.');
        } catch (error: any) {
            setConditionalMsg(`Error: ${error.message || 'Failed to save conditional routing'}`);
        } finally {
            setConditionalSaving(false);
        }
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

            <Card title="Conditional Approval Routing">
                <div className="mb-5 rounded-lg border border-indigo-200 bg-indigo-50 p-4 text-sm text-indigo-900">
                    <strong>Admin → Approval Settings → Conditional Approval Routing</strong>
                    <p className="mt-1">Applies only to Leave, WFH, and Overtime requests that exceed the configured thresholds. Routine requests stop with the employee’s direct reporting manager.</p>
                </div>

                {!approverConfigs.conditionalTimeApprovals.valid && (
                    <div role="alert" className="mb-5 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
                        <strong>Main BOD Approver configuration is invalid.</strong>
                        <p>{approverConfigs.conditionalTimeApprovals.invalid_reason || 'Select at least one active BOD approver.'}</p>
                    </div>
                )}

                <div className="mb-6">
                    <h3 className="font-semibold text-gray-900 dark:text-white">Main BOD Approver group</h3>
                    <p className="mt-1 text-xs text-gray-500">Select one or more active people, including a GM if needed. At least one selected active BOD must be marked required.</p>
                    <div className="mt-3 max-h-72 overflow-y-auto rounded-lg border border-gray-300 dark:border-gray-600">
                        {allUsers.map(option => {
                            const selected = conditionalApprovers.includes(option.id);
                            const required = requiredConditionalApprovers.includes(option.id);
                            const isBod = option.roles.includes(Role.BOD);
                            return (
                                <div key={option.id} className="flex flex-wrap items-center gap-3 border-b p-3 last:border-b-0 dark:border-gray-700">
                                    <input aria-label={`Select ${option.name}`} type="checkbox" checked={selected} onChange={() => toggleConditionalApprover(option.id)} />
                                    <div className="min-w-[240px] flex-1">
                                        <div className="font-medium text-gray-900 dark:text-white">{option.name} {isBod && <span className="ml-1 rounded bg-indigo-100 px-2 py-0.5 text-xs text-indigo-700">BOD</span>}</div>
                                        <div className="text-xs text-gray-500">{option.email} · {option.businessUnit} · {option.role}</div>
                                    </div>
                                    <label className={`flex items-center gap-2 text-xs ${selected ? 'text-gray-700' : 'text-gray-400'}`}>
                                        <input
                                            type="checkbox"
                                            disabled={!selected}
                                            checked={required}
                                            onChange={event => setRequiredConditionalApprovers(prev => event.target.checked ? [...new Set([...prev, option.id])] : prev.filter(id => id !== option.id))}
                                        />
                                        Required approval
                                    </label>
                                </div>
                            );
                        })}
                    </div>
                </div>

                <div className="grid gap-4 md:grid-cols-3">
                    <Input label="Leave days per month remaining" id="leave-routing-threshold" type="number" min="0.1" step="0.1" value={leaveThreshold} onChange={event => setLeaveThreshold(Number(event.target.value))} />
                    <Input label="WFH days per calendar month" id="wfh-routing-threshold" type="number" min="0" step="1" value={wfhThreshold} onChange={event => setWfhThreshold(Number(event.target.value))} />
                    <Input label="Weekly total-hours threshold" id="ot-routing-threshold" type="number" min="1" step="0.5" value={weeklyHoursThreshold} onChange={event => setWeeklyHoursThreshold(Number(event.target.value))} />
                </div>

                <label className="mt-5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Reason / change note
                    <textarea value={conditionalChangeNote} onChange={event => setConditionalChangeNote(event.target.value)} rows={3} className="mt-1 block w-full rounded-md border border-gray-300 p-3 dark:border-gray-600 dark:bg-gray-700" placeholder="Required for the audit log" />
                </label>

                {conditionalMsg && <p className={`mt-3 text-sm ${conditionalMsg.startsWith('Error') ? 'text-red-600' : 'text-green-600'}`}>{conditionalMsg}</p>}
                {can('Settings', Permission.Manage) && (
                    <Button className="mt-4" onClick={handleSaveConditionalRouting} isLoading={conditionalSaving}>
                        Save Conditional Routing
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
