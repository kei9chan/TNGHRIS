import React, { useState, useEffect, useCallback } from "react";
import { PayrollStagingRecord, Role, Permission } from "../../types";
import { useAuth } from "../../hooks/useAuth";
import { usePermissions } from "../../hooks/usePermissions";
import { logActivity } from "../../services/auditService";
import { fetchUsers } from "../../services/userService";
import { fetchAttendanceRecords, fetchOTRequests } from "../../services/timekeepingService";
import { savePayslip } from "../../services/payrollService";
import Card from "../../components/ui/Card";
import Input from "../../components/ui/Input";
import Button from "../../components/ui/Button";

const REGULAR_RATE = 20;
const OT_RATE = 30;

const PayslipStaging: React.FC = () => {
    const { user } = useAuth();
    const { can } = usePermissions();
    const today = new Date();
    const [startDate, setStartDate] = useState(new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split("T")[0]);
    const [endDate, setEndDate] = useState(new Date(today.getFullYear(), today.getMonth() + 1, 0).toISOString().split("T")[0]);
    const [isLocked, setIsLocked] = useState(false);
    const [payrollData, setPayrollData] = useState<PayrollStagingRecord[]>([]);
    const [editModes, setEditModes] = useState<Record<string, boolean>>({});
    const [editData, setEditData] = useState<Partial<PayrollStagingRecord>>({});
    const [payslipsGenerated, setPayslipsGenerated] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const canManage = can("PayrollStaging", Permission.Manage);
    const canEdit = can("PayrollStaging", Permission.Edit);

    const generatePayrollData = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        try {
            const start = new Date(startDate);
            const end = new Date(endDate);
            end.setHours(23, 59, 59, 999);
            const [allUsers, attendance, otRequests] = await Promise.all([
                fetchUsers(), fetchAttendanceRecords(), fetchOTRequests(),
            ]);
            const data: PayrollStagingRecord[] = allUsers
                .filter(u => u.role === Role.Employee)
                .map(emp => {
                    const att = attendance.filter(r => r.employeeId === emp.id && new Date(r.date) >= start && new Date(r.date) <= end);
                    const ot = otRequests.filter(r => r.employeeId === emp.id && (r.status as string) === "Approved" && new Date(r.date) >= start && new Date(r.date) <= end);
                    const regularHours = att.reduce((s, r) => s + ((r as any).totalWorkMinutes ?? ((r as any).hoursWorked || 0) * 60), 0) / 60;
                    const overtimeHours = ot.reduce((s, r) => s + (r.approvedHours || 0), 0);
                    const allowances = 0, deductions = 0;
                    const grossPay = (regularHours * REGULAR_RATE) + (overtimeHours * OT_RATE) + allowances;
                    return { id: `${emp.id}-${startDate}`, employeeId: emp.id, employeeName: emp.name, payPeriodStart: start, payPeriodEnd: end, regularHours, overtimeHours, allowances, deductions, grossPay, netPay: grossPay - deductions };
                });
            setPayrollData(data);
            setPayslipsGenerated(false);
        } catch (err: any) { setError(err.message || "Failed to load data."); }
        finally { setIsLoading(false); }
    }, [startDate, endDate]);

    useEffect(() => { generatePayrollData(); }, [generatePayrollData]);

    const handleEdit = (rec: PayrollStagingRecord) => { setEditModes(p => ({ ...p, [rec.id]: true })); setEditData({ allowances: rec.allowances, deductions: rec.deductions }); };
    const handleCancel = (id: string) => { setEditModes(p => ({ ...p, [id]: false })); setEditData({}); };
    const handleSave = (id: string) => {
        setPayrollData(prev => prev.map(rec => {
            if (rec.id !== id) return rec;
            const allowances = editData.allowances ?? rec.allowances;
            const deductions = editData.deductions ?? rec.deductions;
            const grossPay = (rec.regularHours * REGULAR_RATE) + (rec.overtimeHours * OT_RATE) + allowances;
            return { ...rec, allowances, deductions, grossPay, netPay: grossPay - deductions };
        }));
        handleCancel(id);
    };

    const handleGeneratePayslips = async () => {
        setIsSaving(true); setError(null);
        try {
            for (const rec of payrollData) {
                await savePayslip({ employeeId: rec.employeeId, employeeName: rec.employeeName, periodStart: rec.payPeriodStart, periodEnd: rec.payPeriodEnd, basicPay: rec.regularHours * REGULAR_RATE, overtimePay: rec.overtimeHours * OT_RATE, holidayPay: 0, nightDiff: 0, allowances: rec.allowances, deMinimis: 0, grossPay: rec.grossPay, sss: 0, philhealth: 0, pagibig: 0, tax: 0, otherDeductions: rec.deductions, totalDeductions: rec.deductions, netPay: rec.netPay, status: "draft" });
            }
            await logActivity(user, "GENERATE", "Payslips", `Batch-${startDate}-to-${endDate}`, `Generated ${payrollData.length} payslips.`);
            alert(`${payrollData.length} payslip record(s) generated.`);
            setPayslipsGenerated(true);
        } catch (err: any) { setError(err.message || "Failed to generate payslips."); }
        finally { setIsSaving(false); }
    };

    return (
        <div className="space-y-6">
            <div><h1 className="text-3xl font-bold text-gray-900 dark:text-white">Payroll Staging</h1><p className="text-gray-600 dark:text-gray-400 mt-1">Generate, review, and finalize payroll data before processing.</p></div>
            {error && <div className="bg-red-50 dark:bg-red-900/20 border border-red-300 dark:border-red-700 text-red-700 dark:text-red-300 px-4 py-3 rounded-md">{error}</div>}
            <Card>
                <div className="grid grid-cols-1 md:grid-cols-4 lg:grid-cols-5 gap-4 p-4 items-end">
                    <Input label="Pay Period Start" type="date" name="startDate" value={startDate} onChange={e => setStartDate(e.target.value)} />
                    <Input label="Pay Period End" type="date" name="endDate" value={endDate} onChange={e => setEndDate(e.target.value)} />
                    <Button onClick={generatePayrollData} className="w-full" disabled={isLoading}>{isLoading ? "Loading..." : "Generate"}</Button>
                    {canManage && (
                        <label htmlFor="lock-toggle" className="flex items-center cursor-pointer">
                            <div className="relative"><input type="checkbox" id="lock-toggle" className="sr-only" checked={isLocked} onChange={() => setIsLocked(v => !v)} /><div className={`block w-14 h-8 rounded-full ${isLocked ? "bg-red-500" : "bg-gray-300"}`}></div><div className={`dot absolute left-1 top-1 bg-white w-6 h-6 rounded-full transition-transform ${isLocked ? "translate-x-6" : ""}`}></div></div>
                            <span className="ml-3 text-gray-700 dark:text-gray-300 font-medium">{isLocked ? "Locked" : "Unlocked"}</span>
                        </label>
                    )}
                    {isLocked && canManage && <Button onClick={handleGeneratePayslips} disabled={payslipsGenerated || isSaving} className="w-full">{isSaving ? "Saving..." : payslipsGenerated ? "Generated" : "Generate Payslips"}</Button>}
                </div>
            </Card>
            <Card>
                <div className="overflow-x-auto">
                    {isLoading ? <div className="text-center py-10 text-gray-500 dark:text-gray-400">Loading payroll data...</div> : (
                    <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                        <thead className="bg-gray-50 dark:bg-gray-700">
                            <tr>{["Employee","Reg. Hrs","OT Hrs","Allowances","Deductions","Gross Pay","Net Pay"].map(h => <th key={h} scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">{h}</th>)}{canEdit && <th scope="col" className="relative px-4 py-3"><span className="sr-only">Actions</span></th>}</tr>
                        </thead>
                        <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                            {payrollData.map(rec => (
                                <tr key={rec.id} className={editModes[rec.id] ? "bg-indigo-50 dark:bg-indigo-900/10" : ""}>
                                    <td className="px-4 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white">{rec.employeeName}</td>
                                    <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{rec.regularHours.toFixed(2)}</td>
                                    <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{rec.overtimeHours.toFixed(2)}</td>
                                    <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{editModes[rec.id] ? <input type="number" value={editData.allowances ?? rec.allowances} onChange={e => setEditData(p => ({ ...p, allowances: parseFloat(e.target.value) || 0 }))} className="w-24 p-1 rounded-md border-gray-300 dark:bg-gray-700" /> : `₱${rec.allowances.toFixed(2)}`}</td>
                                    <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{editModes[rec.id] ? <input type="number" value={editData.deductions ?? rec.deductions} onChange={e => setEditData(p => ({ ...p, deductions: parseFloat(e.target.value) || 0 }))} className="w-24 p-1 rounded-md border-gray-300 dark:bg-gray-700" /> : `₱${rec.deductions.toFixed(2)}`}</td>
                                    <td className="px-4 py-4 whitespace-nowrap text-sm font-semibold text-gray-700 dark:text-gray-300">₱{rec.grossPay.toFixed(2)}</td>
                                    <td className="px-4 py-4 whitespace-nowrap text-sm font-bold text-green-600 dark:text-green-400">₱{rec.netPay.toFixed(2)}</td>
                                    {canEdit && <td className="px-4 py-4 whitespace-nowrap text-right text-sm">{editModes[rec.id] ? <div className="flex space-x-2"><Button size="sm" onClick={() => handleSave(rec.id)}>✓</Button><Button size="sm" variant="secondary" onClick={() => handleCancel(rec.id)}>✕</Button></div> : <Button size="sm" variant="secondary" onClick={() => handleEdit(rec)} disabled={isLocked}>✎</Button>}</td>}
                                </tr>
                            ))}
                            {payrollData.length === 0 && <tr><td colSpan={canEdit ? 8 : 7} className="text-center py-10 text-gray-500 dark:text-gray-400">No employee records found for the selected pay period.</td></tr>}
                        </tbody>
                    </table>
                    )}
                </div>
            </Card>
        </div>
    );
};

export default PayslipStaging;
