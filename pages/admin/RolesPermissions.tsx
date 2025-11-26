import React, { useState } from 'react';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import { Role, Permission, Resource, PermissionsMatrix, BusinessUnit } from '../../types';
import { mockPermissions, mockBusinessUnits, mockUsers } from '../../services/mockData';
import PermissionsMatrixTable from '../../components/admin/PermissionsMatrix';
import { usePermissions } from '../../hooks/usePermissions';
import { useAuth } from '../../hooks/useAuth';
import { logActivity } from '../../services/auditService';
import BusinessUnitModal from '../../components/admin/BusinessUnitModal';


const roleDescriptions: Record<Role, string> = {
    [Role.Admin]: 'Full system access. Can manage all settings, users, and data.',
    [Role.HRManager]: 'Manages all HR functions, employees, payroll, and feedback systems.',
    [Role.HRStaff]: 'Assists with day-to-day HR tasks like employee data and incident reports.',
    [Role.BOD]: 'Board of Directors. High-level, view-only access to key reports.',
    [Role.GeneralManager]: 'Overall management view of key business and employee metrics.',
    [Role.OperationsDirector]: 'Oversees operational departments, manages teams, and approves requests.',
    [Role.BusinessUnitManager]: 'Manages a specific business unit, its employees, and related approvals.',
    [Role.Manager]: 'Manages a team of direct reports, handles approvals for OT and exceptions.',
    [Role.Employee]: 'Standard user. Can view their own data and submit requests.',
    [Role.FinanceStaff]: 'Manages financial aspects of payroll, including staging and final pay.',
    [Role.Auditor]: 'View-only access to sensitive logs and reports for auditing purposes.',
    [Role.Recruiter]: 'Manages recruitment processes, including requisitions, job posts, and candidates.',
};

const allRoles = Object.values(Role);

const resourceGroups: Record<string, Resource[]> = {
    'General': ['Dashboard'],
    'Employee Management': ['Employees', 'Files'],
    'Feedback & Discipline': ['Feedback'],
    'Performance': ['Evaluation'],
    'Payroll': [
        'Timekeeping', 'Clock', 'OT', 'Exceptions', 'PayrollPrep', 
        'PayrollStaging', 'Payslips', 'GovernmentReports', 'ReportTemplates', 
        'Reports', 'FinalPay', 'ClockLog'
    ],
    'Administration': ['Settings', 'AuditLog'],
};

const allResources = Object.values(resourceGroups).flat();


const RolesPermissions: React.FC = () => {
    const { user } = useAuth();
    const [permissions, setPermissions] = useState<PermissionsMatrix>(() => JSON.parse(JSON.stringify(mockPermissions)));
    const [showSuccess, setShowSuccess] = useState(false);
    const { can } = usePermissions();

    const [businessUnits, setBusinessUnits] = useState<BusinessUnit[]>(mockBusinessUnits);
    const [isBuModalOpen, setIsBuModalOpen] = useState(false);
    const [selectedBu, setSelectedBu] = useState<BusinessUnit | null>(null);

    const isBuInUse = (buName: string) => {
        return mockUsers.some(user => user.businessUnit === buName);
    };

    const handleOpenBuModal = (bu: BusinessUnit | null) => {
        setSelectedBu(bu);
        setIsBuModalOpen(true);
    };

    const handleCloseBuModal = () => {
        setIsBuModalOpen(false);
        setSelectedBu(null);
    };

    const handleSaveBu = (buToSave: { id?: string, name: string }) => {
        if (buToSave.id) { // Editing
            const originalBu = businessUnits.find(b => b.id === buToSave.id);
            if (!originalBu) return;

            const originalName = originalBu.name;
            const newName = buToSave.name;

            // Update business units list in state and mock source
            const updatedBus = businessUnits.map(b => b.id === buToSave.id ? { ...b, name: newName } : b);
            setBusinessUnits(updatedBus);
            mockBusinessUnits.length = 0;
            mockBusinessUnits.push(...updatedBus);


            // Update users who were part of the old business unit
            const updatedUsers = mockUsers.map(u => u.businessUnit === originalName ? { ...u, businessUnit: newName } : u);
            mockUsers.length = 0;
            mockUsers.push(...updatedUsers);

        } else { // Adding new
            const newBu: BusinessUnit = {
                id: `bu-${Date.now()}`,
                name: buToSave.name,
            };
            const updatedBus = [...businessUnits, newBu];
            setBusinessUnits(updatedBus);
            mockBusinessUnits.push(newBu);
        }
        handleCloseBuModal();
    };

    const handleDeleteBu = (buToDelete: BusinessUnit) => {
        if (isBuInUse(buToDelete.name)) {
            alert(`Cannot delete "${buToDelete.name}" as it is currently assigned to one or more users.`);
            return;
        }
        if (window.confirm(`Are you sure you want to delete the Business Unit "${buToDelete.name}"?`)) {
            const updatedBus = businessUnits.filter(b => b.id !== buToDelete.id);
            setBusinessUnits(updatedBus);
            mockBusinessUnits.length = 0;
            mockBusinessUnits.push(...updatedBus);
        }
    };


    const handlePermissionChange = (role: Role, resource: Resource, permission: Permission, checked: boolean) => {
        setPermissions(prev => {
            const newMatrix = JSON.parse(JSON.stringify(prev));
// FIX: Ensure newMatrix[role] is properly typed before accessing resource property.
            const rolePermissions = (newMatrix[role] as Partial<Record<Resource, Permission[]>>)?.[resource] || [];

            let updatedPermissions: Permission[];

            if (checked) {
                // Add the permission
                updatedPermissions = [...new Set([...rolePermissions, permission])];
                // If Manage is checked, add all others
                if (permission === Permission.Manage) {
                    updatedPermissions = Object.values(Permission);
                }
                // If any other is checked, ensure View is checked
                if (permission !== Permission.View) {
                    updatedPermissions.push(Permission.View);
                    updatedPermissions = [...new Set(updatedPermissions)];
                }
            } else {
                // Remove the permission
                updatedPermissions = rolePermissions.filter((p: Permission) => p !== permission);
                // If Manage is unchecked, remove all
                if (permission === Permission.Manage) {
                    updatedPermissions = [];
                }
                // If View is unchecked, remove all others except Manage
                if (permission === Permission.View) {
                    updatedPermissions = updatedPermissions.filter(p => p === Permission.Manage);
                }
            }
            
            if (!newMatrix[role]) {
                newMatrix[role] = {};
            }
            (newMatrix[role] as Partial<Record<Resource, Permission[]>>)[resource] = updatedPermissions;
            return newMatrix;
        });
    };
    
    const handleSave = () => {
        const changes: string[] = [];
        for (const role of allRoles) {
            for (const resource of allResources) {
                const oldPerms = mockPermissions[role]?.[resource] || [];
                const newPerms = permissions[role]?.[resource] || [];

                if (JSON.stringify(oldPerms.sort()) !== JSON.stringify(newPerms.sort())) {
                    changes.push(`${role} on ${resource}: [${oldPerms.join(', ')}] -> [${newPerms.join(', ')}]`);
                }
            }
        }
        
        if (changes.length > 0) {
            logActivity(user, 'UPDATE', 'PermissionsMatrix', 'global', `Permissions changed for ${changes.length} resource(s): ${changes.slice(0, 5).join('; ')}${changes.length > 5 ? '...' : ''}`);
        }

        Object.assign(mockPermissions, permissions);
        console.log("Saved Permissions:", mockPermissions);

        setShowSuccess(true);
        setTimeout(() => setShowSuccess(false), 3000);
    };

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Roles & Permissions</h1>
                {can('Settings', Permission.Manage) && (
                    <Button onClick={handleSave} isLoading={showSuccess}>
                        {showSuccess ? 'Saved Successfully!' : 'Save Changes'}
                    </Button>
                )}
            </div>
            
            <Card title="Roles Catalog">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {allRoles.map(role => (
                        <div key={role} className="p-3 bg-gray-50 dark:bg-gray-900/50 border border-gray-200 dark:border-gray-700 rounded-lg">
                            <h3 className="font-semibold text-gray-900 dark:text-white">{role}</h3>
                            <p className="text-sm text-gray-600 dark:text-gray-400">{roleDescriptions[role]}</p>
                        </div>
                    ))}
                </div>
            </Card>

            <Card title="Business Units">
                <div className="flex justify-end mb-4">
                    <Button onClick={() => handleOpenBuModal(null)}>Add New Business Unit</Button>
                </div>
                <ul className="divide-y divide-gray-200 dark:divide-gray-700">
                    {businessUnits.map(bu => (
                        <li key={bu.id} className="py-3 flex justify-between items-center">
                            <span className="text-gray-900 dark:text-white">{bu.name}</span>
                            <div className="flex space-x-2">
                                <Button size="sm" variant="secondary" onClick={() => handleOpenBuModal(bu)}>Edit</Button>
                                <Button 
                                    size="sm" 
                                    variant="danger" 
                                    onClick={() => handleDeleteBu(bu)}
                                    disabled={isBuInUse(bu.name)}
                                    title={isBuInUse(bu.name) ? 'Cannot delete: Business Unit is in use by at least one employee.' : ''}
                                >
                                    Delete
                                </Button>
                            </div>
                        </li>
                    ))}
                </ul>
            </Card>

            <Card title="Permissions Matrix">
               <PermissionsMatrixTable 
                    roles={allRoles}
                    resourceGroups={resourceGroups}
                    permissionsMatrix={permissions}
                    onPermissionChange={handlePermissionChange}
               />
            </Card>

            <BusinessUnitModal
                isOpen={isBuModalOpen}
                onClose={handleCloseBuModal}
                onSave={handleSaveBu}
                bu={selectedBu}
            />
        </div>
    );
};

export default RolesPermissions;
