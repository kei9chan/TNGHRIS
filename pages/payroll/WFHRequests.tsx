
import React, { useState, useMemo, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { mockWFHRequests } from '../../services/mockData';
import { WFHRequest, WFHRequestStatus } from '../../types';
import { useAuth } from '../../hooks/useAuth';
import { usePermissions } from '../../hooks/usePermissions';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import WFHRequestModal from '../../components/payroll/WFHRequestModal';
import { logActivity } from '../../services/auditService';
import EditableDescription from '../../components/ui/EditableDescription';

const LinkIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" /></svg>;

const getStatusColor = (status: WFHRequestStatus) => {
    switch (status) {
        case WFHRequestStatus.Approved: return 'bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300';
        case WFHRequestStatus.Pending: return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/50 dark:text-yellow-300';
        case WFHRequestStatus.Rejected: return 'bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-300';
        default: return 'bg-gray-100 text-gray-800';
    }
};

const WFHRequests: React.FC = () => {
  const { user } = useAuth();
  const { can } = usePermissions();
  const navigate = useNavigate();
  const location = useLocation();

  const [requests, setRequests] = useState<WFHRequest[]>(mockWFHRequests);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState<WFHRequest | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('all');

  // Sync with mock data
  useEffect(() => {
      const interval = setInterval(() => {
          if (mockWFHRequests.length !== requests.length) {
              setRequests([...mockWFHRequests]);
          }
      }, 1000);
      return () => clearInterval(interval);
  }, [requests.length]);

  useEffect(() => {
    if (location.state?.openNewModal) {
        handleOpenModal(null);
        navigate(location.pathname, { replace: true, state: {} });
    }
  }, [location.state, navigate]);

  const myRequests = useMemo(() => {
      if (!user) return [];
      let filtered = requests.filter(r => r.employeeId === user.id);
      
      if (statusFilter !== 'all') {
          filtered = filtered.filter(r => r.status === statusFilter);
      }
      
      return filtered.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [requests, user, statusFilter]);

  const handleOpenModal = (request: WFHRequest | null) => {
      setSelectedRequest(request);
      setIsModalOpen(true);
  };

  const handleSave = (data: Partial<WFHRequest>) => {
      if (!user) return;

      if (data.id) {
          // Update existing
          const index = mockWFHRequests.findIndex(r => r.id === data.id);
          if (index > -1) {
              const updatedReq = { ...mockWFHRequests[index], ...data };
              mockWFHRequests[index] = updatedReq;
              setRequests([...mockWFHRequests]);
              
              // Log if report link was added
              if (data.reportLink && data.reportLink !== requests[index].reportLink) {
                  logActivity(user, 'UPDATE', 'WFHRequest', updatedReq.id, 'Added accomplishment report link.');
              }
          }
      } else {
          // Create New
          const newRequest: WFHRequest = {
              id: `WFH-${Date.now()}`,
              employeeId: user.id,
              employeeName: user.name,
              date: data.date!,
              reason: data.reason!,
              reportLink: data.reportLink,
              status: WFHRequestStatus.Pending,
              createdAt: new Date()
          };
          mockWFHRequests.unshift(newRequest);
          setRequests([...mockWFHRequests]);
          logActivity(user, 'CREATE', 'WFHRequest', newRequest.id, `Requested WFH for ${newRequest.date.toLocaleDateString()}`);
      }
      setIsModalOpen(false);
  };

  return (
    <div className="space-y-6">
        <div className="flex justify-between items-center">
            <div>
                <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Work From Home Requests</h1>
                <p className="text-gray-600 dark:text-gray-400 mt-1">Submit requests and track your WFH status.</p>
            </div>
            <Button onClick={() => handleOpenModal(null)}>New Request</Button>
        </div>

        <EditableDescription descriptionKey="wfhDesc" />

        <Card>
            <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex justify-end">
                <div className="w-48">
                    <select 
                        value={statusFilter} 
                        onChange={e => setStatusFilter(e.target.value)}
                        className="block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                    >
                        <option value="all">All Statuses</option>
                        {Object.values(WFHRequestStatus).map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                </div>
            </div>
            <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                    <thead className="bg-gray-50 dark:bg-gray-800">
                        <tr>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Date</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Reason</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Status</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Report</th>
                            <th className="relative px-6 py-3"><span className="sr-only">Actions</span></th>
                        </tr>
                    </thead>
                    <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-700">
                        {myRequests.map(req => (
                            <tr key={req.id} className="hover:bg-gray-50 dark:hover:bg-gray-800">
                                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white">
                                    {new Date(req.date).toLocaleDateString()}
                                </td>
                                <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-400 max-w-xs truncate">
                                    {req.reason}
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm">
                                    <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${getStatusColor(req.status)}`}>
                                        {req.status}
                                    </span>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm">
                                    {req.reportLink ? (
                                        <a href={req.reportLink} target="_blank" rel="noopener noreferrer" className="flex items-center text-indigo-600 hover:text-indigo-900 dark:text-indigo-400 dark:hover:text-indigo-300">
                                            <LinkIcon /> <span className="ml-1">View Report</span>
                                        </a>
                                    ) : req.status === WFHRequestStatus.Approved ? (
                                        <button onClick={() => handleOpenModal(req)} className="text-xs text-orange-600 hover:text-orange-800 font-medium">
                                            + Add Report
                                        </button>
                                    ) : (
                                        <span className="text-gray-400">-</span>
                                    )}
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                    <Button size="sm" variant="secondary" onClick={() => handleOpenModal(req)}>
                                        {req.status === WFHRequestStatus.Pending ? 'Edit' : 'View'}
                                    </Button>
                                </td>
                            </tr>
                        ))}
                        {myRequests.length === 0 && (
                            <tr>
                                <td colSpan={5} className="text-center py-10 text-gray-500 dark:text-gray-400">
                                    No requests found.
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </Card>

        <WFHRequestModal 
            isOpen={isModalOpen}
            onClose={() => setIsModalOpen(false)}
            request={selectedRequest}
            onSave={handleSave}
        />
    </div>
  );
};

export default WFHRequests;
