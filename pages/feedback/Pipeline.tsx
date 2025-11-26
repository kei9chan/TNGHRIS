import React, { useState, useRef } from 'react';
import { PipelineStage } from '../../types';
import { mockPipelineStages, mockIncidentReports } from '../../services/mockData';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';

// Icons
const GrabHandleIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-gray-400 cursor-grab active:cursor-grabbing" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg>;
const LockClosedIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>;
const TrashIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>;

const Pipeline: React.FC = () => {
    const [stages, setStages] = useState<PipelineStage[]>(() => JSON.parse(JSON.stringify(mockPipelineStages)));
    const [newStageName, setNewStageName] = useState('');
    const [showSuccess, setShowSuccess] = useState(false);

    const dragItem = useRef<number | null>(null);
    const dragOverItem = useRef<number | null>(null);

    const getCaseCountForStage = (stageId: string) => {
        return mockIncidentReports.filter(r => r.pipelineStage === stageId).length;
    };

    const handleStageNameChange = (index: number, newName: string) => {
        const newStages = [...stages];
        newStages[index].name = newName;
        setStages(newStages);
    };
    
    const handleAddNewStage = () => {
        if (newStageName.trim()) {
            const newStage: PipelineStage = {
                id: `custom-${Date.now()}`,
                name: newStageName.trim(),
            };
            setStages([...stages, newStage]);
            setNewStageName('');
        }
    };
    
    const handleDeleteStage = (index: number) => {
        const stageToDelete = stages[index];
        if (stageToDelete.isLocked || getCaseCountForStage(stageToDelete.id) > 0) {
            alert("Cannot delete a locked stage or a stage that is currently in use.");
            return;
        }
        setStages(stages.filter((_, i) => i !== index));
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

    const handleSaveChanges = () => {
        // In a real app, this would be an API call. Here we mutate the mock data source.
        mockPipelineStages.length = 0;
        mockPipelineStages.push(...stages);

        setShowSuccess(true);
        setTimeout(() => setShowSuccess(false), 2000);
    };

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Pipeline Management</h1>
                 <Button onClick={handleSaveChanges} isLoading={showSuccess}>
                    {showSuccess ? 'Saved!' : 'Save Changes'}
                </Button>
            </div>

            <Card>
                <p className="text-gray-600 dark:text-gray-400 mb-4">
                    Add, edit, reorder, and delete the stages for the disciplinary case pipeline. Drag and drop stages to reorder them.
                </p>
                <div className="space-y-2">
                    {stages.map((stage, index) => {
                        const caseCount = getCaseCountForStage(stage.id);
                        const canDelete = !stage.isLocked && caseCount === 0;

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
                                    disabled={stage.isLocked}
                                />
                                {caseCount > 0 && <span className="text-xs text-gray-500">{caseCount} cases</span>}
                                {stage.isLocked ? (
                                    <LockClosedIcon />
                                ) : (
                                    <Button 
                                        variant="danger" 
                                        size="sm" 
                                        onClick={() => handleDeleteStage(index)} 
                                        disabled={!canDelete}
                                        title={canDelete ? "Delete Stage" : "Cannot delete locked stages or stages with active cases"}
                                    >
                                        <TrashIcon />
                                    </Button>
                                )}
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
                        />
                        <Button onClick={handleAddNewStage}>Add</Button>
                    </div>
                </div>
            </Card>
        </div>
    );
};

export default Pipeline;