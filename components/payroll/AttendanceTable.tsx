import React, { useState, useMemo } from 'react';
import { AttendanceRecord, AttendanceException, OTRequest, LeaveRequest, User } from '../../types';
import Input from '../ui/Input';
import { mockLeaveTypes } from '../../services/mockData';

interface AttendanceTableProps {
  records: AttendanceRecord[];
  approvedOvertimes: OTRequest[];
  approvedLeaves: LeaveRequest[];
  allUsers: User[];
}

const ExceptionChip: React.FC<{ exception: AttendanceException, leaveTypeName?: string }> = ({ exception, leaveTypeName }) => {
  const styles: Record<AttendanceException, string> = {
    [AttendanceException.Late]: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
    [AttendanceException.Undertime]: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
    [AttendanceException.MissingOut]: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
    [AttendanceException.Absent]: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
    [AttendanceException.OnLeave]: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
  };
  const text = exception === AttendanceException.OnLeave ? leaveTypeName || 'ON LEAVE' : exception.replace('_', ' ');
  return (
    <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${styles[exception]}`}>
      {text}
    </span>
  );
};

const AttendanceTable: React.FC<AttendanceTableProps> = ({ records, approvedOvertimes, approvedLeaves, allUsers }) => {
  const [filterDate, setFilterDate] = useState(new Date().toISOString().split('T')[0]);
  const [filterName, setFilterName] = useState('');
  const [buFilter, setBuFilter] = useState('');

  const employeeBuMap = useMemo(() => {
    const map = new Map<string, string>();
    allUsers.forEach(user => {
        map.set(user.id, user.businessUnit);
    });
    return map;
  }, [allUsers]);

  const filteredRecords = useMemo(() => {
    return records
      .filter(r => new Date(r.date).toISOString().split('T')[0] === filterDate)
      .filter(r => r.employeeName.toLowerCase().includes(filterName.toLowerCase()))
      .filter(r => {
        if (!buFilter) return true;
        const employeeBU = employeeBuMap.get(r.employeeId);
        return employeeBU === buFilter;
      });
  }, [records, filterDate, filterName, buFilter, employeeBuMap]);

  const formatTime = (date: Date | null) => {
    if (!date) return 'N/A';
    return new Date(date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4 bg-gray-50 dark:bg-gray-900/50 rounded-lg">
        <Input
          label="Filter by Date"
          type="date"
          id="filter-date"
          value={filterDate}
          onChange={e => setFilterDate(e.target.value)}
        />
        <Input
          label="Filter by Name"
          type="text"
          id="filter-name"
          placeholder="Enter employee name..."
          value={filterName}
          onChange={e => setFilterName(e.target.value)}
        />
        <div>
            <label htmlFor="bu-filter-attendance" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Filter by Business Unit</label>
            <select
                id="bu-filter-attendance"
                value={buFilter}
                onChange={e => setBuFilter(e.target.value)}
                className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md dark:bg-slate-700 dark:border-slate-600 dark:text-white"
            >
                <option value="">All Business Units</option>
                {[...new Set(allUsers.map(u => u.businessUnit))].sort().map(bu => <option key={bu} value={bu}>{bu}</option>)}
            </select>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
          <thead className="bg-gray-50 dark:bg-gray-700">
            <tr>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Employee</th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Scheduled</th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Actual Time</th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Work Mins</th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Overtime</th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Exceptions</th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Flags</th>
            </tr>
          </thead>
          <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
            {filteredRecords.map(record => {
              const overtimeForDay = approvedOvertimes.find(ot =>
                ot.employeeId === record.employeeId &&
                new Date(ot.date).toDateString() === new Date(record.date).toDateString()
              );
              
              const leaveForDay = approvedLeaves.find(leave => 
                leave.employeeId === record.employeeId &&
                new Date(record.date) >= new Date(leave.startDate) &&
                new Date(record.date) <= new Date(leave.endDate)
              );
              
              const isOnLeave = record.exceptions.includes(AttendanceException.OnLeave) || !!leaveForDay;
              const leaveType = leaveForDay ? mockLeaveTypes.find(lt => lt.id === leaveForDay.leaveTypeId) : null;

              return (
              <tr key={record.id} className={isOnLeave ? 'bg-gray-50 dark:bg-gray-800/50' : ''}>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white">{record.employeeName}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{formatTime(record.scheduledStart)} - {formatTime(record.scheduledEnd)}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{isOnLeave ? 'N/A' : `${formatTime(record.firstIn)} - ${formatTime(record.lastOut)}`}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{isOnLeave ? 'N/A' : (record.totalWorkMinutes > 0 ? record.totalWorkMinutes : 'N/A')}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm">
                  {overtimeForDay ? (
                    <div className="bg-indigo-100 text-indigo-800 dark:bg-indigo-900/50 dark:text-indigo-300 text-xs font-medium p-2 rounded-md shadow-sm">
                        <p>{overtimeForDay.startTime} - {overtimeForDay.endTime}</p>
                        <p className="font-bold">{overtimeForDay.approvedHours?.toFixed(2)} hrs</p>
                    </div>
                  ) : (
                    <span className="text-gray-400 dark:text-gray-500">N/A</span>
                  )}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm">
                  <div className="flex flex-wrap gap-1">
                    {isOnLeave ? (
                        <ExceptionChip exception={AttendanceException.OnLeave} leaveTypeName={leaveType?.name}/>
                    ) : (
                        record.exceptions.map(ex => <ExceptionChip key={ex} exception={ex} />)
                    )}
                  </div>
                </td>
                 <td className="px-6 py-4 whitespace-nowrap text-sm">
                    {record.hasManualEntry && (
                        <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-gray-200 dark:bg-gray-600 text-gray-800 dark:text-gray-200">
                            Manual Entry
                        </span>
                    )}
                </td>
              </tr>
            )})}
             {filteredRecords.length === 0 && (
                <tr>
                    <td colSpan={7} className="text-center py-10 text-gray-500 dark:text-gray-400">
                        No attendance records found for the selected filters.
                    </td>
                </tr>
             )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default AttendanceTable;
