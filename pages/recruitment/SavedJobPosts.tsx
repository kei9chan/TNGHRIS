import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Button from '../../components/ui/Button';
import Card from '../../components/ui/Card';
import JobPostTemplateGenerator from '../../components/recruitment/JobPostTemplateGenerator';
import {
  JobPostDesign,
  JobPostDesignRow,
  jobPostDesignPayload,
  mapJobPostDesign,
} from '../../components/recruitment/jobPostDesigns';
import { JobPostTemplateRecord } from '../../components/recruitment/jobPostTemplatePresets';
import { useAuth } from '../../hooks/useAuth';
import { usePermissions } from '../../hooks/usePermissions';
import { supabase } from '../../services/supabaseClient';
import { Permission, Role } from '../../types';

const SavedJobPosts: React.FC = () => {
  const navigate = useNavigate();
  const { can } = usePermissions();
  const { user } = useAuth();
  const assignedRoles = new Set([user?.role, ...(user?.roles || [])]);
  const canManage = assignedRoles.has(Role.HRStaff) || assignedRoles.has(Role.HRManager) || can('JobPosts', Permission.Manage);
  const [designs, setDesigns] = useState<JobPostDesign[]>([]);
  const [selectedDesign, setSelectedDesign] = useState<JobPostDesign | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [search, setSearch] = useState('');

  const loadDesigns = useCallback(async () => {
    if (!canManage) {
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    setErrorMessage('');
    try {
      const { data, error } = await supabase.from('job_post_designs').select('*').neq('status', 'Archived').order('updated_at', { ascending: false });
      if (error) throw error;
      setDesigns(((data || []) as JobPostDesignRow[]).map(mapJobPostDesign));
    } catch (error: any) {
      console.error('Failed to load saved job posts', error);
      setErrorMessage(error?.message || 'Failed to load saved job posts.');
    } finally {
      setIsLoading(false);
    }
  }, [canManage]);

  useEffect(() => { loadDesigns(); }, [loadDesigns]);

  const filteredDesigns = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return designs;
    return designs.filter(design => [design.name, design.jobTitle, design.businessUnit].some(value => value.toLowerCase().includes(query)));
  }, [designs, search]);

  const handleSave = async (template: JobPostTemplateRecord) => {
    if (!selectedDesign) return;
    setIsSaving(true);
    setErrorMessage('');
    try {
      const payload = jobPostDesignPayload(template, selectedDesign.sourceTemplateId, user?.id);
      const { data, error } = await supabase.from('job_post_designs').update(payload).eq('id', selectedDesign.id).select('*').single();
      if (error) throw error;
      const updated = mapJobPostDesign(data as JobPostDesignRow);
      setDesigns(previous => previous.map(item => item.id === updated.id ? updated : item));
      setSelectedDesign(null);
    } catch (error: any) {
      console.error('Failed to update saved job post', error);
      setErrorMessage(error?.message || 'Failed to update saved job post.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (design: JobPostDesign) => {
    if (!window.confirm(`Delete “${design.name}”? This cannot be undone.`)) return;
    setErrorMessage('');
    try {
      const { error } = await supabase.from('job_post_designs').delete().eq('id', design.id);
      if (error) throw error;
      setDesigns(previous => previous.filter(item => item.id !== design.id));
    } catch (error: any) {
      console.error('Failed to delete saved job post', error);
      setErrorMessage(error?.message || 'Failed to delete saved job post.');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Saved Job Posts</h1>
          <p className="mt-1 text-gray-600 dark:text-gray-400">Editable job-post artwork created from your visual templates.</p>
        </div>
        {canManage && <Button onClick={() => navigate('/recruitment/job-post-templates')}>Use a Template</Button>}
      </div>

      {errorMessage && <div className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-800 dark:bg-red-950/30 dark:text-red-200">{errorMessage}</div>}

      {!canManage ? (
        <Card><div className="p-6 text-gray-600 dark:text-gray-300">You do not have permission to manage saved job posts.</div></Card>
      ) : (
        <>
          <div className="max-w-xl">
            <label htmlFor="saved-job-post-search" className="sr-only">Search saved job posts</label>
            <input id="saved-job-post-search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Search by title, name, or business unit" className="w-full rounded-lg border border-gray-300 bg-white px-4 py-3 text-sm text-gray-900 shadow-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 dark:border-slate-600 dark:bg-slate-800 dark:text-white" />
          </div>

          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
            {isLoading && <div className="col-span-full py-12 text-center text-gray-500">Loading saved job posts…</div>}
            {!isLoading && filteredDesigns.map(design => {
              const template = design.template;
              const wordmark = template.brandWordmark || design.businessUnit || 'TNG HRIS';
              return (
                <Card key={design.id} className="flex h-full flex-col overflow-hidden !p-0">
                  <div className="relative flex h-52 flex-col items-center justify-center overflow-hidden p-5 text-center" style={{ backgroundColor: template.backgroundColor, color: template.textColor }}>
                    {template.backgroundImage && <img src={template.backgroundImage} alt="" className="absolute inset-0 h-full w-full object-cover opacity-25" />}
                    <div className="relative z-10">
                      <div className="mb-3 text-xs font-black uppercase tracking-[0.18em]" style={{ color: template.accentColor }}>{wordmark}</div>
                      <h3 className="line-clamp-2 text-sm font-bold uppercase" style={{ color: template.accentColor }}>{template.headline}</h3>
                      <h2 className="mt-2 line-clamp-2 text-xl font-extrabold uppercase leading-tight" style={{ color: template.textColor }}>{design.jobTitle}</h2>
                      <div className="mx-auto mt-5 h-2 w-32 rounded-full" style={{ backgroundColor: template.accentColor }} />
                    </div>
                  </div>
                  <div className="flex flex-grow flex-col justify-between bg-white p-4 dark:bg-slate-800">
                    <div>
                      <div className="flex items-start justify-between gap-3"><h3 className="font-bold text-gray-900 dark:text-white">{design.name}</h3><span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-semibold text-slate-600 dark:bg-slate-700 dark:text-slate-200">{design.status}</span></div>
                      <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">{design.businessUnit || 'All business units'}</p>
                      <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">Updated {design.updatedAt.toLocaleDateString()}</p>
                    </div>
                    <div className="mt-4 grid grid-cols-3 gap-2 border-t border-gray-200 pt-4 dark:border-slate-700">
                      <Button size="sm" className="col-span-2" onClick={() => setSelectedDesign(design)}>Edit / Download</Button>
                      <Button size="sm" variant="danger" onClick={() => handleDelete(design)}>Delete</Button>
                    </div>
                  </div>
                </Card>
              );
            })}
            {!isLoading && filteredDesigns.length === 0 && <Card className="col-span-full"><div className="py-12 text-center"><h2 className="text-lg font-semibold text-gray-900 dark:text-white">No saved job posts yet</h2><p className="mt-2 text-sm text-gray-500">Choose a visual template, customize it for a vacancy, and save it here.</p><Button className="mt-5" onClick={() => navigate('/recruitment/job-post-templates')}>Use a Template</Button></div></Card>}
          </div>
        </>
      )}

      {selectedDesign && <JobPostTemplateGenerator isOpen={true} onClose={() => setSelectedDesign(null)} onSave={handleSave} template={selectedDesign.template} saving={isSaving} purpose="post" />}
    </div>
  );
};

export default SavedJobPosts;
