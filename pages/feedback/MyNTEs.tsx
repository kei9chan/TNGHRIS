import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { NTE, IncidentReport, Resolution, ResolutionStatus } from '../../types';
import { fetchNTEs } from '../../services/nteService';
import { fetchIncidentReports } from '../../services/incidentReportService';
import { fetchResolutions } from '../../services/resolutionService';
import { formatNTEDisplayId } from '../../utils/formatCaseId';
import NTEModal from '../../components/feedback/NTEModal';
import Card from '../../components/ui/Card';

export default function MyNTEs() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [ntes, setNtes] = useState<NTE[]>([]);
  const [reports, setReports] = useState<IncidentReport[]>([]);
  const [resolutions, setResolutions] = useState<Resolution[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedNte, setSelectedNte] = useState<NTE | null>(null);
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
      const [allNtes, allReports, allResolutions] = await Promise.all([
        fetchNTEs(),
        fetchIncidentReports(),
        fetchResolutions(),
      ]);

      const myNtes = allNtes.filter((n) => n.employeeId === user.id);

      setNtes(myNtes);
      setReports(allReports);
      setResolutions(allResolutions);
    } catch (err: any) {
      console.error('Error loading my ntes:', err);
      setError(err.message || 'Failed to load NTEs');
    } finally {
      setLoading(false);
    }
  };

  const handleRowClick = (nte: NTE) => {
    navigate(`/feedback/nte/${nte.id}`);
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
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white">My Notice to Explains (NTE)</h1>
      <div className="mt-6">
        <Card>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
              <thead className="bg-gray-50 dark:bg-gray-800">
                <tr>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    NTE ID
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Issued Date
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Deadline
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Status
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Resolution Made
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-800">
                {ntes.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-6 py-4 text-center text-sm text-gray-500 dark:text-gray-400">
                      No NTEs found.
                    </td>
                  </tr>
                ) : (
                  ntes.map((nte) => (
                    <tr
                      key={nte.id}
                      onClick={() => handleRowClick(nte)}
                      className="hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer"
                    >
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white">
                        {formatNTEDisplayId(nte.nteNumber) || nte.id}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                        {new Date(nte.issuedDate).toLocaleDateString()}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                        {new Date(nte.deadline).toLocaleDateString()}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200">
                          {nte.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                        {(() => {
                          const resolution = resolutions.find(
                            (r) => r.incidentReportId === nte.incidentReportId && r.employeeId === nte.employeeId
                          );
                          if (
                            resolution &&
                            (resolution.status === ResolutionStatus.PendingAcknowledgement ||
                              resolution.status === ResolutionStatus.Acknowledged)
                          ) {
                            return resolution.resolutionType;
                          }
                          return 'Pending Decision';
                        })()}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      {isModalOpen && selectedNte && selectedReport && (
        <NTEModal
          nte={selectedNte}
          report={selectedReport}
          onClose={() => {
            setIsModalOpen(false);
            setSelectedNte(null);
            setSelectedReport(null);
            loadData();
          }}
          onSave={() => {
            setIsModalOpen(false);
            setSelectedNte(null);
            setSelectedReport(null);
            loadData();
          }}
        />
      )}
    </div>
  );
}
