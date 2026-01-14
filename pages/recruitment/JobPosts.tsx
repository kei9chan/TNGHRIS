
import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { JobPost, Permission, JobPostStatus, Role, JobRequisition, BusinessUnit } from '../../types';
import { supabase } from '../../services/supabaseClient';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import { usePermissions } from '../../hooks/usePermissions';
import JobPostTable from '../../components/recruitment/JobPostTable';
import JobPostModal from '../../components/recruitment/JobPostModal';
import { useAuth } from '../../hooks/useAuth';
import { useSettings } from '../../context/SettingsContext';
import RichTextEditor from '../../components/ui/RichTextEditor';
import { logActivity } from '../../services/auditService';

const EditIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.5L15.232 5.232z" /></svg>;

const JobPosts: React.FC = () => {
  const { can, getAccessibleBusinessUnits } = usePermissions();
  const { user } = useAuth();
  const { settings, updateSettings } = useSettings();
  const [isEditingDesc, setIsEditingDesc] = useState(false);
  const [editText, setEditText] = useState('');

  const [jobPosts, setJobPosts] = useState<JobPost[]>([]);
  const [businessUnits, setBusinessUnits] = useState<BusinessUnit[]>([]);
  const [requisitions, setRequisitions] = useState<JobRequisition[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedPost, setSelectedPost] = useState<JobPost | null>(null);

  const canView = can('JobPosts', Permission.View) || can('JobPosts', Permission.Manage);
  const canCreate = can('JobPosts', Permission.Manage);

  const isAdmin = user?.role === Role.Admin;
  const descriptionKey = 'recruitmentJobPostsDesc';
  const description = settings[descriptionKey] as string || '';

  const accessibleBus = useMemo(
    () => getAccessibleBusinessUnits(businessUnits),
    [getAccessibleBusinessUnits, businessUnits]
  );

  // Show all posts to avoid hiding data due to BU/access issues.
  const filteredJobPosts = jobPosts;

  const mapJobPost = useCallback((row: any): JobPost => ({
    id: row.id,
    requisitionId: row.requisition_id,
    businessUnitId: row.business_unit_id,
    title: row.title,
    slug: row.slug,
    description: row.description,
    requirements: row.requirements ?? '',
    benefits: row.benefits ?? '',
    locationLabel: row.location_label ?? '',
    employmentType: row.employment_type,
    status: row.status,
    publishedAt: row.published_at ? new Date(row.published_at) : undefined,
    channels: row.channels ?? { careerSite: false, qr: false, social: false, jobBoards: false },
    referralBonus: row.referral_bonus ?? undefined,
  }), []);

  const mapRequisition = useCallback((row: any): JobRequisition => ({
    id: row.id,
    reqCode: row.req_code,
    title: row.title,
    departmentId: row.department_id,
    businessUnitId: row.business_unit_id,
    headcount: row.headcount,
    employmentType: row.employment_type,
    locationType: row.location_type,
    workLocation: row.work_location,
    budgetedSalaryMin: row.budgeted_salary_min,
    budgetedSalaryMax: row.budgeted_salary_max,
    justification: row.justification,
    createdByUserId: row.created_by_user_id,
    status: (row.status || '').toString().trim(),
    createdAt: row.created_at ? new Date(row.created_at) : new Date(),
    updatedAt: row.updated_at ? new Date(row.updated_at) : new Date(),
    isUrgent: row.is_urgent,
    routingSteps: row.routing_steps || [],
  }), []);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [buRes, reqRes, postsRes] = await Promise.all([
        supabase.from('business_units').select('id, name, code, color'),
        supabase.from('job_requisitions').select('*'),
        supabase.from('job_posts').select('*').order('created_at', { ascending: false }),
      ]);

      if (buRes.error) throw buRes.error;
      if (reqRes.error) throw reqRes.error;
      if (postsRes.error) throw postsRes.error;

      setBusinessUnits(buRes.data as BusinessUnit[]);
      setRequisitions((reqRes.data || []).map(mapRequisition));
      setJobPosts((postsRes.data || []).map(mapJobPost));
    } catch (err) {
      console.error('Failed to load job posts', err);
      alert('Failed to load job posts. Please try again.');
    } finally {
      setIsLoading(false);
    }
  }, [mapJobPost, mapRequisition]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleEditDesc = () => {
      setEditText(description);
      setIsEditingDesc(true);
  };
  
  const handleSaveDesc = () => {
      updateSettings({ [descriptionKey]: editText });
      setIsEditingDesc(false);
  };

  const handleOpenModal = (post: JobPost | null) => {
    setSelectedPost(post);
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setSelectedPost(null);
  };

  const handleSave = async (postToSave: JobPost) => {
    setIsSaving(true);
    const slug = postToSave.slug || postToSave.title.toLowerCase().replace(/\s+/g, '-');
    const payload = {
      requisition_id: postToSave.requisitionId,
      business_unit_id: postToSave.businessUnitId,
      title: postToSave.title,
      slug,
      description: postToSave.description,
      requirements: postToSave.requirements ?? '',
      benefits: postToSave.benefits ?? '',
      location_label: postToSave.locationLabel ?? '',
      employment_type: postToSave.employmentType,
      status: postToSave.status,
      published_at: postToSave.publishedAt ?? (postToSave.status === JobPostStatus.Published ? new Date().toISOString() : null),
      channels: postToSave.channels || { careerSite: false, qr: false, social: false, jobBoards: false },
      referral_bonus: postToSave.referralBonus ?? null,
      created_by_user_id: user?.id || null,
    };

    try {
      if (postToSave.id) {
        const { data, error } = await supabase.from('job_posts').update(payload).eq('id', postToSave.id).select().single();
        if (error) throw error;
        const mapped = mapJobPost(data);
        setJobPosts(prev => prev.map(p => (p.id === mapped.id ? mapped : p)));
        logActivity(user, 'UPDATE', 'JobPost', mapped.id, `Updated job post: ${mapped.title}`);
      } else {
        const { data, error } = await supabase.from('job_posts').insert(payload).select().single();
        if (error) throw error;
        const mapped = mapJobPost(data);
        setJobPosts(prev => [mapped, ...prev]);
        logActivity(user, 'CREATE', 'JobPost', mapped.id, `Created new job post: ${mapped.title}`);
      }
      handleCloseModal();
    } catch (err: any) {
      console.error('Failed to save job post', err);
      alert(err?.message || 'Failed to save job post.');
    } finally {
      setIsSaving(false);
    }
  };

   const handleDelete = async (id: string) => {
    if (!window.confirm('Are you sure you want to delete this job post draft?')) return;
    try {
        const { error } = await supabase.from('job_posts').delete().eq('id', id);
        if (error) throw error;
        setJobPosts(prev => prev.filter(p => p.id !== id));
        logActivity(user, 'DELETE', 'JobPost', id, `Deleted job post draft`);
    } catch (err) {
        console.error('Failed to delete job post', err);
        alert('Failed to delete job post.');
    }
  };


  return (
    <div className="space-y-6">
      {!canView ? (
        <Card><div className="p-6 text-gray-600 dark:text-gray-300">You do not have permission to view job posts.</div></Card>
      ) : (
      <>
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Job Post Manager</h1>
        {canCreate && (
          <Button onClick={() => handleOpenModal(null)} disabled={isLoading}>Create Job Post</Button>
        )}
      </div>
       {isEditingDesc ? (
          <div className="p-4 border rounded-lg bg-gray-50 dark:bg-slate-800/50 dark:border-slate-700 space-y-4">
              <RichTextEditor
                  label="Edit Description"
                  value={editText}
                  onChange={setEditText}
              />
              <div className="flex justify-end space-x-2">
                  <Button variant="secondary" onClick={() => setIsEditingDesc(false)}>Cancel</Button>
                  <Button onClick={handleSaveDesc}>Save</Button>
              </div>
          </div>
      ) : (
          <div className="relative group">
              <div 
                  className="text-gray-600 dark:text-gray-400 mt-2" 
                  dangerouslySetInnerHTML={{ __html: description }}
              />
              {isAdmin && (
                  <div className="absolute top-0 right-0 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button size="sm" variant="secondary" onClick={handleEditDesc} title="Edit description">
                          <EditIcon />
                      </Button>
                  </div>
              )}
          </div>
      )}
      <Card>
        {isLoading ? (
          <div className="py-8 text-center text-gray-500 dark:text-gray-400">Loading job posts...</div>
        ) : (
        <JobPostTable
            posts={filteredJobPosts}
            onEdit={handleOpenModal}
            onDelete={handleDelete}
        />
        )}
      </Card>
      {isModalOpen && (
          <JobPostModal
            isOpen={isModalOpen}
            onClose={handleCloseModal}
            jobPost={selectedPost}
            jobRequisitions={requisitions}
            businessUnits={businessUnits}
            onSave={handleSave}
            saving={isSaving}
          />
      )}
      </>
      )}
    </div>
  );
};

export default JobPosts;
