import React, { useState, useMemo, useEffect } from "react";
import { PayslipRecord, Role, BusinessUnit, User } from "../../types";
import { useAuth } from "../../hooks/useAuth";
import { usePermissions } from "../../hooks/usePermissions";
import { fetchUsers, fetchBusinessUnits } from "../../services/userService";
import { fetchPayslips, savePayslip } from "../../services/payrollService";
import Card from "../../components/ui/Card";
import Button from "../../components/ui/Button";
import PayslipPreviewModal from "../../components/payroll/PayslipPreviewModal";
import PrintablePayslips from "../../components/payroll/PrintablePayslips";
import PayslipCard from "../../components/payroll/PayslipCard";

const Payslips: React.FC = () => {
    const { user } = useAuth();
    const { getAccessibleBusinessUnits } = usePermissions();
    const [allPayslips, setAllPayslips] = useState<PayslipRecord[]>([]);
    const [allUsers, setAllUsers] = useState<User[]>([]);
    const [businessUnits, setBusinessUnits] = useState<BusinessUnit[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [isPreviewOpen, setIsPreviewOpen] = useState(false);
    const [isPrinting, setIsPrinting] = useState(false);
    const [payslipToPrint, setPayslipToPrint] = useState<PayslipRecord | null>(null);
    const [selectedPayslip, setSelectedPayslip] = useState<PayslipRecord | null>(null);
    const [selectedPeriod, setSelectedPeriod] = useState<string>("");

    const isHRView = user?.role === Role.Admin || user?.role === Role.HRManager;
    const isBODView = user?.role === Role.BOD;

    const accessibleBus = useMemo(
        () => getAccessibleBusinessUnits(businessUnits),
        [getAccessibleBusinessUnits, businessUnits]
    );

    useEffect(() => {
        const load = async () => {
            try {
                setIsLoading(true);
                setError(null);
                const [payslips, users, bus] = await Promise.all([
                    fetchPayslips(), fetchUsers(), fetchBusinessUnits(),
                ]);
                setAllPayslips(payslips);
                setAllUsers(users);
                setBusinessUnits(bus);
            } catch (err: any) {
                setError(err.message || "Failed to load payslips.");
            } finally {
                setIsLoading(false);
            }
        };
        load();
    }, []);

    const formatDateRange = (start: Date, end: Date) =>
        `${new Date(start).toLocaleDateString()} - ${new Date(end).toLocaleDateString()}`;

    const viewablePayslips = useMemo(() => {
        if (!user) return [];
        if (isHRView || isBODView) {
            const accessibleBuNames = new Set(accessibleBus.map(b => b.name));
            return allPayslips.filter(p => {
                const emp = allUsers.find(u => u.id === p.employeeId);
                const isAccessible = emp && accessibleBuNames.has(emp.businessUnit);
                const statusOk = isBODView ? p.status === "published" : true;
                return isAccessible && statusOk;
            });
        }
        return allPayslips.filter(p => p.employeeId === user.id && p.status === "published");
    }, [user, allPayslips, allUsers, isHRView, isBODView, accessibleBus]);

    const payPeriods = useMemo(() => {
        const unique: string[] = Array.from(new Set(viewablePayslips.map(p => formatDateRange(p.payPeriodStart ?? p.periodStart, p.payPeriodEnd ?? p.periodEnd))));
        return unique.sort((a, b) => new Date(b.split(" - ")[0]).getTime() - new Date(a.split(" - ")[0]).getTime());
    }, [viewablePayslips]);

    useEffect(() => {
        if (payPeriods.length > 0 && !payPeriods.includes(selectedPeriod)) setSelectedPeriod(payPeriods[0]);
        else if (payPeriods.length === 0) setSelectedPeriod("");
    }, [payPeriods]);

    const filteredPayslips = useMemo(() => {
        if (!selectedPeriod) return [];
        return viewablePayslips.filter(p => formatDateRange(p.payPeriodStart ?? p.periodStart, p.payPeriodEnd ?? p.periodEnd) === selectedPeriod);
    }, [viewablePayslips, selectedPeriod]);

    const updatePayslipStatus = async (payslipId: string, status: string) => {
        try {
            const target = allPayslips.find(p => p.id === payslipId);
            if (!target) return;
            const updated = await savePayslip({ ...target, status } as any);
            setAllPayslips(prev => prev.map(p => p.id === payslipId ? updated : p));
        } catch (err: any) {
            setError(err.message || "Failed to update payslip status.");
        }
    };

    const handleItemizedChange = (payslipId: string, breakdownType: "earningsBreakdown" | "deductionsBreakdown", field: string, value: string) => {
        const numericValue = parseFloat(value) || 0;
        setAllPayslips(prev => prev.map(p => {
            if (p.id !== payslipId) return p;
            const updated = { ...p, [breakdownType]: { ...(p[breakdownType] || {}), [field]: numericValue } };
            const totalEarnings = (updated.earningsBreakdown?.regularPay || 0) + (updated.earningsBreakdown?.otPay || 0) + (updated.earningsBreakdown?.allowances || 0);
            const totalDeductions = (updated.deductionsBreakdown?.sss || 0) + (updated.deductionsBreakdown?.pagibig || 0) + (updated.deductionsBreakdown?.philhealth || 0) + (updated.deductionsBreakdown?.tax || 0);
            return { ...updated, totalEarnings, totalDeductions, netPay: totalEarnings - totalDeductions };
        }));
    };

    const handlePreview = (payslip: PayslipRecord) => { setSelectedPayslip(payslip); setIsPreviewOpen(true); };
    const handleRegenerate = (payslip: PayslipRecord) => { const updated = { ...payslip, lastGenerated: new Date() }; setAllPayslips(prev => prev.map(p => p.id === payslip.id ? updated : p)); handlePreview(updated); };
    const handlePublish = (id: string) => updatePayslipStatus(id, "published");
    const handleUnpublish = (id: string) => updatePayslipStatus(id, "unpublished");
    const handleDownloadSingle = (payslip: PayslipRecord) => setPayslipToPrint(payslip);

    const handleMassPublish = async () => {
        const targets = allPayslips.filter(p => p.status !== "published" && formatDateRange(p.payPeriodStart ?? p.periodStart, p.payPeriodEnd ?? p.periodEnd) === selectedPeriod);
        if (targets.length === 0) { alert("All payslips in this period are already published."); return; }
        if (!window.confirm(`Publish ${targets.length} payslip(s)?`)) return;
        for (const p of targets) await updatePayslipStatus(p.id, "published");
    };

    if (isLoading) return <div className="text-center py-20 text-gray-500 dark:text-gray-400">Loading payslips...</div>;

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-3xl font-bold text-gray-900 dark:text-white">{isHRView ? "Generated Payslip Records" : isBODView ? "Published Payslips" : "My Payslips"}</h1>
                    <p className="text-gray-600 dark:text-gray-400">{isHRView ? "Administrative view of all payslip records." : isBODView ? "Oversight view of all published payslip records." : "View your published payslip records."}</p>
                </div>
                {isHRView && (
                    <div className="flex space-x-2">
                        <Button onClick={handleMassPublish}>Publish All Unpublished</Button>
                        <Button variant="secondary" onClick={() => setIsPrinting(true)} disabled={filteredPayslips.length === 0}>Download All for Printing</Button>
                    </div>
                )}
            </div>
            {error && <div className="bg-red-50 dark:bg-red-900/20 border border-red-300 dark:border-red-700 text-red-700 dark:text-red-300 px-4 py-3 rounded-md">{error}</div>}
            <Card>
                <div className="p-4 flex items-center space-x-4">
                    <label htmlFor="pay-period-filter" className="block text-sm font-medium text-gray-700 dark:text-gray-300 whitespace-nowrap">Filter by Pay Period</label>
                    <select id="pay-period-filter" value={selectedPeriod} onChange={e => setSelectedPeriod(e.target.value)} className="block w-full max-w-sm pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-white">
                        {payPeriods.map(p => <option key={p} value={p}>{p}</option>)}
                    </select>
                </div>
            </Card>
            {filteredPayslips.length === 0 ? (
                <Card><div className="text-center py-10 text-gray-500 dark:text-gray-400">No payslip records found for the selected period.</div></Card>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {filteredPayslips.map(p => (
                        <PayslipCard key={p.id} payslip={p} isHRView={isHRView} isBODView={isBODView} isEditable={isHRView && p.status !== "published"} onItemizedChange={handleItemizedChange} onPreview={handlePreview} onRegenerate={handleRegenerate} onPublish={handlePublish} onUnpublish={handleUnpublish} onDownloadSingle={handleDownloadSingle} />
                    ))}
                </div>
            )}
            <PayslipPreviewModal isOpen={isPreviewOpen} onClose={() => setIsPreviewOpen(false)} payslip={selectedPayslip} />
            {isPrinting && <PrintablePayslips payslips={filteredPayslips} onClose={() => setIsPrinting(false)} />}
            {payslipToPrint && <PrintablePayslips payslips={[payslipToPrint]} onClose={() => setPayslipToPrint(null)} />}
        </div>
    );
};

export default Payslips;
