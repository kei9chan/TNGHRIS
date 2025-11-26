
import React, { useState, useMemo } from 'react';
import { JobPost, Permission, JobPostStatus, Role } from '../../types';
import { mockJobPosts, mockBusinessUnits } from '../../services/mockData';
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

  const [jobPosts, setJobPosts] = useState<JobPost[]>(mockJobPosts);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedPost, setSelectedPost] = useState<JobPost | null>(null);

  const canCreate = can('JobPosts', Permission.Create) || can('JobPosts', Permission.Manage);

  const isAdmin = user?.role === Role.Admin;
  const descriptionKey = 'recruitmentJobPostsDesc';
  const description = settings[descriptionKey] as string || '';

  const accessibleBus = useMemo(() => getAccessibleBusinessUnits(mockBusinessUnits), [getAccessibleBusinessUnits]);

  const filteredJobPosts = useMemo(() => {
      const accessibleBuIds = new Set(accessibleBus.map(b => b.id));
      return jobPosts.filter(post => accessibleBuIds.has(post.businessUnitId));
  }, [jobPosts, accessibleBus]);

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

  const handleSave = (postToSave: JobPost) => {
    if (postToSave.id) {
      // Update existing
      const updatedPosts = jobPosts.map(p => (p.id === postToSave.id ? postToSave : p));
      setJobPosts(updatedPosts);
      const index = mockJobPosts.findIndex(p => p.id === postToSave.id);
      if (index > -1) mockJobPosts[index] = postToSave;
      logActivity(user, 'UPDATE', 'JobPost', postToSave.id, `Updated job post: ${postToSave.title}`);
    } else {
      // Create new
      const newPost = { ...postToSave, id: `POST-${Date.now()}`, slug: postToSave.title.toLowerCase().replace(/\s+/g, '-') };
      const updatedPosts = [newPost, ...jobPosts];
      setJobPosts(updatedPosts);
      mockJobPosts.unshift(newPost);
      logActivity(user, 'CREATE', 'JobPost', newPost.id, `Created new job post: ${newPost.title}`);
    }
    handleCloseModal();
  };

   const handleDelete = (id: string) => {
    if (window.confirm('Are you sure you want to delete this job post draft?')) {
        setJobPosts(prev => prev.filter(p => p.id !== id));
        const index = mockJobPosts.findIndex(p => p.id === id);
        if (index > -1) {
            const deletedPost = mockJobPosts.splice(index, 1)[0];
            logActivity(user, 'DELETE', 'JobPost', id, `Deleted job post draft: ${deletedPost.title}`);
        }
    }
  };


  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Job Post Manager</h1>
        {canCreate && (
          <Button onClick={() => handleOpenModal(null)}>Create Job Post</Button>
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
        <JobPostTable
            posts={filteredJobPosts}
            onEdit={handleOpenModal}
            onDelete={handleDelete}
        />
      </Card>
      {isModalOpen && (
          <JobPostModal
            isOpen={isModalOpen}
            onClose={handleCloseModal}
            jobPost={selectedPost}
            onSave={handleSave}
          />
      )}
    </div>
  );
};

export default JobPosts;
