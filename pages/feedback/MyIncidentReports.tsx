import React, { useState, useEffect } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { IncidentReport } from '../../types';
import { fetchIncidentReports } from '../../services/incidentReportService';
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
          onSave={() => {
            setIsModalOpen(false);
            setSelectedReport(null);
            loadData();
          }}
        />
      )}
    </div>
  );
}
