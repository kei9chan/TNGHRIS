import React, { useState, useEffect, useRef, useMemo } from 'react';
import { OnboardingChecklistTemplate, OnboardingTaskTemplate, Role, OnboardingTaskType, Asset, AssetStatus } from '../../types';
import Modal from '../ui/Modal';
import Input from '../ui/Input';
import Textarea from '../ui/Textarea';
import Button from '../ui/Button';
import { mockUsers, mockAssets } from '../../services/mockData';

// Icons
const PlusIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" /></svg>;
const TrashIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>;
const CloneIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>;
const GrabHandleIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-gray-400 cursor-grab" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" /></svg>;


interface OnboardingTemplateModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (template: OnboardingChecklistTemplate) => void;
  template: OnboardingChecklistTemplate | null;
}

const allRoles = Object.values(Role);

const OnboardingTemplateModal: React.FC<OnboardingTemplateModalProps> = ({ isOpen, onClose, onSave, template }) => {
  const [data, setData] = useState<Partial<OnboardingChecklistTemplate>>({});
  const dragItem = useRef<number | null>(null);
  const dragOverItem = useRef<number | null>(null);

  const [assetSearchTerms, setAssetSearchTerms] = useState<Record<string, string>>({});
  const [openAssetSearch, setOpenAssetSearch] = useState<string | null>(null);

  const availableAssets = useMemo(() => mockAssets.filter(a => a.status === AssetStatus.Available), []);
  const allAssets = useMemo(() => mockAssets, []);

  useEffect(() => {
    const defaultTasks = template?.tasks.map(t => ({...t, dueDateType: t.dueDateType || 'hire'})) || [];
    if(template) {
        setData({...template, tasks: defaultTasks});
        const initialSearchTerms: Record<string, string> = {};
        template.tasks.forEach(task => {
            if (task.assetId) {
                const asset = mockAssets.find(a => a.id === task.assetId);
                if (asset) {
                    initialSearchTerms[task.id] = `${asset.assetTag} - ${asset.name}`;
                }
            } else if (task.assetDescription) {
                // If it's a manual description and not an ID-based one
                 initialSearchTerms[task.id] = task.assetDescription;
            }
        });
        setAssetSearchTerms(initialSearchTerms);
    } else {
        setData({ name: '', targetRole: Role.Employee, tasks: [], templateType: 'Onboarding' });
        setAssetSearchTerms({});
    }
    setOpenAssetSearch(null); // Reset open dropdown on modal open/close
  }, [template, isOpen]);

  const handleTemplateChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setData(prev => ({ ...prev, [name]: value }));
  };
  
  const handleTaskChange = (index: number, field: keyof OnboardingTaskTemplate, value: string | number | boolean | undefined) => {
    const newTasks = [...(data.tasks || [])];
    if (value === undefined) {
        delete (newTasks[index] as any)[field];
    } else {
        (newTasks[index] as any)[field] = value;
    }
    setData(prev => ({ ...prev, tasks: newTasks }));
  };

  const handleAddTask = () => {
    const newTask: OnboardingTaskTemplate = {
      id: `task-${Date.now()}`,
      name: '',
      description: '',
      ownerRole: Role.Manager,
      dueDays: 0,
      dueDateType: 'hire',
      taskType: OnboardingTaskType.Read,
      points: 10,
      requiresApproval: false,
    };
    setData(prev => ({ ...prev, tasks: [...(prev.tasks || []), newTask] }));
  };

  const handleRemoveTask = (index: number) => {
    setData(prev => ({ ...prev, tasks: prev.tasks?.filter((_, i) => i !== index) }));
  };
  
  const handleCloneTask = (index: number) => {
      const originalTask = data.tasks?.[index];
      if (!originalTask) return;
      const clonedTask: OnboardingTaskTemplate = {
          ...JSON.parse(JSON.stringify(originalTask)),
          id: `task-${Date.now()}`,
          name: `${originalTask.name} (Copy)`,
      };
      const newTasks = [...(data.tasks || [])];
      newTasks.splice(index + 1, 0, clonedTask);
      setData(prev => ({ ...prev, tasks: newTasks }));
  };

  const handleDragSort = () => {
    if (dragItem.current === null || dragOverItem.current === null) return;
    const newTasks = [...(data.tasks || [])];
    const draggedItemContent = newTasks.splice(dragItem.current, 1)[0];
    newTasks.splice(dragOverItem.current, 0, draggedItemContent);
    dragItem.current = null;
    dragOverItem.current = null;
    setData(prev => ({...prev, tasks: newTasks}));
  };

    const handleSearchChange = (taskId: string, value: string, taskIndex: number) => {
        setAssetSearchTerms(prev => ({ ...prev, [taskId]: value }));
        if (value === '') {
            handleTaskChange(taskIndex, 'assetId', '');
            handleTaskChange(taskIndex, 'assetDescription', '');
        }
        setOpenAssetSearch(taskId);
    };

    const handleSelectAsset = (taskIndex: number, taskId: string, asset: Asset) => {
        handleTaskChange(taskIndex, 'assetId', asset.id);
        const description = `${asset.assetTag} - ${asset.name}`;
        handleTaskChange(taskIndex, 'assetDescription', description);
        setAssetSearchTerms(prev => ({
            ...prev,
            [taskId]: description
        }));
        setOpenAssetSearch(null);
    };
    
    const handleToggleAutoAsset = (index: number, isAuto: boolean) => {
        if (isAuto) {
             // Clear specific asset selection to enable auto mode
             handleTaskChange(index, 'assetId', '');
             handleTaskChange(index, 'assetDescription', '');
             // Clear search term
             const task = data.tasks?.[index];
             if (task) setAssetSearchTerms(prev => ({ ...prev, [task.id]: '' }));
        } else {
             // Switching to specific mode - no action needed, user will type in input
        }
    };

  const handleSave = () => {
    if (data.name && data.targetRole && data.tasks) {
      onSave(data as OnboardingChecklistTemplate);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={template?.id ? "Edit Lifecycle Template" : "Create Lifecycle Template"}
      footer={
        <div className="flex justify-end w-full space-x-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave}>Save Template</Button>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="md:col-span-1">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Template Type</label>
            <select name="templateType" value={data.templateType || 'Onboarding'} onChange={handleTemplateChange} className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-white">
                <option value="Onboarding">Onboarding</option>
                <option value="Offboarding">Offboarding</option>
            </select>
          </div>
          <div className="md:col-span-2">
            <Input label="Template Name" name="name" value={data.name || ''} onChange={handleTemplateChange} required />
          </div>
          <div className="md:col-span-3">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Target Role</label>
            <select name="targetRole" value={data.targetRole || ''} onChange={handleTemplateChange} className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-white">
              {allRoles.map(role => <option key={role} value={role}>{role}</option>)}
            </select>
          </div>
        </div>
        
        <div className="pt-4 border-t dark:border-gray-600">
          <h3 className="text-lg font-medium text-gray-900 dark:text-white">Tasks</h3>
          <div className="space-y-4 mt-2 max-h-[50vh] overflow-y-auto pr-2">
            {(data.tasks || []).map((task, index) => {
              const isAssignAsset = task.taskType === OnboardingTaskType.AssignAsset;
              const isReturnAsset = task.taskType === OnboardingTaskType.ReturnAsset;
              
              const isAutoReturn = isReturnAsset && !task.assetId && !task.assetDescription;

              const assetPool = isAssignAsset ? availableAssets : allAssets;
              const currentSearchTerm = (assetSearchTerms[task.id] || '').toLowerCase();
              const filteredAssetPool = currentSearchTerm
                ? assetPool.filter(asset =>
                    asset.name.toLowerCase().includes(currentSearchTerm) ||
                    asset.assetTag.toLowerCase().includes(currentSearchTerm)
                  )
                : assetPool;

              return (
              <div 
                key={task.id} 
                className="p-4 border rounded-md dark:border-gray-600 bg-gray-50 dark:bg-gray-900/50 relative"
                draggable
                onDragStart={() => dragItem.current = index}
                onDragEnter={() => dragOverItem.current = index}
                onDragEnd={handleDragSort}
                onDragOver={(e) => e.preventDefault()}
              >
                 <div className="absolute top-3 left-2 flex items-center">
                    <GrabHandleIcon />
                 </div>
                 <div className="absolute top-2 right-2 flex space-x-1">
                    <Button variant="secondary" size="sm" className="!p-1" title="Clone Task" onClick={() => handleCloneTask(index)}><CloneIcon/></Button>
                    <Button variant="danger" size="sm" className="!p-1" title="Delete Task" onClick={() => handleRemoveTask(index)}><TrashIcon/></Button>
                 </div>
                 <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pl-6">
                    <div className="md:col-span-2">
                        <Input label="Task Name" value={task.name} onChange={(e) => handleTaskChange(index, 'name', e.target.value)} />
                    </div>
                    <Input label="Points" type="number" value={task.points} onChange={(e) => handleTaskChange(index, 'points', Number(e.target.value))} />
                 </div>
                 <div className="mt-2 pl-6">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Task Type</label>
                    <select value={task.taskType} onChange={(e) => handleTaskChange(index, 'taskType', e.target.value as OnboardingTaskType)} className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-white">
                        {Object.values(OnboardingTaskType).map(type => <option key={type} value={type}>{type}</option>)}
                    </select>
                </div>
                
                {task.taskType === OnboardingTaskType.Video && (
                    <div className="mt-2 pl-6">
                        <Input label="YouTube Video URL" value={task.videoUrl || ''} onChange={(e) => handleTaskChange(index, 'videoUrl', e.target.value)} />
                    </div>
                )}
                
                {task.taskType === OnboardingTaskType.Read && (
                    <div className="mt-2 pl-6">
                        <Textarea label="Content to Read (Markdown supported)" value={task.readContent || ''} onChange={(e) => handleTaskChange(index, 'readContent', e.target.value)} rows={4} />
                    </div>
                )}

                {/* RETURN ASSET UI */}
                {isReturnAsset && (
                     <div className="mt-2 pl-6 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800 rounded-md">
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Asset Target</label>
                        <div className="flex items-center space-x-4 mb-3">
                            <label className="flex items-center cursor-pointer">
                                <input 
                                    type="radio" 
                                    checked={isAutoReturn} 
                                    onChange={() => handleToggleAutoAsset(index, true)} 
                                    className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300"
                                />
                                <span className="ml-2 text-sm text-gray-900 dark:text-gray-200">Auto-detect Assigned Assets</span>
                            </label>
                             <label className="flex items-center cursor-pointer">
                                <input 
                                    type="radio" 
                                    checked={!isAutoReturn} 
                                    onChange={() => handleToggleAutoAsset(index, false)} 
                                    className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300"
                                />
                                <span className="ml-2 text-sm text-gray-900 dark:text-gray-200">Specific Asset</span>
                            </label>
                        </div>
                        {isAutoReturn ? (
                            <p className="text-xs text-gray-500 dark:text-gray-400 italic">
                                The system will automatically find all assets assigned to the employee and create a separate return task for each one.
                            </p>
                        ) : (
                             <div className="space-y-2">
                                <div>
                                    <label htmlFor={`asset-search-${task.id}`} className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                                        Select Asset or Type Description
                                    </label>
                                    <div className="relative">
                                        <Input
                                            label=""
                                            id={`asset-search-${task.id}`}
                                            value={assetSearchTerms[task.id] || ''}
                                            onChange={(e) => handleSearchChange(task.id, e.target.value, index)}
                                            onFocus={() => setOpenAssetSearch(task.id)}
                                            onBlur={() => setTimeout(() => setOpenAssetSearch(null), 150)}
                                            placeholder="Search by tag, name, or type description..."
                                            autoComplete="off"
                                        />
                                        {openAssetSearch === task.id && filteredAssetPool.length > 0 && (
                                            <div className="absolute z-20 w-full mt-1 bg-white dark:bg-slate-800 border border-gray-300 dark:border-slate-600 rounded-md shadow-lg max-h-60 overflow-auto">
                                                {filteredAssetPool.map(asset => (
                                                    <div
                                                        key={asset.id}
                                                        onClick={() => handleSelectAsset(index, task.id, asset)}
                                                        className="px-4 py-2 hover:bg-gray-100 dark:hover:bg-slate-700 cursor-pointer"
                                                    >
                                                        <p className="text-sm font-medium">{asset.assetTag} - {asset.name}</p>
                                                        <p className="text-xs text-gray-500">{asset.type} - {asset.status}</p>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </div>
                                <p className="text-xs text-gray-500 dark:text-gray-400">
                                    If an asset ID is not selected, the text above will be used as a manual description.
                                </p>
                             </div>
                        )}
                     </div>
                )}

                {/* ASSIGN ASSET UI */}
                {isAssignAsset && (
                    <div className="mt-2 pl-6 space-y-2">
                        <div>
                            <label htmlFor={`asset-search-${task.id}`} className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                                Asset to Assign
                            </label>
                            <div className="relative">
                                <Input
                                    label=""
                                    id={`asset-search-${task.id}`}
                                    value={assetSearchTerms[task.id] || ''}
                                    onChange={(e) => handleSearchChange(task.id, e.target.value, index)}
                                    onFocus={() => setOpenAssetSearch(task.id)}
                                    onBlur={() => setTimeout(() => setOpenAssetSearch(null), 150)}
                                    placeholder="Search by tag or name..."
                                    autoComplete="off"
                                />
                                {openAssetSearch === task.id && (
                                    <div className="absolute z-20 w-full mt-1 bg-white dark:bg-slate-800 border border-gray-300 dark:border-slate-600 rounded-md shadow-lg max-h-60 overflow-auto">
                                        {filteredAssetPool.length > 0 ? (
                                            filteredAssetPool.map(asset => (
                                                <div
                                                    key={asset.id}
                                                    onClick={() => handleSelectAsset(index, task.id, asset)}
                                                    className="px-4 py-2 hover:bg-gray-100 dark:hover:bg-slate-700 cursor-pointer"
                                                >
                                                    <p className="text-sm font-medium">{asset.assetTag} - {asset.name}</p>
                                                    <p className="text-xs text-gray-500">{asset.type} - {asset.status}</p>
                                                </div>
                                            ))
                                        ) : (
                                            <div className="px-4 py-2 text-sm text-gray-500">No available assets found matching search.</div>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>

                        {!task.assetId && (
                            <>
                                <p className="text-xs text-center text-gray-500">- OR -</p>
                                <Input
                                    label="Manually Specify Asset Description"
                                    id={`asset-desc-${task.id}`}
                                    value={task.assetDescription || ''}
                                    onChange={(e) => handleTaskChange(index, 'assetDescription', e.target.value)}
                                    placeholder="e.g., Company ID Card"
                                />
                            </>
                        )}
                    </div>
                )}

                 <div className="mt-2 pl-6">
                    <Textarea label="Task Description" value={task.description} onChange={(e) => handleTaskChange(index, 'description', e.target.value)} rows={2} />
                 </div>
                 <div className="mt-2 pl-6 grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Due Date Trigger</label>
                        <div className="mt-1 flex space-x-4">
                            <div className="flex items-center">
                                <input id={`hire-${index}`} name={`dueDateType-${index}`} type="radio" value="hire" checked={task.dueDateType === 'hire'} onChange={() => handleTaskChange(index, 'dueDateType', 'hire')} className="h-4 w-4 text-indigo-600 border-gray-300 rounded"/>
                                <label htmlFor={`hire-${index}`} className="ml-2 text-sm">After Hire Date</label>
                            </div>
                            <div className="flex items-center">
                                <input id={`resignation-${index}`} name={`dueDateType-${index}`} type="radio" value="resignation" checked={task.dueDateType === 'resignation'} onChange={() => handleTaskChange(index, 'dueDateType', 'resignation')} className="h-4 w-4 text-indigo-600 border-gray-300 rounded"/>
                                <label htmlFor={`resignation-${index}`} className="ml-2 text-sm">After Resignation Date</label>
                            </div>
                        </div>
                    </div>
                    <Input 
                        label={task.dueDateType === 'resignation' ? 'Due Days After Resignation' : 'Due Days After Hire'}
                        type="number" 
                        value={task.dueDays} 
                        onChange={(e) => handleTaskChange(index, 'dueDays', Number(e.target.value))} 
                    />
                </div>

                 <div className="mt-2 pl-6">
                    <label className="block text-sm font-medium">Assign To</label>
                    <div className="mt-1 flex space-x-4">
                        <div className="flex items-center">
                            <input id={`assign-role-${index}`} type="radio" checked={!task.ownerUserId} onChange={() => handleTaskChange(index, 'ownerUserId', undefined)} className="h-4 w-4 text-indigo-600 border-gray-300 rounded"/>
                            <label htmlFor={`assign-role-${index}`} className="ml-2 text-sm">Role</label>
                        </div>
                        <div className="flex items-center">
                            <input id={`assign-user-${index}`} type="radio" checked={!!task.ownerUserId} onChange={() => handleTaskChange(index, 'ownerUserId', '')} className="h-4 w-4 text-indigo-600 border-gray-300 rounded"/>
                            <label htmlFor={`assign-user-${index}`} className="ml-2 text-sm">Specific User</label>
                        </div>
                    </div>
                </div>

                 <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-2 pl-6">
                    { task.ownerUserId === undefined ? (
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Owner Role</label>
                            <select value={task.ownerRole} onChange={(e) => handleTaskChange(index, 'ownerRole', e.target.value as Role)} className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-white">
                                {allRoles.map(role => <option key={role} value={role}>{role}</option>)}
                            </select>
                        </div>
                    ) : (
                         <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Specific Owner</label>
                            <select value={task.ownerUserId || ''} onChange={(e) => handleTaskChange(index, 'ownerUserId', e.target.value)} className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-white">
                                <option value="">-- Select a user --</option>
                                {mockUsers.map(user => <option key={user.id} value={user.id}>{user.name}</option>)}
                            </select>
                        </div>
                    )}
                </div>
                <div className="flex items-center mt-3 pl-6">
                    <input type="checkbox" id={`requires-approval-${index}`} checked={!!task.requiresApproval} onChange={(e) => handleTaskChange(index, 'requiresApproval', e.target.checked)} className="h-4 w-4 text-indigo-600 border-gray-300 rounded"/>
                    <label htmlFor={`requires-approval-${index}`} className="ml-2 text-sm text-gray-700 dark:text-gray-300">Requires Approval</label>
                </div>
              </div>
            )})}
          </div>
          <Button variant="secondary" onClick={handleAddTask} className="mt-4"><PlusIcon />Add Task</Button>
        </div>
      </div>
    </Modal>
  );
};

export default OnboardingTemplateModal;