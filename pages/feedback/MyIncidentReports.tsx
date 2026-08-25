import React, { useState, useEffect } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { IncidentReport, IRStatus } from '../../types';
import { fetchIncidentReports, followUpIncidentReport, resubmitIncidentReport, saveIncidentReport } from '../../services/incidentReportService';
import { fetchNTEs } from '../../services/nteService';
import { fetchResolutions } from '../../services/resolutionService';
import CaseListTable from '../../components/feedback/CaseListTable';
import IncidentReportModal from '../../components/feedback/IncidentReportModal';
import Card from '../../components/ui/Card';

export default function MyIncidentReports() {
  const { user } = useAuth();
  const [reports, setReports] = useState<IncidentReport[]>([]);
  const [ntes, setNtes] = useState<any[]>([]);
  const [resolutions, setResolutions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedReport, setSelectedReport] = useState<IncidentReport | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [followUpBusyId, setFollowUpBusyId] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, [user]);

  const loadData = async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const [allReports, allNtes, allResolutions] = await Promise.all([
        fetchIncidentReports(),
        fetchNTEs(),
        fetchResolutions(),
      ]);

      const myReports = allReports.filter(
        (r) => r.reportedBy === user.id || r.involvedEmployeeIds.includes(user.id)
      );

      setReports(myReports);
      setNtes(allNtes);
      setResolutions(allResolutions);
    } catch (err: any) {
      console.error('Error loading my incident reports:', err);
      setError(err.message || 'Failed to load cases');
    } finally {
      setLoading(false);
    }
  };

  const handleRowClick = (report: IncidentReport) => {
    setSelectedReport(report);
    setIsModalOpen(true);
  };

  const canFollowUp = (report: IncidentReport) =>
    !!user &&
    report.reportedBy === user.id &&
    report.status !== IRStatus.Closed &&
    report.status !== IRStatus.NoAction;

  const handleFollowUp = async (report: IncidentReport) => {
    if (!canFollowUp(report)) return;
    if (!window.confirm('Send a follow-up reminder for this incident report?')) return;
    setFollowUpBusyId(report.id);
    try {
      const updated = await followUpIncidentReport(report.id);
      setReports(previous => previous.map(item => item.id === updated.id ? updated : item));
      if (selectedReport?.id === updated.id) setSelectedReport(updated);
      alert('Follow-up reminder sent successfully. The assigned handler has been notified.');
    } catch (err: any) {
      alert(err?.message || 'Failed to send the follow-up reminder.');
    } finally {
      setFollowUpBusyId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 dark:bg-red-900/30 p-4 rounded-md">
        <p className="text-red-700 dark:text-red-300">{error}</p>
        <button
          onClick={loadData}
          className="mt-2 text-sm text-red-600 dark:text-red-400 hover:underline"
        >
          Try again
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Incident Reports Filed</h1>
      <div className="mt-6">
        <Card>
          <div className="px-4 py-5 sm:p-6">
            <CaseListTable
              reports={reports}
              ntes={ntes}
              resolutions={resolutions}
              onRowClick={handleRowClick}
              onFollowUp={handleFollowUp}
              canFollowUp={canFollowUp}
              followUpBusyId={followUpBusyId}
            />
          </div>
        </Card>
      </div>

      {isModalOpen && selectedReport && (
        <IncidentReportModal
          report={selectedReport}
          onClose={() => {
            setIsModalOpen(false);
            setSelectedReport(null);
            loadData();
          }}
          onSave={async changes => {
            if (!user) return;
            const saved = await saveIncidentReport(changes, user);
            setSelectedReport(saved);
            setReports(previous => previous.map(item => item.id === saved.id ? saved : item));
            return saved;
          }}
          onResubmit={async reportId => {
            const saved = await resubmitIncidentReport(reportId);
            setSelectedReport(saved);
            setReports(previous => previous.map(item => item.id === saved.id ? saved : item));
            return saved;
          }}
          isEmployeeView
        />
      )}
    </div>
  );
}
