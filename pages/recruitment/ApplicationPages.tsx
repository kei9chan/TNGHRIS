
import React, { useState, useEffect, useCallback } from 'react';
import { ApplicantPageTheme, Permission } from '../../types';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import { usePermissions } from '../../hooks/usePermissions';
import ApplicantPageEditor from '../../components/recruitment/ApplicantPageEditor';
import { Link } from 'react-router-dom';
import { supabase } from '../../services/supabaseClient';
import { useAuth } from '../../hooks/useAuth';

const GlobeAltIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" /></svg>;

const ApplicationPages: React.FC = () => {
    const { can } = usePermissions();
    const { user } = useAuth();
    const canManage = can('ApplicationPages', Permission.Manage);
    const canView = can('ApplicationPages', Permission.View);

    const [themes, setThemes] = useState<ApplicantPageTheme[]>([]);
    const [businessUnits, setBusinessUnits] = useState<{ id: string; name: string }[]>([]);
    const [isEditorOpen, setIsEditorOpen] = useState(false);
    const [selectedTheme, setSelectedTheme] = useState<ApplicantPageTheme | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [loadError, setLoadError] = useState<string | null>(null);

    const getBuName = useCallback(
        (buId: string | null | undefined) => businessUnits.find(b => b.id === buId)?.name || 'All Business Units',
        [businessUnits]
    );

    const mapTheme = useCallback((row: any): ApplicantPageTheme => {
        const sections = row.sections || {};
        return {
            id: row.id,
            businessUnitId: row.business_unit_id,
            name: row.name || row.page_title || row.slug || 'Career Page',
            slug: row.slug,
            pageTitle: row.page_title,
            heroHeadline: row.hero_headline,
            heroDescription: row.hero_description,
            heroOverlayColor: sections.heroOverlayColor || 'rgba(0,0,0,0.5)',
            primaryColor: row.primary_color,
            backgroundColor: row.background_color,
            heroImage: row.hero_image_url || '',
            logoImage: row.logo_url || '',
            sections,
            benefits: sections.benefits || [],
            testimonials: sections.testimonials || [],
            contactEmail: sections.contactEmail || '',
            ctaText: row.cta_text || '',
            ctaLink: row.cta_link || '',
            isActive: row.is_active ?? true,
        };
    }, [businessUnits]);

    const loadThemes = useCallback(async () => {
        setIsLoading(true);
        setLoadError(null);
        try {
            const [{ data: buData, error: buErr }, { data, error }] = await Promise.all([
                supabase.from('business_units').select('id,name').order('name'),
                supabase.from('applicant_page_themes').select('*').order('updated_at', { ascending: false })
            ]);
            if (buErr) throw buErr;
            if (error) throw error;
            setBusinessUnits(buData || []);
            setThemes((data || []).map(mapTheme));
        } catch (err) {
            console.error('Failed to load pages', err);
            setLoadError('Failed to load application pages. Please retry.');
        } finally {
            setIsLoading(false);
        }
    }, [mapTheme]);

    useEffect(() => {
        if (canView) {
            loadThemes();
        } else {
            setIsLoading(false);
        }
    }, [loadThemes, canView]);

    const handleCreate = () => {
        setSelectedTheme(null);
        setIsEditorOpen(true);
    };

    const handleEdit = (theme: ApplicantPageTheme) => {
        setSelectedTheme(theme);
        setIsEditorOpen(true);
    };

    const handleSave = async (theme: ApplicantPageTheme) => {
        const payload = {
            business_unit_id: theme.businessUnitId,
            name: theme.name,
            slug: theme.slug,
            is_active: theme.isActive,
            page_title: theme.pageTitle,
            hero_headline: theme.heroHeadline,
            hero_description: theme.heroDescription,
            primary_color: theme.primaryColor,
            background_color: theme.backgroundColor,
            hero_image_url: theme.heroImage || null,
            logo_url: theme.logoImage || null,
            sections: {
                ...(Array.isArray(theme.sections) ? {} : (theme.sections || {})),
                benefits: theme.benefits || [],
                testimonials: theme.testimonials || [],
                contactEmail: theme.contactEmail || '',
                heroOverlayColor: theme.heroOverlayColor || 'rgba(0,0,0,0.5)',
            },
            cta_text: theme.ctaText || null,
            cta_link: theme.ctaLink || null,
        };
        try {
            if (theme.id) {
                const { data, error } = await supabase
                    .from('applicant_page_themes')
                    .update(payload)
                    .eq('id', theme.id)
                    .select()
                    .single();
                if (error) throw error;
                if (!data) throw new Error('No data returned on update');
                setThemes(prev => prev.map(t => t.id === theme.id ? mapTheme(data) : t));
            } else {
                const { data, error } = await supabase
                    .from('applicant_page_themes')
                    .insert(payload)
                    .select()
                    .single();
                if (error) throw error;
                if (!data) throw new Error('No data returned on insert');
                setThemes(prev => [mapTheme(data), ...prev]);
            }
            setIsEditorOpen(false);
        } catch (err: any) {
            console.error('Failed to save page', err);
            alert(err?.message || 'Failed to save page.');
        }
    };

    const handleDelete = (id: string) => {
        if (!window.confirm("Are you sure you want to delete this page?")) return;
        supabase.from('applicant_page_themes').delete().eq('id', id)
        .then(({ error }) => {
            if (error) throw error;
            setThemes(prev => prev.filter(t => t.id !== id));
        })
        .catch(err => {
            console.error('Failed to delete page', err);
            alert('Failed to delete page.');
        });
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
            {!canView ? (
                <div className="p-4 rounded-md bg-yellow-50 text-sm text-yellow-800">
                    You do not have access to view Application Pages.
                </div>
            ) : (
                <>
                    {isLoading && themes.length === 0 && (
                        <div className="p-4 rounded-md bg-gray-50 text-sm text-gray-600">Loading pages…</div>
                    )}
                    {loadError && (
                        <div className="p-4 rounded-md bg-red-50 text-sm text-red-700 mb-4">{loadError}</div>
                    )}
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
                                        <Button size="sm" variant="secondary" className="w-full" onClick={() => handleEdit(theme)} disabled={!canManage}>Edit</Button>
                                        <Button size="sm" variant="danger" onClick={() => handleDelete(theme.id)} disabled={!canManage}>Delete</Button>
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
                            businessUnits={businessUnits}
                        />
                    )}
                </>
            )}
        </div>
    );
};

export default ApplicationPages;
