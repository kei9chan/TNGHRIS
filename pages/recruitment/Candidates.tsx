
import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { Candidate, Role, Application, JobPost, ApplicationStage, Permission } from '../../types';
import Card from '../../components/ui/Card';
import Input from '../../components/ui/Input';
import CandidateTable from '../../components/recruitment/CandidateTable';
import CandidateProfileModal from '../../components/recruitment/CandidateProfileModal';
import { useAuth } from '../../hooks/useAuth';
import { useSettings } from '../../context/SettingsContext';
import RichTextEditor from '../../components/ui/RichTextEditor';
import Button from '../../components/ui/Button';
import { supabase } from '../../services/supabaseClient';
import { usePermissions } from '../../hooks/usePermissions';

const EditIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.5L15.232 5.232z" /></svg>;

const Candidates: React.FC = () => {
  const { user } = useAuth();
  const { can } = usePermissions();
  const { settings, updateSettings } = useSettings();
  const [isEditingDesc, setIsEditingDesc] = useState(false);
  const [editText, setEditText] = useState('');

  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [applications, setApplications] = useState<Application[]>([]);
  const [jobPosts, setJobPosts] = useState<JobPost[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedCandidate, setSelectedCandidate] = useState<Candidate | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  const isAdmin = user?.role === Role.Admin;
  const canView = can('Applicants', Permission.View) || can('Applicants', Permission.Manage);
  const descriptionKey = 'recruitmentCandidatesDesc';
  const description = settings[descriptionKey] as string || '';

  const handleEditDesc = () => {
      setEditText(description);
      setIsEditingDesc(true);
  };
  
  const handleSaveDesc = () => {
      updateSettings({ [descriptionKey]: editText });
      setIsEditingDesc(false);
  };

  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
        const [candRes, appRes, postRes] = await Promise.all([
            supabase.from('job_candidates').select('*'),
            supabase.from('job_applications').select('*'),
            supabase.from('job_posts').select('*'),
        ]);
        if (candRes.error) throw candRes.error;
        if (appRes.error) throw appRes.error;
        if (postRes.error) throw postRes.error;

        setCandidates((candRes.data || []).map((c: any) => ({
            id: c.id,
            firstName: c.first_name,
            lastName: c.last_name,
            email: c.email,
            phone: c.phone ?? '',
            source: c.source,
            tags: c.tags || [],
            portfolioUrl: c.portfolio_url || '',
            consentAt: c.consent_at ? new Date(c.consent_at) : undefined,
        } as Candidate)));

        setApplications((appRes.data || []).map((a: any) => ({
            id: a.id,
            candidateId: a.candidate_id,
            jobPostId: a.job_post_id,
            requisitionId: a.requisition_id,
            stage: a.stage as ApplicationStage,
            notes: a.cover_letter || a.notes || '',
            createdAt: a.created_at ? new Date(a.created_at) : new Date(),
            updatedAt: a.updated_at ? new Date(a.updated_at) : new Date(),
        } as Application)));

        setJobPosts((postRes.data || []).map((p: any) => ({
            id: p.id,
            title: p.title,
            requisitionId: p.requisition_id,
            businessUnitId: p.business_unit_id,
            employmentType: p.employment_type,
            locationLabel: p.location_label ?? '',
            description: p.description ?? '',
            requirements: p.requirements ?? '',
            benefits: p.benefits ?? '',
            slug: p.slug ?? '',
            status: p.status,
            publishedAt: p.published_at ? new Date(p.published_at) : undefined,
            channels: p.channels || { careerSite: false, qr: false, social: false, jobBoards: false },
        } as JobPost)));
    } catch (err) {
        console.error('Failed to load candidates', err);
        alert('Failed to load candidates.');
    } finally {
        setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const filteredCandidates = useMemo(() => {
    return candidates.filter(candidate => {
      const lowerSearch = searchTerm.toLowerCase();
      const nameMatch = `${candidate.firstName} ${candidate.lastName}`.toLowerCase().includes(lowerSearch);
      const emailMatch = candidate.email.toLowerCase().includes(lowerSearch);
      const tagsMatch = candidate.tags?.some(tag => tag.toLowerCase().includes(lowerSearch));
      return nameMatch || emailMatch || tagsMatch;
    });
  }, [candidates, searchTerm]);

  const handleViewProfile = (candidate: Candidate) => {
    setSelectedCandidate(candidate);
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setSelectedCandidate(null);
  };

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Candidate Database</h1>
      {!canView ? (
        <Card><div className="p-6 text-gray-600 dark:text-gray-300">You do not have permission to view candidates.</div></Card>
      ) : (
      <>
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
        <div className="p-4">
            <Input 
                label="Search Candidates"
                id="candidate-search"
                placeholder="Search by name, email, or tag..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
            />
        </div>
      </Card>
      <Card>
        {isLoading ? (
            <div className="p-6 text-gray-500">Loading candidates...</div>
        ) : (
        <CandidateTable
            candidates={filteredCandidates}
            onViewProfile={handleViewProfile}
        />
        )}
      </Card>
      
      {selectedCandidate && (
        <CandidateProfileModal
            isOpen={isModalOpen}
            onClose={handleCloseModal}
            candidate={selectedCandidate}
            applications={applications}
            jobPosts={jobPosts}
        />
      )}
      </>
      )}
    </div>
  );
};

export default Candidates;
