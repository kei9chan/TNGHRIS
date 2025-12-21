
import React, { useState, useEffect, useMemo } from 'react';
import { OnboardingChecklistTemplate, User, Role } from '../../types';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import { useAuth } from '../../hooks/useAuth';
import EmployeeMultiSelect from '../feedback/EmployeeMultiSelect';
import { supabase } from '../../services/supabaseClient';

interface AssignOnboardingModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: { employeeIds: string[]; templateId: string; startDate: Date; notify: boolean }) => void;
  employeeId?: string;
  employees?: User[];
  templates?: OnboardingChecklistTemplate[];
}

const AssignOnboardingModal: React.FC<AssignOnboardingModalProps> = ({ isOpen, onClose, onSave, employeeId, employees: employeesProp, templates: templatesProp }) => {
  const { user } = useAuth();
  const [selectedUsers, setSelectedUsers] = useState<User[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [notify, setNotify] = useState(true);
  const [employees, setEmployees] = useState<User[]>(employeesProp || []);
  const [templates, setTemplates] = useState<OnboardingChecklistTemplate[]>(templatesProp || []);
  const [loading, setLoading] = useState(false);

  const assignableUsers = useMemo(() => {
    if (!user) return [];
    if (employeeId) {
      return employees.filter(u => u.id === employeeId);
    }
    return employees.filter(u => !u.status || u.status === 'Active');
  }, [employees, user, employeeId]);

  const fetchEmployeesAndTemplates = async () => {
    if (!isOpen) return;
    if (employeesProp && templatesProp) {
      setEmployees(employeesProp);
      setTemplates(templatesProp);
      setSelectedTemplateId(templatesProp[0]?.id || '');
      return;
    }
    try {
      setLoading(true);
      const [{ data: employeeRows, error: empError }, { data: templateRows, error: tmplError }] = await Promise.all([
        supabase.from('hris_users').select('id, full_name, role, status').eq('status', 'Active'),
        supabase.from('onboarding_checklist_templates').select('id, name, target_role, template_type, tasks'),
      ]);

      if (empError) throw empError;
      if (tmplError) throw tmplError;

      const mappedEmployees: User[] =
        employeeRows?.map((r: any) => ({
          id: r.id,
          name: r.full_name,
          role: (r.role as Role) || Role.Employee,
          status: r.status || 'Active',
        })) || [];
      setEmployees(mappedEmployees);

      const mappedTemplates: OnboardingChecklistTemplate[] =
        templateRows?.map((t: any) => ({
          id: t.id,
          name: t.name,
          targetRole: (t.target_role as Role) || Role.Employee,
          templateType: t.template_type || 'Onboarding',
          tasks: Array.isArray(t.tasks) ? t.tasks : [],
        })) || [];
      setTemplates(mappedTemplates);
      setSelectedTemplateId((mappedTemplates[0]?.id || templatesProp?.[0]?.id) ?? '');
    } catch (err) {
      console.error('Failed to load onboarding modal data', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEmployeesAndTemplates();
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    if (employeeId) {
      const userToAssign = assignableUsers.find(u => u.id === employeeId);
      setSelectedUsers(userToAssign ? [userToAssign] : []);
    } else {
      setSelectedUsers([]);
    }
    setStartDate(new Date().toISOString().split('T')[0]);
    setNotify(true);
  }, [isOpen, employeeId, assignableUsers]);

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
              disabled={loading}
            />
        )}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Lifecycle Template</label>
          <select value={selectedTemplateId} onChange={e => setSelectedTemplateId(e.target.value)} required className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-white">
            {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
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
