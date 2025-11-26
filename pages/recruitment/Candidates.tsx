
import React, { useState, useMemo, useEffect } from 'react';
import { Candidate, Role } from '../../types';
import { mockCandidates } from '../../services/mockData';
import Card from '../../components/ui/Card';
import Input from '../../components/ui/Input';
import CandidateTable from '../../components/recruitment/CandidateTable';
import CandidateProfileModal from '../../components/recruitment/CandidateProfileModal';
import { useAuth } from '../../hooks/useAuth';
import { useSettings } from '../../context/SettingsContext';
import RichTextEditor from '../../components/ui/RichTextEditor';
import Button from '../../components/ui/Button';

const EditIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.5L15.232 5.232z" /></svg>;

const Candidates: React.FC = () => {
  const { user } = useAuth();
  const { settings, updateSettings } = useSettings();
  const [isEditingDesc, setIsEditingDesc] = useState(false);
  const [editText, setEditText] = useState('');

  const [candidates, setCandidates] = useState<Candidate[]>(mockCandidates);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedCandidate, setSelectedCandidate] = useState<Candidate | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  const isAdmin = user?.role === Role.Admin;
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

  // --- SYNC LOGIC START ---
  useEffect(() => {
    const syncData = () => {
        try {
            const storedCands = JSON.parse(localStorage.getItem('tng_candidates') || '[]');
            
            let hasUpdates = false;
            storedCands.forEach((cand: Candidate) => {
                if (!mockCandidates.find(c => c.id === cand.id)) {
                    mockCandidates.push(cand);
                    hasUpdates = true;
                }
            });

            if (hasUpdates || candidates.length !== mockCandidates.length) {
                setCandidates([...mockCandidates]);
            }
        } catch (e) {
            console.error("Error syncing candidates:", e);
        }
    };

    // Initial Sync
    syncData();

    // Poll
    const interval = setInterval(syncData, 2000);

    // Listen for storage event
    const handleStorage = (event: StorageEvent) => {
        if (event.key === 'tng_hris_db_update' || event.key === 'tng_candidates') {
            syncData();
        }
    };
    window.addEventListener('storage', handleStorage);

    return () => {
        clearInterval(interval);
        window.removeEventListener('storage', handleStorage);
    };
  }, [candidates.length]);
  // --- SYNC LOGIC END ---

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
        <CandidateTable
            candidates={filteredCandidates}
            onViewProfile={handleViewProfile}
        />
      </Card>
      
      {selectedCandidate && (
        <CandidateProfileModal
            isOpen={isModalOpen}
            onClose={handleCloseModal}
            candidate={selectedCandidate}
        />
      )}
    </div>
  );
};

export default Candidates;
