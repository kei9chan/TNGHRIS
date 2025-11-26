import React, { useState, useMemo } from 'react';
import Card from '../../components/ui/Card';
import { EvaluationTimeline, Permission } from '../../types';
import { mockEvaluationTimelines } from '../../services/mockData';
import Button from '../../components/ui/Button';
import { usePermissions } from '../../hooks/usePermissions';
import TimelineTable from '../../components/evaluation/TimelineTable';
import TimelineModal from '../../components/evaluation/TimelineModal';

const Timelines: React.FC = () => {
  const { can } = usePermissions();
  const canManage = can('Evaluation', Permission.Manage);

  const [timelines, setTimelines] = useState<EvaluationTimeline[]>(mockEvaluationTimelines);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedTimeline, setSelectedTimeline] = useState<EvaluationTimeline | null>(null);

  const filteredTimelines = useMemo(() => {
    return timelines;
  }, [timelines]);

  const handleOpenModal = (timeline: EvaluationTimeline | null) => {
    setSelectedTimeline(timeline);
    setIsModalOpen(true);
  };

  const handleSave = (timelineToSave: EvaluationTimeline) => {
    if (timelineToSave.id) {
        setTimelines(prev => prev.map(t => t.id === timelineToSave.id ? timelineToSave : t));
    } else {
        const newTimeline: EvaluationTimeline = {
            ...timelineToSave,
            id: `tl-${Date.now()}`,
        };
        setTimelines(prev => [...prev, newTimeline]);
        // Update mock data so it's available in other pages
        mockEvaluationTimelines.push(newTimeline);
    }
    setIsModalOpen(false);
  };

  const handleDelete = (timelineId: string) => {
    if (window.confirm('Are you sure you want to delete this timeline?')) {
        setTimelines(prev => prev.filter(t => t.id !== timelineId));
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-start">
        <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Evaluation Timelines</h1>
            <p className="text-gray-600 dark:text-gray-400 mt-1">Define and schedule your review cycles — set rollout dates, deadlines, and frequency for each evaluation period.</p>
        </div>
        {canManage && (
            <Button onClick={() => handleOpenModal(null)}>Create New Timeline</Button>
        )}
      </div>
      
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
    </div>
  );
};

export default Timelines;
