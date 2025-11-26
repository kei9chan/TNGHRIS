
import React, { useState, useEffect, useMemo } from 'react';
import { OnboardingChecklistTemplate, User, OnboardingChecklist, Role } from '../../types';
import { mockUsers, mockOnboardingTemplates, mockOnboardingChecklists } from '../../services/mockData';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import { useAuth } from '../../hooks/useAuth';
import EmployeeMultiSelect from '../feedback/EmployeeMultiSelect';

interface AssignOnboardingModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: { employeeIds: string[]; templateId: string; startDate: Date; notify: boolean }) => void;
  // FIX: Added optional `employeeId` prop to allow single-user assignment mode.
  employeeId?: string;
}

const AssignOnboardingModal: React.FC<AssignOnboardingModalProps> = ({ isOpen, onClose, onSave, employeeId }) => {
  const { user } = useAuth();
  const [selectedUsers, setSelectedUsers] = useState<User[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [notify, setNotify] = useState(true);

  const assignableUsers = useMemo(() => {
    const assignedEmployeeIds = new Set(mockOnboardingChecklists.map(c => c.employeeId));
    
    let usersPool: User[] = [];
    if (!user) return [];
    
    // Updated to include HRStaff
    if (user.role === Role.Admin || user.role === Role.HRManager || user.role === Role.HRStaff) {
      usersPool = mockUsers.filter(u => u.status === 'Active');
    } else if (user.role === Role.Manager) {
      usersPool = mockUsers.filter(u => u.managerId === user.id && u.status === 'Active');
    }
    
    return usersPool.filter(u => !assignedEmployeeIds.has(u.id));
  }, [user]);

  useEffect(() => {
    if (isOpen) {
      if (employeeId) {
          const userToAssign = mockUsers.find(u => u.id === employeeId);
          setSelectedUsers(userToAssign ? [userToAssign] : []);
      } else {
          setSelectedUsers([]);
      }
      setSelectedTemplateId(mockOnboardingTemplates[0]?.id || '');
      setStartDate(new Date().toISOString().split('T')[0]);
      setNotify(true);
    }
  }, [isOpen, employeeId]);

  const handleSave = () => {
    if (selectedUsers.length === 0 || !selectedTemplateId || !startDate) {
        alert('Please select at least one employee, a template, and a start date.');
        return;
    }
    onSave({
      employeeIds: selectedUsers.map(u => u.id),
      templateId: selectedTemplateId,
      startDate: new Date(startDate),
      notify,
    });
  };
  
  const footer = (
    <div className="flex justify-end w-full space-x-2">
      <Button variant="secondary" onClick={onClose}>Cancel</Button>
      <Button onClick={handleSave} disabled={selectedUsers.length === 0 || !selectedTemplateId}>
        {`Assign to ${selectedUsers.length > 0 ? selectedUsers.length : ''} Employee(s)`}
      </Button>
    </div>
  );

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Assign Lifecycle Checklist" footer={footer}>
      <div className="space-y-4">
        {employeeId ? (
            <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Assigning to:</label>
                <p className="mt-1 text-lg font-semibold text-gray-900 dark:text-white">{selectedUsers[0]?.name}</p>
            </div>
        ) : (
            <EmployeeMultiSelect
              label="Employee(s)"
              allUsers={assignableUsers}
              selectedUsers={selectedUsers}
              onSelectionChange={setSelectedUsers}
            />
        )}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Lifecycle Template</label>
          <select value={selectedTemplateId} onChange={e => setSelectedTemplateId(e.target.value)} required className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-white">
            {mockOnboardingTemplates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Start Date</label>
          <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} required className="mt-1 block w-full pl-3 pr-2 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-white"/>
        </div>
        <div className="flex items-center">
          <input id="notify" name="notify" type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded" />
          <label htmlFor="notify" className="ml-2 block text-sm text-gray-900 dark:text-gray-300">
            Notify employee(s) upon assignment
          </label>
        </div>
      </div>
    </Modal>
  );
};

export default AssignOnboardingModal;
