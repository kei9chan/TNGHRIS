import React, { useState, useMemo, useEffect } from 'react';
import Card from '../../components/ui/Card';
import { EvaluationTimeline, Permission } from '../../types';
import Button from '../../components/ui/Button';
import { usePermissions } from '../../hooks/usePermissions';
import TimelineTable from '../../components/evaluation/TimelineTable';
import TimelineModal from '../../components/evaluation/TimelineModal';
import { supabase } from '../../services/supabaseClient';

const Timelines: React.FC = () => {
  const { can } = usePermissions();
  const canManage = can('Evaluation', Permission.Manage);
  const canView = can('Evaluation', Permission.View);

  const [timelines, setTimelines] = useState<EvaluationTimeline[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedTimeline, setSelectedTimeline] = useState<EvaluationTimeline | null>(null);

  const loadTimelines = async () => {
    setError(null);
    const { data, error } = await supabase.from('evaluation_timelines').select('*').order('rollout_date', { ascending: false });
    if (error) {
      setError(error.message);
      setTimelines([]);
      return;
    }
    setTimelines((data || []).map((t:any)=>({
      id: t.id,
      businessUnitId: t.business_unit_id || '',
      name: t.name,
      type: t.type,
      rolloutDate: t.rollout_date ? new Date(t.rollout_date) : new Date(),
      endDate: t.end_date ? new Date(t.end_date) : undefined,
      status: t.status || 'Active',
    } as EvaluationTimeline)));
  };

  useEffect(() => {
    loadTimelines();
  }, []);

  const filteredTimelines = useMemo(() => {
    return timelines;
  }, [timelines]);

  const handleOpenModal = (timeline: EvaluationTimeline | null) => {
    setSelectedTimeline(timeline);
    setIsModalOpen(true);
  };

  const handleSave = async (timelineToSave: EvaluationTimeline) => {
    setError(null);
    if (timelineToSave.id) {
        const { error: err } = await supabase.from('evaluation_timelines').update({
          name: timelineToSave.name,
          type: timelineToSave.type,
          rollout_date: timelineToSave.rolloutDate.toISOString(),
          end_date: timelineToSave.endDate ? timelineToSave.endDate.toISOString() : null,
          status: timelineToSave.status || null,
        }).eq('id', timelineToSave.id);
        if (err) { setError(err.message); return; }
    } else {
        const { error: err } = await supabase.from('evaluation_timelines').insert({
          name: timelineToSave.name,
          type: timelineToSave.type,
          rollout_date: timelineToSave.rolloutDate.toISOString(),
          end_date: timelineToSave.endDate ? timelineToSave.endDate.toISOString() : null,
          status: timelineToSave.status || null,
        });
        if (err) { setError(err.message); return; }
    }
    setIsModalOpen(false);
    setSelectedTimeline(null);
    await loadTimelines();
  };

  const handleDelete = async (timelineId: string) => {
    if (window.confirm('Are you sure you want to delete this timeline?')) {
        const { error: err } = await supabase.from('evaluation_timelines').delete().eq('id', timelineId);
        if (err) { setError(err.message); return; }
        await loadTimelines();
    }
  };

  return (
    <div className="space-y-6">
      {!canView && (
        <Card>
          <div className="p-6 text-center text-gray-600 dark:text-gray-300">
            You do not have permission to view timelines.
          </div>
        </Card>
      )}
      {canView && (
      <>
      <div className="flex justify-between items-start">
        <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Evaluation Timelines</h1>
            <p className="text-gray-600 dark:text-gray-400 mt-1">Define and schedule your review cycles — set rollout dates, deadlines, and frequency for each evaluation period.</p>
        </div>
        {canManage && (
            <Button onClick={() => handleOpenModal(null)}>Create New Timeline</Button>
        )}
      </div>
      {error && <div className="text-sm text-red-600 dark:text-red-400">{error}</div>}
      
      <Card title="Manage Review Cycles">
        <TimelineTable 
            timelines={filteredTimelines}
            onEdit={handleOpenModal}
            onDelete={handleDelete}
        />
      </Card>

      {canManage && (
        <TimelineModal
            isOpen={isModalOpen}
            onClose={() => setIsModalOpen(false)}
            timeline={selectedTimeline}
            onSave={handleSave}
        />
      )}
      </>
      )}
    </div>
  );
};

export default Timelines;
