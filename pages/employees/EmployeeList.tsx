
import React, { useState, useMemo, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import Card from '../../components/ui/Card';
import Input from '../../components/ui/Input';
import { mockUsers, mockChangeHistory, mockUserDocuments, mockBusinessUnits } from '../../services/mockData';
import { User, Permission, ChangeHistory, ChangeHistoryStatus, Role, UserDocument, UserDocumentStatus } from '../../types';
import { usePermissions } from '../../hooks/usePermissions';
import EmployeeTable from '../../components/employees/EmployeeTable';
import ProfileEditModal from '../../components/employees/ProfileEditModal';
import { useAuth } from '../../hooks/useAuth';
import HRReviewQueue from '../admin/HRReviewQueue';
import EditableDescription from '../../components/ui/EditableDescription';
import { db } from '../../services/db'; // Import the new DB service

const EmployeeList: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { can, getAccessibleBusinessUnits } = usePermissions();
  const { user: currentUser } = useAuth();
  const [searchTerm, setSearchTerm] = useState('');
  const [buFilter, setBuFilter] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<'Active' | 'Inactive' | ''>('');
  
  const [isEditModalOpen, setEditModalOpen] = useState(false);
  const [userToEdit, setUserToEdit] = useState<User | null>(null);
  
  const queryParams = new URLSearchParams(location.search);
  const initialTab = queryParams.get('tab') === 'review' ? 'review' : 'list';
  const [activeTab, setActiveTab] = useState(initialTab);

  const accessibleBus = useMemo(() => getAccessibleBusinessUnits(mockBusinessUnits), [getAccessibleBusinessUnits]);

  useEffect(() => {
      const params = new URLSearchParams(location.search);
      const tab = params.get('tab');
      if (tab === 'review') {
          setActiveTab('review');
      } else if (tab === 'list') {
          setActiveTab('list');
      }
  }, [location.search]);
  
  // State to ensure reactivity to mock data changes
  const [changeHistory, setChangeHistory] = useState<ChangeHistory[]>(mockChangeHistory);
  const [users, setUsers] = useState<User[]>(mockUsers);
  const [userDocuments, setUserDocuments] = useState<UserDocument[]>(mockUserDocuments);
   
  useEffect(() => {
    const interval = setInterval(() => {
        // A simple polling mechanism to check for changes in the mock data
        if (mockChangeHistory.length !== changeHistory.length) {
            setChangeHistory([...mockChangeHistory]);
        }
        if (mockUsers.length !== users.length) {
            setUsers([...mockUsers]);
        }
        if (mockUserDocuments.length !== userDocuments.length) {
            setUserDocuments([...mockUserDocuments]);
        }
    }, 1000);
    return () => clearInterval(interval);
  }, [changeHistory.length, users.length, userDocuments.length]);

  const departments = useMemo(() => [...new Set(mockUsers.map(u => u.department))].sort(), []);
  
  // Filter users based on accessible BUs + UI filters
  const filteredUsers = useMemo(() => {
    const accessibleBuNames = new Set(accessibleBus.map(b => b.name));

    return mockUsers.filter(user => {
        // Scope Check
        if (!accessibleBuNames.has(user.businessUnit)) return false;

        const nameMatch = user.name.toLowerCase().includes(searchTerm.toLowerCase());
        const buMatch = !buFilter || user.businessUnit === buFilter;
        const deptMatch = !departmentFilter || user.department === departmentFilter;
        const statusMatch = !statusFilter || user.status === statusFilter;
        return nameMatch && buMatch && deptMatch && statusMatch;
    }).sort((a, b) => a.name.localeCompare(b.name));
  }, [searchTerm, buFilter, departmentFilter, statusFilter, accessibleBus]);

  const pendingReviewCount = useMemo(() => {
    const pendingChangeSubmissions = new Set(
        changeHistory
            .filter(c => c.status === ChangeHistoryStatus.Pending)
            .map(c => c.submissionId)
    ).size;
    
    const pendingUserRegistrations = users.filter(
        u => u.status === 'Inactive' && u.role === Role.Employee
    ).length;
    
    const pendingDocumentSubmissions = userDocuments.filter(
        d => d.status === UserDocumentStatus.Pending
    ).length;

    return pendingChangeSubmissions + pendingUserRegistrations + pendingDocumentSubmissions;
  }, [changeHistory, users, userDocuments]);

  const handleView = (userId: string) => {
    navigate(`/employees/view/${userId}`);
  };

  const handleEdit = (user: User) => {
    if (can('Employees', Permission.Edit)) {
        setUserToEdit(user);
        setEditModalOpen(true);
    } else {
        alert("You don't have permission to edit this user.");
    }
  };
  
  const handleCloseModal = () => {
      setEditModalOpen(false);
      setUserToEdit(null);
  };
  
  const handleAdminSave = (updatedProfileData: Partial<User>) => {
      if (!userToEdit || !currentUser) return;
      
      // REFACTORED: Use DB Service
      db.users.update(currentUser, userToEdit.id, updatedProfileData);
      
      handleCloseModal();
      alert(`Profile for ${userToEdit.name} updated.`);
  };
  
  const handleTabChange = (tab: string) => {
      setActiveTab(tab);
      navigate(`?tab=${tab}`, { replace: true });
  };
  
  const tabClass = (tabName: string) =>
    `flex items-center whitespace-nowrap py-3 px-1 border-b-2 font-medium text-sm transition-colors ${
      activeTab === tabName
        ? 'border-indigo-500 text-indigo-600 dark:text-indigo-400'
        : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
    }`;

  return (
    <div className="space-y-6">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Employee Management</h1>
        
        <div className="border-b border-gray-200 dark:border-gray-700">
            <nav className="-mb-px flex space-x-8" aria-label="Tabs">
                <button onClick={() => handleTabChange('list')} className={tabClass('list')}>
                    Employee List
                </button>
                <button onClick={() => handleTabChange('review')} className={tabClass('review')}>
                    HR Review Queue
                    {pendingReviewCount > 0 && (
                        <span className="ml-2 inline-flex items-center justify-center h-6 w-6 rounded-full bg-red-500 text-xs font-bold text-white">
                            {pendingReviewCount}
                        </span>
                    )}
                </button>
            </nav>
        </div>

        {activeTab === 'list' && (
            <>
                <EditableDescription descriptionKey="employeeListDesc" className="mt-1" />
                <Card>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 p-4">
                        <Input label="Search by Name" id="search-name" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} placeholder="e.g., John Doe" />
                        <div>
                            <label htmlFor="bu-filter" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Business Unit</label>
                            <select id="bu-filter" value={buFilter} onChange={e => setBuFilter(e.target.value)} className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-white">
                                <option value="">All Accessible</option>
                                {accessibleBus.map(bu => <option key={bu.id} value={bu.name}>{bu.name}</option>)}
                            </select>
                        </div>
                         <div>
                            <label htmlFor="dept-filter" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Department</label>
                            <select id="dept-filter" value={departmentFilter} onChange={e => setDepartmentFilter(e.target.value)} className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-white">
                                <option value="">All</option>
                                {departments.map(dept => <option key={dept} value={dept}>{dept}</option>)}
                            </select>
                        </div>
                         <div>
                            <label htmlFor="status-filter" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Status</label>
                            <select id="status-filter" value={statusFilter} onChange={e => setStatusFilter(e.target.value as any)} className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-white">
                                <option value="">All</option>
                                <option value="Active">Active</option>
                                <option value="Inactive">Inactive</option>
                            </select>
                        </div>
                    </div>
                </Card>
                <Card>
                    <EmployeeTable users={filteredUsers} onView={handleView} onEdit={handleEdit} />
                </Card>
            </>
        )}

        {activeTab === 'review' && (
            <HRReviewQueue />
        )}
        
        {isEditModalOpen && userToEdit && (
            <ProfileEditModal 
                isOpen={isEditModalOpen}
                onClose={handleCloseModal}
                user={userToEdit}
                onSave={handleAdminSave}
                onSaveDraft={() => {}} // No-op for admin edit
                draft={null}
                isAdminEdit={true}
            />
        )}
    </div>
  );
};

export default EmployeeList;
