import React, { useEffect, useMemo, useState } from 'react';
import { Holiday, HolidayType, Permission } from '../../types';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import HolidayModal from '../../components/admin/HolidayModal';
import { usePermissions } from '../../hooks/usePermissions';
import { supabase } from '../../services/supabaseClient';

const CalendarIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>;
const TrashIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>;
const PencilIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.5L15.232 5.232z" /></svg>;
const RefreshIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>;

const Holidays: React.FC = () => {
    const { can } = usePermissions();
    const canView = can('Holidays', Permission.View);
    const canManage = can('Holidays', Permission.Manage);

    const [holidays, setHolidays] = useState<Holiday[]>([]);
    const [yearFilter, setYearFilter] = useState<string>(new Date().getFullYear().toString());
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingHoliday, setEditingHoliday] = useState<Holiday | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState<boolean>(false);

    useEffect(() => {
        const loadData = async () => {
            setLoading(true);
            setError(null);
            const { data, error: err } = await supabase
                .from('holidays')
                .select('id, name, date, type, is_paid')
                .order('date', { ascending: true });
            if (err) {
                setError(err.message);
                setLoading(false);
                return;
            }
            setHolidays(
                (data || []).map((h: any) => ({
                    id: h.id,
                    name: h.name,
                    date: new Date(h.date),
                    type: h.type as HolidayType,
                    isPaid: !!h.is_paid,
                }))
            );
            setLoading(false);
        };
        loadData();
    }, []);

    const availableYears = useMemo(() => {
        const years = new Set(holidays.map(h => new Date(h.date).getFullYear()));
        years.add(new Date().getFullYear());
        years.add(new Date().getFullYear() + 1);
        return Array.from(years).sort((a: number, b: number) => b - a);
    }, [holidays]);

    const filteredHolidays = useMemo(() => {
        return holidays
            .filter(h => new Date(h.date).getFullYear().toString() === yearFilter)
            .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    }, [holidays, yearFilter]);

    const handleOpenModal = (holiday: Holiday | null) => {
        setEditingHoliday(holiday);
        setIsModalOpen(true);
    };

    const handleSave = async (holidayToSave: Holiday) => {
        setError(null);
        if (!holidayToSave.name || !holidayToSave.date) {
            alert('Holiday Name and Date are required.');
            return;
        }
        const payload = {
            name: holidayToSave.name,
            date: new Date(holidayToSave.date).toISOString().split('T')[0],
            type: holidayToSave.type,
            is_paid: holidayToSave.isPaid,
        };
        if (holidayToSave.id) {
            const { error: err } = await supabase.from('holidays').update(payload).eq('id', holidayToSave.id);
            if (err) {
                setError(err.message);
                return;
            }
            setHolidays(prev => prev.map(h => h.id === holidayToSave.id ? { ...holidayToSave } : h));
        } else {
            const { data, error: err } = await supabase.from('holidays').insert(payload).select('id').single();
            if (err) {
                setError(err.message);
                return;
            }
            setHolidays(prev => [...prev, { ...holidayToSave, id: data?.id }]);
        }
        setIsModalOpen(false);
    };

    const handleDelete = async (id: string) => {
        if (!window.confirm("Are you sure you want to delete this holiday?")) return;
        const { error: err } = await supabase.from('holidays').delete().eq('id', id);
        if (err) {
            setError(err.message);
            return;
        }
        setHolidays(prev => prev.filter(h => h.id !== id));
    };
    
    const handleSync = () => {
        const confirmed = window.confirm("This will open the Official Philippine Holiday Calendar in a new tab for reference.");
        if (confirmed) {
             window.open('https://calendar.google.com/calendar/embed?src=en.philippines%23holiday%40group.v.calendar.google.com', '_blank');
        }
    };

    const getHolidayTypeColor = (type: HolidayType) => {
        switch(type) {
            case HolidayType.Regular: return 'bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-200';
            case HolidayType.SpecialNonWorking: return 'bg-orange-100 text-orange-800 dark:bg-orange-900/50 dark:text-orange-200';
            case HolidayType.DoublePay: return 'bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-200';
            default: return 'bg-gray-100 text-gray-800';
        }
    };

    if (!canView) {
        return (
            <Card>
                <div className="p-6 text-center text-gray-600 dark:text-gray-300">
                    You do not have permission to view this page.
                </div>
            </Card>
        );
    }

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row justify-between items-center gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Holiday Management</h1>
                    <p className="text-gray-600 dark:text-gray-400 mt-1">Configure holidays for payroll calculation and attendance.</p>
                </div>
                <div className="flex space-x-2">
                    <Button variant="secondary" onClick={handleSync}>
                        <RefreshIcon /> Sync / View Google Calendar
                    </Button>
                    {canManage && <Button onClick={() => handleOpenModal(null)}>Add Holiday</Button>}
                </div>
            </div>

            {error && (
                <Card>
                    <div className="p-3 text-sm text-red-600 dark:text-red-400">{error}</div>
                </Card>
            )}
            {loading && (
                <Card>
                    <div className="p-3 text-sm text-gray-600 dark:text-gray-300">Loading holidays...</div>
                </Card>
            )}

            <Card>
                <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex items-center space-x-4">
                    <label htmlFor="yearFilter" className="font-medium text-gray-700 dark:text-gray-300">Filter by Year:</label>
                    <select 
                        id="yearFilter" 
                        value={yearFilter} 
                        onChange={e => setYearFilter(e.target.value)}
                        className="border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                    >
                        {availableYears.map(year => <option key={year} value={year}>{year}</option>)}
                    </select>
                </div>
                
                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                        <thead className="bg-gray-50 dark:bg-gray-800">
                            <tr>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Date</th>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Holiday Name</th>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Type</th>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Paid?</th>
                                {canManage && <th scope="col" className="relative px-6 py-3"><span className="sr-only">Actions</span></th>}
                            </tr>
                        </thead>
                        <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-700">
                            {filteredHolidays.map(holiday => (
                                <tr key={holiday.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400 flex items-center">
                                        <CalendarIcon />
                                        {new Date(holiday.date).toLocaleDateString('en-US', { weekday: 'short', month: 'long', day: 'numeric' })}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white">{holiday.name}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                                        <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${getHolidayTypeColor(holiday.type)}`}>
                                            {holiday.type}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                                        {holiday.isPaid ? 'Yes' : 'No'}
                                    </td>
                                    {canManage && (
                                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                            <div className="flex justify-end space-x-2">
                                                <Button size="sm" variant="secondary" onClick={() => handleOpenModal(holiday)} className="!p-2"><PencilIcon/></Button>
                                                <Button size="sm" variant="danger" onClick={() => handleDelete(holiday.id)} className="!p-2"><TrashIcon/></Button>
                                            </div>
                                        </td>
                                    )}
                                </tr>
                            ))}
                            {filteredHolidays.length === 0 && (
                                <tr>
                                    <td colSpan={5} className="px-6 py-4 text-center text-gray-500 dark:text-gray-400">No holidays found for this year.</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </Card>

            <HolidayModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                holiday={editingHoliday}
                onSave={handleSave}
            />
        </div>
    );
};

export default Holidays;
