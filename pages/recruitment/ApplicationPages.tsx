
import React, { useState, useMemo } from 'react';
import { mockApplicantPageThemes, mockBusinessUnits } from '../../services/mockData';
import { ApplicantPageTheme, Permission } from '../../types';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import { usePermissions } from '../../hooks/usePermissions';
import ApplicantPageEditor from '../../components/recruitment/ApplicantPageEditor';
import { Link } from 'react-router-dom';

const GlobeAltIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" /></svg>;

const ApplicationPages: React.FC = () => {
    const { can } = usePermissions();
    const canManage = can('Recruitment', Permission.Manage);

    const [themes, setThemes] = useState<ApplicantPageTheme[]>(mockApplicantPageThemes);
    const [isEditorOpen, setIsEditorOpen] = useState(false);
    const [selectedTheme, setSelectedTheme] = useState<ApplicantPageTheme | null>(null);

    const getBuName = (buId: string) => mockBusinessUnits.find(b => b.id === buId)?.name || 'Unknown BU';

    const handleCreate = () => {
        setSelectedTheme(null);
        setIsEditorOpen(true);
    };

    const handleEdit = (theme: ApplicantPageTheme) => {
        setSelectedTheme(theme);
        setIsEditorOpen(true);
    };

    const handleSave = (theme: ApplicantPageTheme) => {
        if (theme.id) {
            setThemes(prev => prev.map(t => t.id === theme.id ? theme : t));
            const idx = mockApplicantPageThemes.findIndex(t => t.id === theme.id);
            if (idx > -1) mockApplicantPageThemes[idx] = theme;
        } else {
            const newTheme = { ...theme, id: `APT-${Date.now()}` };
            setThemes(prev => [...prev, newTheme]);
            mockApplicantPageThemes.push(newTheme);
        }
        setIsEditorOpen(false);
    };

    const handleDelete = (id: string) => {
        if (window.confirm("Are you sure you want to delete this page?")) {
            setThemes(prev => prev.filter(t => t.id !== id));
            const idx = mockApplicantPageThemes.findIndex(t => t.id === id);
            if (idx > -1) mockApplicantPageThemes.splice(idx, 1);
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Application Pages</h1>
                    <p className="text-gray-600 dark:text-gray-400 mt-1">
                        Manage dedicated career landing pages for each Business Unit.
                    </p>
                </div>
                {canManage && <Button onClick={handleCreate}>Create Page</Button>}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {themes.map(theme => (
                    <Card key={theme.id} className="flex flex-col !p-0 overflow-hidden group">
                        {/* Header / Preview Area */}
                        <div className="h-40 relative flex items-center justify-center p-4 text-center" style={{ backgroundColor: theme.backgroundColor }}>
                            <div className="absolute inset-0 opacity-20" style={{ backgroundColor: theme.primaryColor }}></div>
                            <div className="relative z-10">
                                <h3 className="font-bold text-lg text-gray-800">{theme.pageTitle}</h3>
                                <span className="text-xs font-medium px-2 py-1 bg-white/50 rounded-full mt-2 inline-block">
                                    {getBuName(theme.businessUnitId)}
                                </span>
                            </div>
                        </div>
                        
                        <div className="p-4 flex-grow flex flex-col justify-between bg-white dark:bg-slate-800">
                            <div className="mb-4">
                                <p className="text-xs text-gray-500 uppercase font-semibold mb-1">Public Link</p>
                                <Link 
                                    to={`/careers/${theme.slug}`} 
                                    target="_blank" 
                                    className="text-indigo-600 hover:text-indigo-500 text-sm flex items-center truncate"
                                >
                                    <GlobeAltIcon />
                                    /careers/{theme.slug}
                                </Link>
                            </div>
                            
                            <div className="flex space-x-2 pt-4 border-t dark:border-slate-700">
                                <Button size="sm" variant="secondary" className="w-full" onClick={() => handleEdit(theme)}>Edit</Button>
                                <Button size="sm" variant="danger" onClick={() => handleDelete(theme.id)}>Delete</Button>
                            </div>
                        </div>
                    </Card>
                ))}
            </div>

            {isEditorOpen && (
                <ApplicantPageEditor
                    isOpen={isEditorOpen}
                    onClose={() => setIsEditorOpen(false)}
                    onSave={handleSave}
                    theme={selectedTheme}
                />
            )}
        </div>
    );
};

export default ApplicationPages;
