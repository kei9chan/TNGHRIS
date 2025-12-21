
import React, { useState, useMemo, useEffect } from 'react';
import { Link } from 'react-router-dom';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import { OnboardingChecklistTemplate, Permission, Role, OnboardingChecklist, OnboardingTask, OnboardingTaskStatus, Resignation, OnboardingTaskType } from '../../types';
import { mockOnboardingTemplates, mockUsers, mockResignations, mockAssetAssignments, mockAssets } from '../../services/mockData';
import { usePermissions } from '../../hooks/usePermissions';
import OnboardingTemplateModal from '../../components/employees/OnboardingTemplateModal';
import { useAuth } from '../../hooks/useAuth';
import AssignedOnboardingChecklist from '../../components/employees/AssignedOnboardingChecklist';
import OnboardingAdminDashboard from '../../components/employees/OnboardingAdminDashboard';
import AssignOnboardingModal from '../../components/employees/AssignOnboardingModal';
import { logActivity } from '../../services/auditService';
import StatCard from '../../components/dashboard/StatCard';
import ResignationListTable from '../../components/employees/ResignationListTable';
import EditableDescription from '../../components/ui/EditableDescription';
import ResignationLinkModal from '../../components/employees/ResignationLinkModal';
import { supabase } from '../../services/supabaseClient';


// Icons
const PlusIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>;
const DocumentDuplicateIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>;
const PencilIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.5L15.232 5.232z" /></svg>;
const TrashIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>;
const EyeIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>;
const PaperAirplaneIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" /></svg>;

// Stat Card Icons
const UserGroupIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.653-.122-1.28-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.653.122-1.28.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" /></svg>;
const ClockIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>;
const ExclamationTriangleIcon = () => <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="h-8 w-8 text-white"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" /></svg>;
const ClipboardCheckIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M10.125 2.25h-4.5c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125v-9M10.125 2.25h.375a9 9 0 0 1 9 9v.375M10.125 2.25A3.375 3.375 0 0 1 13.5 5.625v1.5c0 .621.504 1.125 1.125 1.125h1.5a3.375 3.375 0 0 1 3.375 3.375M9 15l2.25 2.25L15 12" /></svg>;


const OnboardingChecklistPage: React.FC = () => {
  const { user } = useAuth();
  const { can } = usePermissions();
  const canManage = can('Employees', Permission.Edit);
  const canManageOffboarding = can('Offboarding', Permission.View);
  const canViewAdminDashboard = can('Employees', Permission.View) && user?.role !== Role.Employee;
  
  const defaultTab = sessionStorage.getItem('activeLifecycleTab') || (canManage ? 'dashboard' : 'dashboard');
  const [activeTab, setActiveTab] = useState(defaultTab);
  
  useEffect(() => {
    // Clean up session storage after reading it
    if (sessionStorage.getItem('activeLifecycleTab')) {
      sessionStorage.removeItem('activeLifecycleTab');
    }
  }, []);

  const [templates, setTemplates] = useState<OnboardingChecklistTemplate[]>(mockOnboardingTemplates);
  const [searchTerm, setSearchTerm] = useState('');
  const [isTemplateModalOpen, setIsTemplateModalOpen] = useState(false);
  const [templateToEdit, setTemplateToEdit] = useState<OnboardingChecklistTemplate | null>(null);
  const [checklists, setChecklists] = useState<OnboardingChecklist[]>([]);
  const [employees, setEmployees] = useState<{ id: string; name: string; role: Role; managerId?: string }[]>([]);
  const [resignations, setResignations] = useState<Resignation[]>(mockResignations);
  const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);
  const [isResignationEmailModalOpen, setIsResignationEmailModalOpen] = useState(false);

  useEffect(() => {
    const loadSupabaseData = async () => {
      try {
        const [
          { data: templateRows, error: templateError },
          { data: employeeRows, error: employeeError },
          { data: checklistRows, error: checklistError },
        ] = await Promise.all([
          supabase.from('onboarding_checklist_templates').select('id, name, target_role, template_type, tasks'),
          supabase.from('hris_users').select('id, full_name, role, status, business_unit'),
          supabase.from('onboarding_checklists').select('id, employee_id, template_id, status, created_at, start_date'),
        ]);
        if (templateError) throw templateError;
        if (employeeError) throw employeeError;
        if (checklistError) throw checklistError;

        if (templateRows) {
          const mappedTemplates: OnboardingChecklistTemplate[] = templateRows.map((t: any) => ({
            id: t.id,
            name: t.name,
            targetRole: (t.target_role as Role) || Role.Employee,
            templateType: t.template_type || 'Onboarding',
            tasks: Array.isArray(t.tasks) ? t.tasks : [],
          }));
          setTemplates(mappedTemplates);
        }

        if (employeeRows && employeeRows.length > 0) {
          const mappedEmployees = employeeRows.map((e: any) => ({
            id: e.id,
            name: e.full_name,
            role: (e.role as Role) || Role.Employee,
            status: (e.status as string) || 'Active',
            businessUnit: e.business_unit || '',
            managerId: undefined,
          }));
          setEmployees(mappedEmployees);
        }

        if (checklistRows && checklistRows.length > 0) {
          const mappedChecklists: OnboardingChecklist[] = checklistRows.map((c: any) => ({
            id: c.id,
            employeeId: c.employee_id,
            templateId: c.template_id,
            createdAt: c.created_at ? new Date(c.created_at) : new Date(),
            status: (c.status as any) || 'InProgress',
            tasks: [],
            signedAt: undefined,
          }));
          setChecklists(mappedChecklists);
        }
      } catch (err) {
        console.error('Failed to load onboarding data from Supabase', err);
        // Keep whatever data is already in state; avoid overwriting with mock
      }
    };

    loadSupabaseData();
  }, []);

  const forceResignationUpdate = () => {
    setResignations([...mockResignations]);
  }

  const filteredTemplates = useMemo(() => {
    return templates.filter(t => t.name.toLowerCase().includes(searchTerm.toLowerCase()));
  }, [templates, searchTerm]);

  const dashboardStats = useMemo(() => {
    const activeChecklists = checklists.filter(
      c => c.status === 'InProgress' || c.status === 'Pending' || !c.status
    );
    const completedChecklists = checklists.filter(c => c.status === 'Completed' && c.signedAt);

    const totalOverdueTasks = activeChecklists.reduce((total, checklist) => {
        const overdue = checklist.tasks.filter(
            task => task.status === OnboardingTaskStatus.Pending && new Date(task.dueDate) < new Date()
        ).length;
        return total + overdue;
    }, 0);

    const pendingApprovalTasks = activeChecklists.reduce((total, checklist) => {
      const pending = checklist.tasks.filter(
          task => task.status === OnboardingTaskStatus.PendingApproval
      ).length;
      return total + pending;
    }, 0);

    let avgCompletionTime: string | number = 'N/A';
    if (completedChecklists.length > 0) {
      const totalDuration = completedChecklists.reduce((sum, c) => {
        if (!c.signedAt) return sum;
        const duration = new Date(c.signedAt).getTime() - new Date(c.createdAt).getTime();
        return sum + duration;
      }, 0);
      const avgDurationMs = totalDuration / completedChecklists.length;
      const avgDurationDays = Math.round(avgDurationMs / (1000 * 60 * 60 * 24));
      avgCompletionTime = `${avgDurationDays} days`;
    }

    return {
      activeCount: activeChecklists.length,
      overdueCount: totalOverdueTasks,
      pendingApprovalCount: pendingApprovalTasks,
      avgCompletion: avgCompletionTime,
    };
  }, [checklists]);


  const handleOpenModal = (template: OnboardingChecklistTemplate | null) => {
    setTemplateToEdit(template);
    setIsTemplateModalOpen(true);
  };

  const handleClone = (template: OnboardingChecklistTemplate) => {
    const clonedTemplate = { ...JSON.parse(JSON.stringify(template)), id: '', name: `${template.name} (Copy)` };
    setTemplateToEdit(clonedTemplate);
    setIsTemplateModalOpen(true);
  };

  const handleDelete = (templateId: string) => {
    if (!window.confirm('Are you sure you want to delete this template?')) return;
    (async () => {
      try {
        const { error } = await supabase.from('onboarding_checklist_templates').delete().eq('id', templateId);
        if (error) throw error;
        setTemplates(prev => prev.filter(t => t.id !== templateId));
      } catch (err) {
        console.error('Failed to delete template', err);
        alert('Failed to delete template. Please try again.');
      }
    })();
  };
  
  const handleSave = async (templateData: OnboardingChecklistTemplate) => {
    try {
      const payload: any = {
        name: templateData.name,
        target_role: templateData.targetRole,
        template_type: templateData.templateType || 'Onboarding',
        tasks: templateData.tasks || [],
        created_by_user_id: user?.id || null,
      };
      if (templateData.id) {
        payload.id = templateData.id;
      }

      const { data, error } = await supabase
        .from('onboarding_checklist_templates')
        .upsert(payload)
        .select('id, name, target_role, template_type, tasks, created_by_user_id')
        .single();

      if (error) throw error;

      if (data) {
        const saved: OnboardingChecklistTemplate = {
          id: data.id,
          name: data.name,
          targetRole: (data.target_role as Role) || Role.Employee,
          templateType: data.template_type || 'Onboarding',
          tasks: Array.isArray(data.tasks) ? data.tasks : [],
        };
        setTemplates(prev => {
          const exists = prev.some(t => t.id === saved.id);
          return exists ? prev.map(t => (t.id === saved.id ? saved : t)) : [saved, ...prev];
        });
      }

      setIsTemplateModalOpen(false);
      setTemplateToEdit(null);
    } catch (err) {
      console.error('Failed to save template', err);
      alert('Failed to save template. Please try again.');
    }
  };

  const handleAssignOnboarding = async ({ employeeIds, templateId, startDate, notify }: { employeeIds: string[]; templateId: string; startDate: Date; notify: boolean }) => {
    if (!user) return;

    let template = templates.find(t => t.id === templateId) || mockOnboardingTemplates.find(t => t.id === templateId);
    if (!template) {
      template = templates[0] || mockOnboardingTemplates[0];
      if (!template) {
        alert('Selected template not found.');
        return;
      }
    }

    const newChecklists: OnboardingChecklist[] = [];
    const employeeNames: string[] = [];

    employeeIds.forEach(employeeId => {
      const employee =
        employees.find(e => e.id === employeeId) ||
        mockUsers.find(u => u.id === employeeId);
      if (!employee) return;

      const checklistId = `ONBOARD-${employee.id}-${Date.now()}`;
      const tasks = template.tasks.flatMap((taskTemplate: any) => {
        let ownerUserId = '';
        if (taskTemplate.ownerUserId) {
          ownerUserId = taskTemplate.ownerUserId;
        } else if (taskTemplate.ownerRole === Role.Manager && (employee as any).managerId) {
          ownerUserId = (employee as any).managerId;
        } else {
          const owner = employees.find(u => u.role === taskTemplate.ownerRole) || mockUsers.find(u => u.role === taskTemplate.ownerRole);
          if (owner) ownerUserId = owner.id;
        }
        const ownerUser = employees.find(u => u.id === ownerUserId) || mockUsers.find(u => u.id === ownerUserId);
        const ownerName = ownerUser ? ownerUser.name : 'System';
        const dueDate = new Date(startDate);
        dueDate.setDate(dueDate.getDate() + (taskTemplate.dueDays || 0));

        const newTask: OnboardingTask = {
          id: `ONBOARDTASK-${employee.id}-${taskTemplate.id || taskTemplate.name}-${Date.now()}`,
          templateTaskId: taskTemplate.id || taskTemplate.name,
          employeeId: employee.id,
          name: taskTemplate.name,
          description: taskTemplate.description,
          ownerUserId,
          ownerName,
          videoUrl: taskTemplate.videoUrl,
          dueDate,
          status: OnboardingTaskStatus.Pending,
          points: taskTemplate.points || 0,
          taskType: taskTemplate.taskType,
          readContent: taskTemplate.readContent,
          requiresApproval: taskTemplate.requiresApproval,
          assetId: taskTemplate.assetId,
          assetDescription: taskTemplate.assetDescription,
        };
        return [newTask];
      });

      newChecklists.push({
        id: checklistId,
        employeeId: employee.id,
        templateId: template.id,
        createdAt: new Date(),
        status: 'InProgress',
        tasks,
      });
      employeeNames.push((employee as any).name || 'Employee');
    });

    try {
      if (newChecklists.length > 0) {
        const payload = employeeIds.map(empId => ({
          employee_id: empId,
          template_id: template.id,
          start_date: startDate.toISOString().split('T')[0],
          notify,
        }));
        const { data: inserted, error } = await supabase
          .from('onboarding_checklists')
          .insert(payload)
          .select('id, employee_id, template_id, status, created_at, start_date');
        if (error) throw error;

        const mappedInserted: OnboardingChecklist[] =
          inserted?.map((c: any) => ({
            id: c.id,
            employeeId: c.employee_id,
            templateId: c.template_id,
            createdAt: c.created_at ? new Date(c.created_at) : new Date(),
            status: (c.status as any) || 'InProgress',
            tasks: [],
            signedAt: undefined,
          })) || [];

        logActivity(
          user,
          'CREATE',
          'OnboardingChecklist',
          mappedInserted.map(c => c.id).join(', '),
          `Assigned template '${template.name}' to ${employeeNames.length} employee(s): ${employeeNames.join(', ')}.`
        );
        setChecklists(prev => [...prev, ...mappedInserted]);
        setIsAssignModalOpen(false);
        alert(`Assigned '${template.name}' to ${employeeNames.length} employee(s). ${notify ? '(Notifications sent)' : ''}`);
      } else {
        alert('No new checklists were assigned. The selected employees may already have this specific checklist active.');
        setIsAssignModalOpen(false);
      }
    } catch (err) {
      console.error('Failed to assign onboarding checklist', err);
      alert('Failed to assign checklist. Please try again.');
    }
  };

  // Keep resignation mock in sync for now (offboarding module still mock-driven)
  useEffect(() => {
    const interval = setInterval(() => {
      if (mockResignations.length !== resignations.length) {
        setResignations([...mockResignations]);
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [resignations.length]);

  const handleUpdateTaskStatus = (taskId: string, status: OnboardingTaskStatus) => {
    const newChecklists = checklists.map(list => ({
        ...list,
        tasks: list.tasks.map(task => task.id === taskId ? { ...task, status, completedAt: new Date() } : task)
    }));
    setChecklists(newChecklists);
    mockOnboardingChecklists.length = 0;
    mockOnboardingChecklists.push(...newChecklists);
  };

  if (!user) return <div>Loading...</div>;

  const tabClass = (tabName: string) => `px-4 py-2 text-sm font-medium rounded-md transition-colors ${activeTab === tabName ? 'bg-indigo-100 text-indigo-700 dark:bg-slate-700 dark:text-indigo-300' : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'}`;

  if (canViewAdminDashboard) {
    return (
      <div className="space-y-6">
        <div className="flex space-x-2 p-1 bg-gray-200 dark:bg-slate-800 rounded-lg">
            {canManage && <button className={tabClass('templates')} onClick={() => setActiveTab('templates')}>Template Management</button>}
            <button className={tabClass('dashboard')} onClick={() => setActiveTab('dashboard')}>On/Offboarding Tracker</button>
            {canManageOffboarding && <button className={tabClass('offboarding')} onClick={() => setActiveTab('offboarding')}>Offboarding Module</button>}
        </div>

        {activeTab === 'templates' && canManage && (
             <div className="space-y-6">
                <div className="flex flex-col md:flex-row justify-between md:items-center gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Employee Lifecycle Templates</h1>
                    <EditableDescription descriptionKey="onboardingTemplatesDesc" className="mt-1" />
                </div>
                <Button onClick={() => handleOpenModal(null)}>
                    <PlusIcon />
                    Create Template
                </Button>
                </div>
                
                <Card>
                <div className="p-4">
                    <Input 
                    label="Search Templates"
                    id="search-templates"
                    placeholder="e.g., Manager Lifecycle Plan..."
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                    />
                </div>
                </Card>
                
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {filteredTemplates.map(template => (
                    <Card key={template.id} className="flex flex-col !p-0">
                    <div className="p-6 flex-grow">
                        <div className="flex justify-between items-start">
                            <h3 className="text-lg font-bold text-gray-900 dark:text-white">{template.name}</h3>
                            <span className={`px-2 py-1 text-xs font-semibold rounded-full ${template.templateType === 'Offboarding' ? 'bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300' : 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300'}`}>
                                {template.templateType || 'Onboarding'}
                            </span>
                        </div>
                        <p className="text-sm text-gray-500 dark:text-gray-400">For Role: {template.targetRole}</p>
                        <p className="mt-4 text-sm text-gray-600 dark:text-gray-300">
                        Contains {template.tasks.length} task(s).
                        </p>
                    </div>
                    <div className="bg-gray-50 dark:bg-gray-800/50 p-3 border-t dark:border-gray-700 flex justify-end space-x-2">
                        <Button size="sm" variant="success" title="Live Preview" onClick={() => window.open(`#/employees/onboarding/preview/${template.id}`, '_blank')}><EyeIcon/></Button>
                        <Button size="sm" variant="danger" title="Delete" onClick={() => handleDelete(template.id)}><TrashIcon/></Button>
                        <Button size="sm" variant="secondary" title="Clone" onClick={() => handleClone(template)}><DocumentDuplicateIcon/></Button>
                        <Button size="sm" onClick={() => handleOpenModal(template)}><PencilIcon/></Button>
                    </div>
                    </Card>
                ))}
                </div>
                {filteredTemplates.length === 0 && (
                <Card>
                    <div className="text-center py-12 text-gray-500 dark:text-gray-400">
                    <p>No templates found.</p>
                    </div>
                </Card>
                )}
            </div>
        )}

        {activeTab === 'dashboard' && (
             <div className="space-y-6">
                <div>
                  <div className="flex justify-between items-center">
                      <h1 className="text-2xl font-bold text-slate-800 dark:text-white">Employee Checklist Progress</h1>
                      {canManage && <Button onClick={() => setIsAssignModalOpen(true)}>Assign Checklist</Button>}
                  </div>
                  <EditableDescription descriptionKey="onboardingDashboardDesc" className="mt-2" />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                    <StatCard title="Active Checklists" value={dashboardStats.activeCount} icon={<UserGroupIcon />} colorClass="bg-blue-500" />
                    <StatCard title="Total Overdue Tasks" value={dashboardStats.overdueCount} icon={<ExclamationTriangleIcon />} colorClass="bg-red-500" />
                    <StatCard title="Pending Approval" value={dashboardStats.pendingApprovalCount} icon={<ClipboardCheckIcon />} colorClass="bg-yellow-500" />
                    <StatCard title="Avg. Completion Time" value={dashboardStats.avgCompletion} icon={<ClockIcon />} colorClass="bg-green-500" />
                </div>
                <Card>
                    <OnboardingAdminDashboard checklists={checklists} employees={employees} templates={templates} />
                </Card>
             </div>
        )}

        {activeTab === 'offboarding' && (
            canManageOffboarding ? (
                <Card 
                    title="Offboarding Employees"
                    actions={
                        canManage && (
                            <div className="flex flex-col items-end space-y-2 md:flex-row md:space-y-0 md:space-x-2">
                                <Button variant="secondary" onClick={() => setIsResignationEmailModalOpen(true)}>
                                    <PaperAirplaneIcon /> Email Resignation Link
                                </Button>
                                <Link to="/submit-resignation">
                                    <Button>Submit Resignation</Button>
                                </Link>
                            </div>
                        )
                    }
                >
                    <div className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                        <EditableDescription descriptionKey="onboardingOffboardingDesc" />
                    </div>
                    <ResignationListTable resignations={resignations} onUpdate={forceResignationUpdate} />
                </Card>
            ) : (
                 <Card>
                    <div className="text-center py-24 text-gray-500 dark:text-gray-400">
                        <p className="text-lg font-semibold">You do not have permission to view this module.</p>
                    </div>
                </Card>
            )
        )}

        {isTemplateModalOpen && (
          <OnboardingTemplateModal
            isOpen={isTemplateModalOpen}
            onClose={() => setIsTemplateModalOpen(false)}
            onSave={handleSave}
            template={templateToEdit}
          />
        )}
        {isAssignModalOpen && (
          <AssignOnboardingModal
            isOpen={isAssignModalOpen}
            onClose={() => setIsAssignModalOpen(false)}
            onSave={handleAssignOnboarding}
            employees={employees}
            templates={templates}
          />
        )}
        {isResignationEmailModalOpen && (
            <ResignationLinkModal 
                isOpen={isResignationEmailModalOpen}
                onClose={() => setIsResignationEmailModalOpen(false)}
            />
        )}
      </div>
    );
  }

  // Employee View
  // Show ALL active checklists for the employee, not just one
  const myChecklists = checklists.filter(c => c.employeeId === user.id);
  
  return (
    <div className="space-y-6">
       <h1 className="text-3xl font-bold text-gray-900 dark:text-white">My Lifecycle Checklists</h1>
       {myChecklists.length > 0 ? (
           myChecklists.map(checklist => {
               const template = mockOnboardingTemplates.find(t => t.id === checklist.templateId);
               const title = template?.name || 'Checklist';
               return (
                    <div key={checklist.id} className="mb-6">
                        <h3 className="text-lg font-semibold mb-2">{title}</h3>
                        <AssignedOnboardingChecklist checklist={checklist} currentUser={user} onUpdateTaskStatus={handleUpdateTaskStatus} />
                    </div>
               )
           })
       ) : (
           <Card>
               <div className="text-center py-12">
                   <p className="text-gray-500">You have no active checklists assigned.</p>
               </div>
           </Card>
       )}
    </div>
  );
};

export default OnboardingChecklistPage;
