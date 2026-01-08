import React, { useState, useRef, useEffect } from 'react';
import { PipelineStage } from '../../types';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import { supabase } from '../../services/supabaseClient';
import { usePermissions } from '../../hooks/usePermissions';
import { Permission } from '../../types';

// Icons
const GrabHandleIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-gray-400 cursor-grab active:cursor-grabbing" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg>;
const LockClosedIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>;
const TrashIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>;

const Pipeline: React.FC = () => {
    const { can } = usePermissions();
    const canManage = can('Pipeline', Permission.Manage);
    const canView = can('Pipeline', Permission.View);

    const [stages, setStages] = useState<PipelineStage[]>([]);
    const [newStageName, setNewStageName] = useState('');
    const [showSuccess, setShowSuccess] = useState(false);
    const [loading, setLoading] = useState(false);

    const dragItem = useRef<number | null>(null);
    const dragOverItem = useRef<number | null>(null);

    const loadStages = async () => {
        setLoading(true);
        try {
            const { data, error } = await supabase
                .from('pipeline_stages')
                .select('*')
                .order('sort_order', { ascending: true });
            if (error) throw error;
            const mapped = (data || []).map((row: any) => ({
                id: row.id,
                name: row.name,
                isLocked: !!row.is_locked,
                sort_order: row.sort_order,
                code: row.code,
            }));
            setStages(mapped);
        } catch (err) {
            console.error('Failed to load pipeline stages', err);
            setStages([]);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadStages();
    }, []);

    // For now, case count requires IRs; if not available, display 0
    const getCaseCountForStage = (_stageId: string) => {
        return 0;
    };

    const handleStageNameChange = (index: number, newName: string) => {
        const newStages = [...stages];
        newStages[index].name = newName;
        setStages(newStages);
    };
    
    const handleAddNewStage = () => {
        if (newStageName.trim()) {
            const newSort = stages.length ? Math.max(...stages.map(s => s.sort_order || 0)) + 1 : 1;
            const newStage: PipelineStage = {
                id: `temp-${Date.now()}`,
                name: newStageName.trim(),
                isLocked: false,
                sort_order: newSort,
            };
            setStages(prev => [...prev, newStage]);
            setNewStageName('');
        }
    };
    
    const handleDeleteStage = async (index: number) => {
        const stageToDelete = stages[index];
        try {
            // Remove locally
            setStages(prev => prev.filter((_, i) => i !== index));
            // Remove from DB if persisted
            if (!stageToDelete.id.startsWith('temp-')) {
                const { error } = await supabase
                    .from('pipeline_stages')
                    .delete()
                    .eq('id', stageToDelete.id);
                if (error) throw error;
                await loadStages();
            }
        } catch (err) {
            console.error('Failed to delete stage', err);
            alert('Failed to delete stage. Please try again.');
        }
    };
    
    const handleDragSort = () => {
        if (dragItem.current === null || dragOverItem.current === null) return;
        const newStages = [...stages];
        const draggedItemContent = newStages.splice(dragItem.current, 1)[0];
        newStages.splice(dragOverItem.current, 0, draggedItemContent);
        dragItem.current = null;
        dragOverItem.current = null;
        setStages(newStages);
    };

    const handleSaveChanges = async () => {
        if (!canManage) {
            alert('You do not have permission to update the pipeline.');
            return;
        }
        try {
            setShowSuccess(true);
            // Build payloads with sort_order preserved by current array order
            const withOrder = stages.map((s, idx) => ({
                id: s.id && s.id.startsWith('temp-') ? null : s.id,
                name: s.name,
                is_locked: s.isLocked || false,
                sort_order: idx + 1,
                code: s.code || null,
            }));

            const newStages = withOrder.filter(s => !s.id).map(s => ({
                name: s.name,
                is_locked: s.is_locked,
                sort_order: s.sort_order,
                code: s.code,
            }));

            const existingStages = withOrder.filter(s => typeof s.id === 'string');

            if (newStages.length) {
                const { error: insertError } = await supabase.from('pipeline_stages').insert(newStages);
                if (insertError) throw insertError;
            }

            if (existingStages.length) {
                const { error: upsertError } = await supabase
                    .from('pipeline_stages')
                    .upsert(existingStages, { onConflict: 'id' });
                if (upsertError) throw upsertError;
            }

            // Deletion is handled explicitly via the delete button; avoid bulk delete here to prevent accidental removals.

            await loadStages();
            setTimeout(() => setShowSuccess(false), 1500);
        } catch (err) {
            console.error('Failed to save pipeline stages', err);
            alert('Failed to save changes. Please try again.');
            setShowSuccess(false);
        }
    };

    if (!canView) {
        return (
            <div className="p-6">
                <Card>
                    <div className="p-6 text-center text-gray-600 dark:text-gray-300">
                        You do not have permission to view Pipeline Management.
                    </div>
                </Card>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Pipeline Management</h1>
                 <Button onClick={handleSaveChanges} isLoading={showSuccess} disabled={loading || !canManage}>
                    {showSuccess ? 'Saved!' : 'Save Changes'}
                </Button>
            </div>

            <Card>
                <p className="text-gray-600 dark:text-gray-400 mb-4">
                    Add, edit, reorder, and delete the stages for the disciplinary case pipeline. Drag and drop stages to reorder them.
                </p>
                <div className="space-y-2">
                    {loading && <div className="text-sm text-gray-500 dark:text-gray-400">Loading stages...</div>}
                    {!loading && stages.map((stage, index) => {
                        const caseCount = getCaseCountForStage(stage.id);

                        return (
                             <div 
                                key={stage.id} 
                                className="flex items-center space-x-2 p-2 bg-gray-50 dark:bg-gray-800 rounded-md"
                                draggable={!stage.isLocked}
                                onDragStart={() => dragItem.current = index}
                                onDragEnter={() => dragOverItem.current = index}
                                onDragEnd={handleDragSort}
                                onDragOver={(e) => e.preventDefault()}
                            >
                                <span className={stage.isLocked ? 'cursor-not-allowed' : 'cursor-grab'}><GrabHandleIcon /></span>
                                <Input 
                                    label="" 
                                    id={`stage-${stage.id}`} 
                                    value={stage.name} 
                                    onChange={e => handleStageNameChange(index, e.target.value)}
                                    className="flex-grow"
                                    disabled={stage.isLocked || !canManage}
                                />
                                {caseCount > 0 && <span className="text-xs text-gray-500">{caseCount} cases</span>}
                                <Button 
                                    variant="danger" 
                                    size="sm" 
                                    onClick={() => handleDeleteStage(index)} 
                                    disabled={!canManage}
                                    title="Delete Stage"
                                >
                                    <TrashIcon />
                                </Button>
                            </div>
                        )
                    })}
                </div>
                 <div className="mt-6 pt-4 border-t dark:border-gray-700">
                    <h3 className="font-semibold mb-2">Add New Stage</h3>
                    <div className="flex items-center space-x-2">
                        <Input 
                            label=""
                            id="new-stage"
                            placeholder="Enter new stage name"
                            value={newStageName}
                            onChange={e => setNewStageName(e.target.value)}
                            className="flex-grow"
                            disabled={!canManage}
                        />
                        <Button onClick={handleAddNewStage} disabled={!canManage}>Add</Button>
                    </div>
                </div>
            </Card>
        </div>
    );
};

export default Pipeline;
