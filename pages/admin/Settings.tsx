import React, { useEffect } from 'react';
import Card from '../../components/ui/Card';
import Input from '../../components/ui/Input';
import Button from '../../components/ui/Button';
import { Settings as SettingsType, Permission } from '../../types';
import FileUploader from '../../components/ui/FileUploader';
import { useSettings } from '../../context/SettingsContext';
import { usePermissions } from '../../hooks/usePermissions';
import { CURRENCIES } from '../../constants';

const Settings: React.FC = () => {
    const { settings, updateSettings, isRbacEnabled, setIsRbacEnabled } = useSettings();
    const [localSettings, setLocalSettings] = React.useState<SettingsType>(settings);
    const [isLoading, setIsLoading] = React.useState(false);
    const { can } = usePermissions();

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