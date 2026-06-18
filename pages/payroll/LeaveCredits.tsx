import React, { useState, useEffect } from 'react';
import { supabase } from '../../services/supabaseClient';
import { useAuth } from '../../hooks/useAuth';
import { usePermissions } from '../../hooks/usePermissions';
import { Permission } from '../../types';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import Modal from '../../components/ui/Modal';
import Toast from '../../components/ui/Toast';

interface EmployeeLeaveData {
  id: string;
  full_name: string;
  department: string;
  leave_quota_vacation: number | null;
  leave_quota_sick: number | null;
  leave_quota_offset: number | null;
}

const LeaveCredits: React.FC = () => {
  const { user } = useAuth();
  const { can } = usePermissions();
  
  const [employees, setEmployees] = useState<EmployeeLeaveData[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState<EmployeeLeaveData | null>(null);
  const [editFormData, setEditFormData] = useState({ vacation: 0, sick: 0, offset: 0 });
  
  const [isBatchModalOpen, setIsBatchModalOpen] = useState(false);
  const [batchFormData, setBatchFormData] = useState({ amount: 5.0, type: 'vacation' as 'vacation' | 'sick' | 'offset' });
  const [isBatchProcessing, setIsBatchProcessing] = useState(false);

  const [toastInfo, setToastInfo] = useState({ show: false, title: '', message: '' });

  // Only Admin, HR Manager, HR can view this page
  const canManageLeaves = user?.role === 'Admin' || user?.role === 'HR Manager' || user?.role === 'HR Staff' || can('Employees', Permission.Edit);

  const loadEmployees = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('hris_users')
      .select('id, full_name, department, leave_quota_vacation, leave_quota_sick, leave_quota_offset')
      .eq('status', 'Active')
      .order('full_name');
      
    if (!error && data) {
      setEmployees(data);
    }
    setLoading(false);
  };

  useEffect(() => {
    if (canManageLeaves) {
      loadEmployees();
    }
  }, [canManageLeaves]);

  const handleEditClick = (emp: EmployeeLeaveData) => {
    setSelectedEmployee(emp);
    setEditFormData({
      vacation: emp.leave_quota_vacation || 0,
      sick: emp.leave_quota_sick || 0,
      offset: emp.leave_quota_offset || 0
    });
    setIsEditModalOpen(true);
  };

  const handleSaveEdit = async () => {
    if (!selectedEmployee) return;
    
    const vacValue = typeof editFormData.vacation === 'string' ? parseFloat(editFormData.vacation) || 0 : editFormData.vacation;
    const sickValue = typeof editFormData.sick === 'string' ? parseFloat(editFormData.sick) || 0 : editFormData.sick;
    const offsetValue = typeof editFormData.offset === 'string' ? parseFloat(editFormData.offset) || 0 : editFormData.offset;

    const { error } = await supabase
      .from('hris_users')
      .update({
        leave_quota_vacation: vacValue,
        leave_quota_sick: sickValue,
        leave_quota_offset: offsetValue,
        leave_last_credit_date: new Date().toISOString().split('T')[0]
      })
      .eq('id', selectedEmployee.id);
      
    if (!error) {
      setToastInfo({ show: true, title: 'Success', message: 'Leave credits updated successfully.' });
      setIsEditModalOpen(false);
      loadEmployees();
    } else {
      setToastInfo({ show: true, title: 'Error', message: 'Failed to update leave credits.' });
    }
  };

  const handleBatchUpdate = async () => {
    if (!window.confirm(`Are you sure you want to add ${batchFormData.amount} ${batchFormData.type} leave credits to ALL active employees?`)) return;
    
    setIsBatchProcessing(true);
    
    try {
      // Update one by one for simplicity and safety of data.
      let successCount = 0;
      for (const emp of employees) {
        const field = batchFormData.type === 'vacation' ? 'leave_quota_vacation' : batchFormData.type === 'sick' ? 'leave_quota_sick' : 'leave_quota_offset';
        const currentAmount = emp[field] || 0;
        const addAmount = typeof batchFormData.amount === 'string' ? parseFloat(batchFormData.amount) || 0 : batchFormData.amount;
        const newAmount = currentAmount + addAmount;
        
        await supabase
          .from('hris_users')
          .update({
            [field]: newAmount,
            leave_last_credit_date: new Date().toISOString().split('T')[0]
          })
          .eq('id', emp.id);
          
        successCount++;
      }
      
      setToastInfo({ show: true, title: 'Success', message: `Added credits to ${successCount} employees.` });
      setIsBatchModalOpen(false);
      loadEmployees();
    } catch (e) {
      console.error(e);
      setToastInfo({ show: true, title: 'Error', message: 'Batch update encountered an error.' });
    } finally {
      setIsBatchProcessing(false);
    }
  };

  if (!canManageLeaves) {
    return <div className="p-6 text-gray-700 dark:text-gray-300">You do not have permission to view this page.</div>;
  }

  const filteredEmployees = employees.filter(emp => 
    (emp.full_name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
    (emp.department || '').toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <Toast 
        show={toastInfo.show} 
        onClose={() => setToastInfo(prev => ({ ...prev, show: false }))}
        title={toastInfo.title}
        message={toastInfo.message}
      />
      
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center space-y-4 sm:space-y-0">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Leave Credits Management</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">Directly add or edit employee leave quotas without needing approval.</p>
        </div>
        <Button onClick={() => setIsBatchModalOpen(true)}>
          Batch Add Credits
        </Button>
      </div>

      <Card>
        <div className="p-4 border-b border-gray-200 dark:border-gray-700">
          <Input 
            placeholder="Search by name or department..." 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="max-w-md"
          />
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead className="bg-gray-50 dark:bg-gray-800">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Employee</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Department</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Vacation Quota</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Sick Quota</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Offset Quota</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-800">
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-6 py-4 text-center text-sm text-gray-500">Loading...</td>
                </tr>
              ) : filteredEmployees.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-4 text-center text-sm text-gray-500">No employees found.</td>
                </tr>
              ) : (
                filteredEmployees.map(emp => (
                  <tr key={emp.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white">
                      {emp.full_name || 'Unnamed Employee'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                      {emp.department || '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-right text-gray-900 dark:text-white font-medium">
                      {emp.leave_quota_vacation ?? 0}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-right text-gray-900 dark:text-white font-medium">
                      {emp.leave_quota_sick ?? 0}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-right text-gray-900 dark:text-white font-medium">
                      {emp.leave_quota_offset ?? 0}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <button 
                        onClick={() => handleEditClick(emp)}
                        className="text-indigo-600 dark:text-indigo-400 hover:text-indigo-900 dark:hover:text-indigo-300"
                      >
                        Edit
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <Modal 
        isOpen={isEditModalOpen} 
        onClose={() => setIsEditModalOpen(false)}
        title={`Edit Credits: ${selectedEmployee?.full_name}`}
      >
        <div className="space-y-4">
          <Input 
            label="Vacation Leave Quota"
            type="number"
            step="0.01"
            value={editFormData.vacation === 0 && editFormData.vacation.toString() !== '0' ? '' : editFormData.vacation}
            onChange={(e) => setEditFormData(prev => ({ ...prev, vacation: e.target.value as any }))}
          />
          <Input 
            label="Sick Leave Quota"
            type="number"
            step="0.01"
            value={editFormData.sick === 0 && editFormData.sick.toString() !== '0' ? '' : editFormData.sick}
            onChange={(e) => setEditFormData(prev => ({ ...prev, sick: e.target.value as any }))}
          />
          <Input 
            label="Offset Leave Quota"
            type="number"
            step="0.01"
            value={editFormData.offset === 0 && editFormData.offset.toString() !== '0' ? '' : editFormData.offset}
            onChange={(e) => setEditFormData(prev => ({ ...prev, offset: e.target.value as any }))}
          />
          <div className="flex justify-end space-x-2 pt-4">
            <Button variant="secondary" onClick={() => setIsEditModalOpen(false)}>Cancel</Button>
            <Button onClick={handleSaveEdit}>Save Credits</Button>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={isBatchModalOpen}
        onClose={() => setIsBatchModalOpen(false)}
        title="Batch Add Credits"
      >
        <div className="space-y-4 text-sm text-gray-600 dark:text-gray-300 mb-4">
          This action will add the specified amount to the existing balance of ALL active employees in the list.
        </div>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Leave Type</label>
            <select 
              className="w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 dark:bg-gray-800 dark:border-gray-600 dark:text-white sm:text-sm"
              value={batchFormData.type}
              onChange={(e) => setBatchFormData(prev => ({ ...prev, type: e.target.value as any }))}
            >
              <option value="vacation">Vacation Leave</option>
              <option value="sick">Sick Leave</option>
              <option value="offset">Offset Leave</option>
            </select>
          </div>
          <Input 
            label="Amount to Add"
            type="number"
            step="0.01"
            value={batchFormData.amount === 0 && batchFormData.amount.toString() !== '0' ? '' : batchFormData.amount}
            onChange={(e) => setBatchFormData(prev => ({ ...prev, amount: e.target.value as any }))}
          />
          
          <div className="flex justify-end space-x-2 pt-4">
            <Button variant="secondary" onClick={() => setIsBatchModalOpen(false)} disabled={isBatchProcessing}>Cancel</Button>
            <Button onClick={handleBatchUpdate} disabled={isBatchProcessing}>
              {isBatchProcessing ? 'Processing...' : 'Apply to All'}
            </Button>
          </div>
        </div>
      </Modal>

    </div>
  );
};

export default LeaveCredits;
