import React, { useState, useMemo, useEffect } from 'react';
import { Memo, Permission } from '../../types';
import { mockBusinessUnits } from '../../services/mockData';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import MemoModal from '../../components/feedback/MemoModal';
import Input from '../../components/ui/Input';
import { usePermissions } from '../../hooks/usePermissions';
import MemoViewModal from '../../components/feedback/MemoViewModal';
import { supabase } from '../../services/supabaseClient';

const getStatusColor = (status: 'Published' | 'Draft' | 'Archived') => {
    switch (status) {
        case 'Published': return 'bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300';
        case 'Draft': return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/50 dark:text-yellow-300';
        case 'Archived': return 'bg-gray-200 text-gray-800 dark:bg-gray-700 dark:text-gray-300';
        default: return 'bg-gray-100 text-gray-800';
    }
};

const MemoLibrary: React.FC = () => {
    const [memos, setMemos] = useState<Memo[]>([]);
    const [loading, setLoading] = useState(false);
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [isViewModalOpen, setIsViewModalOpen] = useState(false);
    const [selectedMemo, setSelectedMemo] = useState<Memo | null>(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [tagFilter, setTagFilter] = useState('');
    const [statusFilter, setStatusFilter] = useState('');
    const [yearFilter, setYearFilter] = useState('');
    const [monthFilter, setMonthFilter] = useState('');
    const [buFilter, setBuFilter] = useState('');


    const { can, getAccessibleBusinessUnits } = usePermissions();
    const canManageMemos = can('Feedback', Permission.Edit);

    const accessibleBus = useMemo(() => getAccessibleBusinessUnits(mockBusinessUnits), [getAccessibleBusinessUnits]);

    const extractBodyFromRow = (row: any) => {
        const candidates = ['body', 'content', 'html', 'memo_body', 'memoBody', 'body_text', 'bodyHtml'];
        for (const key of candidates) {
            const val = row?.[key];
            if (typeof val === 'string' && val.trim().length > 0) return val as string;
            if (val && typeof val === 'object') {
                try {
                    const str = JSON.stringify(val);
                    if (str.length > 2) return str;
                } catch (e) {
                    // ignore
                }
            }
        }
        // Heuristic fallback: longest string field excluding obvious metadata
        let fallback = '';
        Object.entries(row || {}).forEach(([key, val]) => {
            if (typeof val === 'string' && !['title', 'status'].includes(key)) {
                if (val.length > fallback.length) {
                    fallback = val;
                }
            }
        });
        return fallback;
    };

    const loadMemos = async () => {
        setLoading(true);
        try {
            const { data, error } = await supabase
                .from('memos')
                .select('*')
                .order('effective_date', { ascending: false });
            if (error) throw error;
            const mapped: Memo[] = (data || []).map((row: any) => {
                const body = extractBodyFromRow(row);
                return {
                id: row.id,
                title: row.title,
                body,
                effectiveDate: row.effective_date ? new Date(row.effective_date) : new Date(),
                targetDepartments: row.target_departments || [],
                targetBusinessUnits: row.target_business_units || [],
                acknowledgementRequired: row.acknowledgement_required ?? false,
                tags: row.tags || [],
                attachments: row.attachments || [],
                acknowledgementTracker: row.acknowledgement_tracker || [],
                status: row.status || 'Draft',
                };
            });
            setMemos(mapped);
        } catch (err) {
            console.error('Failed to load memos', err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadMemos();
    }, []);

    const allTags = useMemo(() => {
        const tags = new Set<string>();
        memos.forEach(memo => memo.tags.forEach(tag => tags.add(tag)));
        return Array.from(tags).sort();
    }, [memos]);

    const allYears = useMemo(() => {
        const years = new Set<string>();
        memos.forEach(memo => years.add(new Date(memo.effectiveDate).getFullYear().toString()));
        return Array.from(years).sort((a, b) => b.localeCompare(a));
    }, [memos]);

    const monthOptions = [
        { value: '1', name: 'January' }, { value: '2', name: 'February' }, { value: '3', name: 'March' },
        { value: '4', name: 'April' }, { value: '5', name: 'May' }, { value: '6', name: 'June' },
        { value: '7', name: 'July' }, { value: '8', name: 'August' }, { value: '9', name: 'September' },
        { value: '10', name: 'October' }, { value: '11', name: 'November' }, { value: '12', name: 'December' }
    ];

    const filteredMemos = useMemo(() => {
        return memos.filter(memo => {
            const searchTermMatch = !searchTerm || 
                memo.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
                memo.tags.some(tag => tag.toLowerCase().includes(searchTerm.toLowerCase()));
            
            const statusMatch = !statusFilter || memo.status === statusFilter;
            const tagMatch = !tagFilter || memo.tags.includes(tagFilter);
            const yearMatch = !yearFilter || new Date(memo.effectiveDate).getFullYear().toString() === yearFilter;
            const monthMatch = !monthFilter || (new Date(memo.effectiveDate).getMonth() + 1).toString() === monthFilter;
            
            // BU Match: If memo targets "All", or if it targets a BU selected in filter.
            // Also implicitly filter for user scope: user should only see memos relevant to their accessible BUs?
            // For now, we just filter based on the dropdown selection which is populated by accessible BUs.
            const buMatch = !buFilter || memo.targetBusinessUnits.includes('All') || memo.targetBusinessUnits.includes(buFilter);

            return searchTermMatch && statusMatch && tagMatch && yearMatch && monthMatch && buMatch;
        });
    }, [memos, searchTerm, statusFilter, tagFilter, yearFilter, monthFilter, buFilter]);

    const handleOpenEditModal = async (memo: Memo | null) => {
        if (memo?.id) {
            try {
                const { data, error } = await supabase
                    .from('memos')
                    .select('*')
                    .eq('id', memo.id)
                    .single();
                if (error) throw error;
                const hydrated: Memo = {
                    id: data.id,
                    title: data.title,
                    body: extractBodyFromRow(data),
                    effectiveDate: data.effective_date ? new Date(data.effective_date) : new Date(),
                    targetDepartments: data.target_departments || [],
                    targetBusinessUnits: data.target_business_units || [],
                    acknowledgementRequired: data.acknowledgement_required ?? false,
                    tags: data.tags || [],
                    attachments: data.attachments || [],
                    acknowledgementTracker: data.acknowledgement_tracker || [],
                    status: data.status || 'Draft',
                };
                setSelectedMemo(hydrated);
            } catch (err) {
                console.error('Failed to load memo body', err);
                setSelectedMemo(memo);
            }
        } else {
            setSelectedMemo(memo);
        }
        setIsEditModalOpen(true);
    };

    const handleOpenViewModal = (memo: Memo) => {
        setSelectedMemo(memo);
        setIsViewModalOpen(true);
    };

    const handleCloseModals = () => {
        setIsEditModalOpen(false);
        setIsViewModalOpen(false);
        setSelectedMemo(null);
    };

    const handleSaveMemo = async (memoToSave: Partial<Memo>) => {
        if (!memoToSave.title || !memoToSave.body || !memoToSave.effectiveDate) {
            return;
        }

        const payload = {
            title: memoToSave.title,
            body: memoToSave.body,
            effective_date: memoToSave.effectiveDate instanceof Date ? memoToSave.effectiveDate.toISOString() : new Date(memoToSave.effectiveDate).toISOString(),
            target_departments: memoToSave.targetDepartments || [],
            target_business_units: memoToSave.targetBusinessUnits || [],
            acknowledgement_required: memoToSave.acknowledgementRequired ?? false,
            tags: memoToSave.tags || [],
            attachments: memoToSave.attachments || [],
            acknowledgement_tracker: memoToSave.acknowledgementTracker || [],
            status: memoToSave.status || 'Draft',
        };

        try {
            let saved;
            if (memoToSave.id) {
                const { data, error } = await supabase
                    .from('memos')
                    .update(payload)
                    .eq('id', memoToSave.id)
                    .select()
                    .single();
                if (error) throw error;
                saved = data;
            } else {
                const { data, error } = await supabase
                    .from('memos')
                    .insert(payload)
                    .select()
                    .single();
                if (error) throw error;
                saved = data;
            }

            const mapped: Memo = {
                id: saved.id,
                title: saved.title,
                body: saved.body || '',
                effectiveDate: saved.effective_date ? new Date(saved.effective_date) : new Date(),
                targetDepartments: saved.target_departments || [],
                targetBusinessUnits: saved.target_business_units || [],
                acknowledgementRequired: saved.acknowledgement_required ?? false,
                tags: saved.tags || [],
                attachments: saved.attachments || [],
                acknowledgementTracker: saved.acknowledgement_tracker || [],
                status: saved.status || 'Draft',
            };

            setMemos(prev => {
                const exists = prev.find(m => m.id === mapped.id);
                if (exists) {
                    return prev.map(m => (m.id === mapped.id ? mapped : m));
                }
                return [mapped, ...prev];
            });
            handleCloseModals();
        } catch (err) {
            console.error('Failed to save memo', err);
            alert('Failed to save memo. Please try again.');
        }
    };

    const selectClasses = "mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md dark:bg-slate-700 dark:border-slate-600 dark:text-white";

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Memo Library</h1>
                {canManageMemos && <Button onClick={() => handleOpenEditModal(null)}>New Memo</Button>}
            </div>
            <p className="text-gray-600 dark:text-gray-400 -mt-4">Central hub for all company memos — create, publish, and track official announcements and policy updates.</p>
            <Card>
                <div className="p-4 border-b border-gray-200 dark:border-gray-700 space-y-4">
                    <Input
                        label="Search Memos"
                        id="memo-search"
                        placeholder="Search by title or tag..."
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                    />
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
                         <div>
                            <label htmlFor="bu-filter" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Business Unit</label>
                            <select id="bu-filter" value={buFilter} onChange={e => setBuFilter(e.target.value)} className={selectClasses}>
                                <option value="">All Accessible BUs</option>
                                {accessibleBus.map(bu => <option key={bu.id} value={bu.name}>{bu.name}</option>)}
                            </select>
                        </div>
                        <div>
                            <label htmlFor="status-filter" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Status</label>
                            <select id="status-filter" value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className={selectClasses}>
                                <option value="">All Statuses</option>
                                <option value="Published">Published</option>
                                <option value="Draft">Draft</option>
                                <option value="Archived">Archived</option>
                            </select>
                        </div>
                        <div>
                            <label htmlFor="tag-filter" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Tag</label>
                            <select id="tag-filter" value={tagFilter} onChange={e => setTagFilter(e.target.value)} className={selectClasses}>
                                <option value="">All Tags</option>
                                {allTags.map(tag => <option key={tag} value={tag}>{tag}</option>)}
                            </select>
                        </div>
                        <div>
                            <label htmlFor="year-filter" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Effective Year</label>
                            <select id="year-filter" value={yearFilter} onChange={e => setYearFilter(e.target.value)} className={selectClasses}>
                                <option value="">All Years</option>
                                {allYears.map(year => <option key={year} value={year}>{year}</option>)}
                            </select>
                        </div>
                        <div>
                            <label htmlFor="month-filter" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Effective Month</label>
                            <select id="month-filter" value={monthFilter} onChange={e => setMonthFilter(e.target.value)} className={selectClasses}>
                                <option value="">All Months</option>
                                {monthOptions.map(month => <option key={month.value} value={month.value}>{month.name}</option>)}
                            </select>
                        </div>
                    </div>
                </div>
                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                        <thead className="bg-gray-50 dark:bg-gray-700">
                            <tr>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Title</th>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Effective Date</th>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Target Audience</th>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Status</th>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Tags</th>
                                <th scope="col" className="relative px-6 py-3">
                                    <span className="sr-only">Edit</span>
                                </th>
                            </tr>
                        </thead>
                        <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                            {!loading && filteredMemos.map(memo => (
                                <tr key={memo.id} onClick={() => handleOpenViewModal(memo)} className="hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer">
                                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white">{memo.title}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{new Date(memo.effectiveDate).toLocaleDateString()}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                                        {memo.targetBusinessUnits?.length > 0 && <div><span className="font-semibold">BUs:</span> {memo.targetBusinessUnits.join(', ')}</div>}
                                        {memo.targetDepartments?.length > 0 && <div><span className="font-semibold">Depts:</span> {memo.targetDepartments.join(', ')}</div>}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                                        <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${getStatusColor(memo.status)}`}>
                                            {memo.status}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                                        {memo.tags.map(tag => <span key={tag} className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-100 text-green-800 mr-1">{tag}</span>)}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                        {canManageMemos && (
                                            <Button variant="secondary" size="sm" onClick={(e) => { e.stopPropagation(); handleOpenEditModal(memo); }}>Edit</Button>
                                        )}
                                    </td>
                                </tr>
                            ))}
                            {loading && (
                                <tr>
                                    <td colSpan={6} className="px-6 py-6 text-center text-sm text-gray-500 dark:text-gray-400">Loading memos...</td>
                                </tr>
                            )}
                            {!loading && filteredMemos.length === 0 && (
                                <tr>
                                    <td colSpan={6} className="px-6 py-6 text-center text-sm text-gray-500 dark:text-gray-400">No memos found.</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </Card>
            
            {canManageMemos && (
                <MemoModal
                    isOpen={isEditModalOpen}
                    onClose={handleCloseModals}
                    memo={selectedMemo}
                    onSave={handleSaveMemo}
                />
            )}

            <MemoViewModal
                isOpen={isViewModalOpen}
                onClose={handleCloseModals}
                memo={selectedMemo}
            />
        </div>
    );
};

export default MemoLibrary;
