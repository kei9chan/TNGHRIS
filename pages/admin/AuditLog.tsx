import React, { useEffect, useState } from 'react';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import { AuditLog as AuditLogType, Role, Permission } from '../../types';
import { useAuth } from '../../hooks/useAuth';
import { supabase } from '../../services/supabaseClient';
import { usePermissions } from '../../hooks/usePermissions';

const AuditLog: React.FC = () => {
    const { user } = useAuth();
    const { can } = usePermissions();
    const canView = can('AuditLog', Permission.View);
    const canManage = can('AuditLog', Permission.Manage);
    const canExport = canManage; // restrict export to manage roles

    const [logs, setLogs] = useState<AuditLogType[]>([]);
    const [loading, setLoading] = useState<boolean>(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const loadLogs = async () => {
            setLoading(true);
            setError(null);
            const { data, error: err } = await supabase
                .from('audit_feed') // view of system events
                .select('*')
                .order('timestamp', { ascending: false })
                .limit(500);
            if (err) {
                setError(err.message);
                setLoading(false);
                return;
            }
            setLogs(
                (data || []).map((row: any) => ({
                    id: row.id,
                    timestamp: row.timestamp ? new Date(row.timestamp) : new Date(),
                    userEmail: row.user_email || 'System',
                    action: row.action || 'READ',
                    entity: row.entity || '',
                    entityId: row.entity_id || '',
                    details: row.details || '',
                }))
            );
            setLoading(false);
        };
        loadLogs();
    }, []);

    const exportToCSV = () => {
        const headers = ['Timestamp', 'User Email', 'Action', 'Entity', 'Entity ID', 'Details'];
        const csvRows = [headers.join(',')];

        for (const log of logs) {
            const values = [
                `"${log.timestamp.toLocaleString()}"`,
                log.userEmail,
                log.action,
                log.entity,
                log.entityId,
                `"${(log.details || '').replace(/"/g, '""')}"`
            ];
            csvRows.push(values.join(','));
        }

        const blob = new Blob([csvRows.join('\n')], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.setAttribute('hidden', '');
        a.setAttribute('href', url);
        a.setAttribute('download', `audit_log_${new Date().toISOString()}.csv`);
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    };

    const getActionChipColor = (action: string) => {
        switch (action) {
            case 'CREATE': return 'bg-green-100 text-green-800';
            case 'UPDATE': return 'bg-yellow-100 text-yellow-800';
            case 'DELETE': return 'bg-red-100 text-red-800';
            case 'READ': return 'bg-blue-100 text-blue-800';
            case 'LOGIN': return 'bg-indigo-100 text-indigo-800';
            case 'APPROVE': return 'bg-teal-100 text-teal-800';
            case 'GENERATE': return 'bg-purple-100 text-purple-800';
            case 'EXPORT': return 'bg-gray-200 text-gray-800';
            default: return 'bg-gray-100 text-gray-800';
        }
    }
    
    if (!canView) {
        return (
            <Card>
                <div className="p-6 text-center text-gray-600 dark:text-gray-300">
                    You do not have permission to view the audit log.
                </div>
            </Card>
        );
    }

    return (
    <div className="space-y-6">
        <div className="flex justify-between items-center">
            <div>
                <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Audit Log</h1>
                <p className="text-gray-600 dark:text-gray-400">Immutable trail of system activities (from audit_feed).</p>
            </div>
            {canExport && (
                <Button onClick={exportToCSV}>Export to CSV</Button>
            )}
        </div>
        {error && (
            <Card>
                <div className="p-3 text-sm text-red-600 dark:text-red-400">{error}</div>
            </Card>
        )}
        {loading && (
            <Card>
                <div className="p-3 text-sm text-gray-600 dark:text-gray-300">Loading audit log...</div>
            </Card>
        )}
        <Card>
            <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                    <thead className="bg-gray-50 dark:bg-gray-700">
                        <tr>
                            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Timestamp</th>
                            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">User</th>
                            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Action</th>
                            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Entity</th>
                            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Details</th>
                        </tr>
                    </thead>
                    <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                        {logs.map(log => (
                            <tr key={log.id}>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{log.timestamp.toLocaleString()}</td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">{log.userEmail}</td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm">
                                    <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${getActionChipColor(log.action)}`}>
                                        {log.action}
                                    </span>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{log.entity} {log.entityId ? `(${log.entityId})` : ''}</td>
                                <td className="px-6 py-4 whitespace-normal text-sm text-gray-500 dark:text-gray-400">{log.details}</td>
                            </tr>
                        ))}
                        {logs.length === 0 && !loading && (
                            <tr>
                                <td colSpan={5} className="px-6 py-6 text-center text-sm text-gray-500 dark:text-gray-400">No audit log entries found.</td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </Card>
    </div>
  );
};

export default AuditLog;
