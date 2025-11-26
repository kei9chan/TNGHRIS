
import React, { useState, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { mockGovernmentReports, mockUsers, mockBusinessUnits } from '../../../services/mockData';
import Card from '../../../components/ui/Card';
import Button from '../../../components/ui/Button';
import NotFound from '../../NotFound';
import { User } from '../../../types';
import { usePermissions } from '../../../hooks/usePermissions';

const ArrowLeftIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>;
const PrinterIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" /></svg>;
const CodeIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" /></svg>;

// Helper to split array into chunks
const chunkArray = <T,>(array: T[], size: number): T[][] => {
    const chunked_arr: T[][] = [];
    for (let i = 0; i < array.length; i += size) {
        chunked_arr.push(array.slice(i, i + size));
    }
    return chunked_arr;
}

const GovernmentReportDetail: React.FC = () => {
    const { reportId } = useParams<{ reportId: string }>();
    const { getAccessibleBusinessUnits } = usePermissions();
    const report = mockGovernmentReports.find(r => r.id === reportId);
    
    const [selectedBuId, setSelectedBuId] = useState<string>('');
    const accessibleBus = useMemo(() => getAccessibleBusinessUnits(mockBusinessUnits), [getAccessibleBusinessUnits]);

    const selectedBu = useMemo(() => {
        return accessibleBus.find(bu => bu.id === selectedBuId);
    }, [selectedBuId, accessibleBus]);

    const buEmployees = useMemo<User[]>(() => {
        if (!selectedBu) return [];
        return mockUsers.filter(u => u.businessUnit === selectedBu.name && u.status === 'Active');
    }, [selectedBu]);

    if (!report) {
        return <NotFound />;
    }

    const handlePrint = () => {
        window.print();
    };
    
    // --- 13th Month Pay Calculation ---
    const render13thMonth = () => (
        <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700 border dark:border-gray-600">
                <thead className="bg-gray-50 dark:bg-gray-800">
                    <tr>
                        <th className="px-4 py-2 text-left text-xs font-medium uppercase">Employee</th>
                        <th className="px-4 py-2 text-left text-xs font-medium uppercase">Total Basic Salary (YTD)</th>
                        <th className="px-4 py-2 text-left text-xs font-medium uppercase">Months Worked</th>
                        <th className="px-4 py-2 text-left text-xs font-medium uppercase">13th Month Pay</th>
                    </tr>
                </thead>
                <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-700">
                    {buEmployees.map(emp => {
                        const monthly = emp.monthlySalary || 0;
                        const monthsWorked = 12; // Simplified: Assuming full year for mock
                        const totalBasic = monthly * monthsWorked;
                        const thirteenthMonth = totalBasic / 12;
                        return (
                            <tr key={emp.id}>
                                <td className="px-4 py-2">{emp.name}</td>
                                <td className="px-4 py-2">{totalBasic.toLocaleString()}</td>
                                <td className="px-4 py-2">{monthsWorked}</td>
                                <td className="px-4 py-2 font-bold">{thirteenthMonth.toLocaleString()}</td>
                            </tr>
                        )
                    })}
                </tbody>
            </table>
        </div>
    );

    // --- SSS R-1A Form Rendering ---
    const renderSSSR1A = () => {
        // SSS R-1A has exactly 15 rows
        const employeeChunks = chunkArray<User>(buEmployees, 15);
        const totalPages = employeeChunks.length || 1;
        const chunksToRender: User[][] = employeeChunks.length > 0 ? employeeChunks : [[] as User[]];

        // Component for creating individual character boxes
        const DigitBoxes = ({ value, count, className = "" }: { value: string; count: number; className?: string }) => {
            const cleanValue = value ? value.replace(/[^0-9a-zA-Z ]/g, '') : '';
            const chars = cleanValue.split('').slice(0, count);
            
            return (
                <div className={`flex h-full w-full border-black ${className}`}>
                    {Array.from({ length: count }).map((_, i) => (
                        <div key={i} className="flex-1 border-r border-black flex items-center justify-center text-[10px] font-mono leading-none last:border-r-0">
                            {chars[i] || ''}
                        </div>
                    ))}
                </div>
            );
        };

        const DateBoxes = ({ date }: { date?: Date | null }) => {
            if (!date) return <DigitBoxes value="" count={8} className="border-r" />;
            const d = new Date(date);
            // Format MMDDYYYY
            const mm = String(d.getMonth() + 1).padStart(2, '0');
            const dd = String(d.getDate()).padStart(2, '0');
            const yyyy = String(d.getFullYear());
            const val = `${mm}${dd}${yyyy}`;
            return <DigitBoxes value={val} count={8} className="border-r" />;
        };

        return (
            <div className="w-full bg-gray-200 p-4 overflow-auto">
                {/* This container simulates the paper width (Legal Landscape ~ 330mm x 216mm) */}
                <style>
                    {`
                    @media print {
                        @page { size: legal landscape; margin: 0; }
                        body * { visibility: hidden; }
                        .printable-form, .printable-form * { visibility: visible; }
                        .printable-form { position: absolute; left: 0; top: 0; width: 100%; height: 100%; }
                        .page-break { page-break-after: always; }
                        .no-print { display: none; }
                    }
                    /* Custom Grid Utilities for Form */
                    .r1a-grid-row { display: flex; border-bottom: 1px solid black; }
                    .r1a-cell { border-right: 1px solid black; display: flex; align-items: center; justify-content: center; overflow: hidden; }
                    .r1a-cell:last-child { border-right: none; }
                    .r1a-input-group { display: flex; height: 100%; width: 100%; }
                    `}
                </style>

                {chunksToRender.map((chunk, pageIndex) => (
                    <div key={pageIndex} className="printable-form bg-white text-black mx-auto mb-8 shadow-lg relative page-break" style={{ width: '330mm', minHeight: '210mm', padding: '5mm', boxSizing: 'border-box', fontFamily: 'Arial Narrow, Arial, sans-serif', fontSize: '10px' }}>
                        
                        {/* --- HEADER --- */}
                        <div className="flex items-start mb-1 relative">
                             <div className="absolute top-0 left-0">
                                 <div className="font-bold text-3xl italic border-2 border-black p-1 pr-4 pl-2">R-1A</div>
                             </div>
                             <div className="w-full text-center pt-1">
                                 <div className="text-xs">Republic of the Philippines</div>
                                 <div className="text-sm font-bold">SOCIAL SECURITY SYSTEM</div>
                                 <div className="text-2xl font-bold uppercase tracking-wider">EMPLOYMENT REPORT</div>
                             </div>
                             <div className="absolute top-0 right-0 text-[9px] text-right">
                                 <div>COV - 01229 (12-2015)</div>
                             </div>
                        </div>

                        {/* --- INSTRUCTIONS BANNER --- */}
                        <div className="border-2 border-black border-b-0 bg-gray-200 text-center font-bold py-0.5 text-[11px]">
                            THIS FORM MAY BE REPRODUCED AND IS NOT FOR SALE. THIS CAN ALSO BE DOWNLOADED THRU THE SSS WEBSITE AT www.sss.gov.ph.
                        </div>
                        <div className="border-2 border-t-0 border-black text-[9px] text-center italic mb-1">
                            PLEASE READ THE INSTRUCTIONS AT THE BACK BEFORE FILLING OUT THIS FORM. PRINT ALL INFORMATION IN CAPITAL LETTERS AND USE BLACK INK ONLY.
                        </div>

                        {/* --- PART I: EMPLOYER INFO --- */}
                        <div className="border-2 border-black border-b-0">
                            <div className="bg-gray-300 border-b border-black text-center font-bold text-[11px] py-0.5">PART I - TO BE FILLED OUT BY THE EMPLOYER</div>
                            
                            {/* Row 1 */}
                            <div className="flex border-b border-black h-10">
                                <div className="w-[25%] border-r border-black p-1 flex flex-col">
                                    <label className="text-[8px] font-bold">EMPLOYER ID NUMBER</label>
                                    <div className="flex-grow mt-1 border border-black h-5">
                                        <DigitBoxes value={selectedBu?.sssNumber || ''} count={10} />
                                    </div>
                                </div>
                                <div className="w-[50%] border-r border-black p-1 flex flex-col">
                                    <label className="text-[8px] font-bold">EMPLOYER NAME</label>
                                    <div className="text-sm font-bold uppercase pl-1">{selectedBu?.name || ''}</div>
                                </div>
                                <div className="w-[25%] p-1 flex flex-col">
                                    <div className="flex justify-between text-[8px] font-bold">
                                        <span>TYPE OF EMPLOYER</span>
                                        <span className="ml-4">TYPE OF REPORT</span>
                                    </div>
                                    <div className="flex text-[9px] mt-1">
                                        <div className="flex items-center mr-4"><div className="w-3 h-3 border border-black mr-1 bg-black"></div> Business</div>
                                        <div className="flex items-center mr-6"><div className="w-3 h-3 border border-black mr-1"></div> Household</div>
                                        
                                        <div className="flex items-center mr-2"><div className={`w-3 h-3 border border-black mr-1 ${pageIndex === 0 ? 'bg-black' : ''}`}></div> Initial</div>
                                        <div className="flex items-center"><div className={`w-3 h-3 border border-black mr-1 ${pageIndex > 0 ? 'bg-black' : ''}`}></div> Subsequent</div>
                                    </div>
                                </div>
                            </div>

                             {/* Row 2: Address */}
                             <div className="flex border-b border-black h-8">
                                <div className="w-[75%] border-r border-black p-1">
                                    <label className="block text-[8px] font-bold">ADDRESS <span className="font-normal italic">(RM./FLR./UNIT NO. & BLDG. NAME) (HOUSE/LOT & BLK. NO.) (STREET NAME) (SUBDIVISION) (BARANGAY/DISTRICT/LOCALITY) (CITY/MUNICIPALITY) (PROVINCE)</span></label>
                                    <div className="uppercase text-xs pl-1">{selectedBu?.address || ''}</div>
                                </div>
                                <div className="w-[25%] p-1 flex flex-col">
                                     <label className="block text-[8px] font-bold">ZIP CODE</label>
                                     <div className="w-16 h-4 border border-black mt-0.5">
                                        <DigitBoxes value="1234" count={4} />
                                     </div>
                                </div>
                            </div>
                            
                            {/* Row 3: Contact */}
                             <div className="flex h-8">
                                <div className="w-[20%] border-r border-black p-1">
                                    <label className="block text-[8px] font-bold">TELEPHONE NUMBER</label>
                                </div>
                                <div className="w-[20%] border-r border-black p-1">
                                    <label className="block text-[8px] font-bold">MOBILE/CELLPHONE NUMBER</label>
                                </div>
                                <div className="w-[25%] border-r border-black p-1">
                                    <label className="block text-[8px] font-bold">E-MAIL ADDRESS</label>
                                </div>
                                <div className="w-[20%] border-r border-black p-1">
                                    <label className="block text-[8px] font-bold">WEBSITE (IF ANY)</label>
                                </div>
                                <div className="w-[15%] p-1">
                                    <label className="block text-[8px] font-bold">TAX IDENTIFICATION NUMBER</label>
                                    <div className="h-4 border border-black mt-0.5">
                                        <DigitBoxes value={selectedBu?.tin || ''} count={12} />
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* --- TABLE HEADER --- */}
                        <div className="border-2 border-black border-b-1 mt-0.5">
                            <div className="flex h-8 bg-gray-100 font-bold text-center text-[9px]">
                                <div className="border-r border-black w-[12%] flex items-center justify-center">SS NUMBER</div>
                                <div className="border-r border-black w-[32%] flex flex-col">
                                    <div className="border-b border-black h-[40%] flex items-center justify-center">NAME OF EMPLOYEE</div>
                                    <div className="flex h-[60%]">
                                        <div className="flex-1 border-r border-black flex items-center justify-center">(LAST NAME)</div>
                                        <div className="flex-1 border-r border-black flex items-center justify-center">(FIRST NAME)</div>
                                        <div className="w-8 border-r border-black flex items-center justify-center">(MI)</div>
                                        <div className="w-8 flex items-center justify-center">(SUFFIX)</div>
                                    </div>
                                </div>
                                <div className="border-r border-black w-[8%] flex flex-col justify-center items-center leading-tight">DATE OF BIRTH<br/>(MMDDYYYY)</div>
                                <div className="border-r border-black w-[8%] flex flex-col justify-center items-center leading-tight">DATE OF<br/>EMPLOYMENT<br/>(MMDDYYYY)</div>
                                <div className="border-r border-black w-[8%] flex flex-col justify-center items-center leading-tight">DATE OF<br/>SEPARATION<br/>(MMDDYYYY)</div>
                                <div className="border-r border-black w-[10%] flex flex-col justify-center items-center leading-tight">MONTHLY<br/>COMPENSATION</div>
                                <div className="border-r border-black w-[12%] flex flex-col justify-center items-center leading-tight">POSITION/<br/>NATURE OF WORK</div>
                                <div className="w-[10%] flex items-center justify-center">FOR SSS USE</div>
                            </div>
                            
                            {/* --- TABLE ROWS (15) --- */}
                            {Array.from({ length: 15 }).map((_, i) => {
                                const emp = chunk[i];
                                const nameParts = emp ? emp.name.split(' ') : [];
                                const lastName = emp ? nameParts[nameParts.length - 1] : '';
                                const firstName = emp ? nameParts.slice(0, nameParts.length - 1).join(' ') : ''; // Simplified name split
                                const mi = ''; // Placeholder
                                const suffix = ''; // Placeholder
                                
                                return (
                                    <div key={i} className="flex h-6 text-[10px] uppercase border-t border-black">
                                        {/* SS Number */}
                                        <div className="w-[12%] border-r border-black p-0.5">
                                            <div className="h-full border border-black">
                                                <DigitBoxes value={emp?.sssNo || ''} count={10} />
                                            </div>
                                        </div>
                                        {/* Name */}
                                        <div className="w-[32%] flex border-r border-black">
                                             <div className="flex-1 border-r border-black flex items-center pl-1 overflow-hidden">{lastName}</div>
                                             <div className="flex-1 border-r border-black flex items-center pl-1 overflow-hidden">{firstName}</div>
                                             <div className="w-8 border-r border-black flex items-center justify-center">{mi}</div>
                                             <div className="w-8 flex items-center justify-center">{suffix}</div>
                                        </div>
                                        {/* Dates */}
                                        <div className="w-[8%] border-r border-black p-0.5">
                                            <div className="h-full border border-black"><DateBoxes date={emp?.birthDate} /></div>
                                        </div>
                                        <div className="w-[8%] border-r border-black p-0.5">
                                            <div className="h-full border border-black"><DateBoxes date={emp?.dateHired} /></div>
                                        </div>
                                        <div className="w-[8%] border-r border-black p-0.5">
                                            <div className="h-full border border-black"><DateBoxes date={emp?.endDate} /></div>
                                        </div>
                                        {/* Compensation */}
                                        <div className="w-[10%] border-r border-black flex items-center justify-end pr-1 font-mono">
                                            {emp?.monthlySalary ? emp.monthlySalary.toLocaleString('en-US', {minimumFractionDigits: 2}) : ''}
                                        </div>
                                        {/* Position */}
                                        <div className="w-[12%] border-r border-black flex items-center pl-1 overflow-hidden whitespace-nowrap">
                                            {emp?.position || ''}
                                        </div>
                                        {/* SSS Use */}
                                        <div className="w-[10%] bg-gray-200"></div>
                                    </div>
                                );
                            })}
                        </div>

                        {/* --- FOOTER --- */}
                        <div className="flex border-2 border-t-0 border-black h-24">
                             {/* Total Count & Cert */}
                             <div className="w-[60%] flex">
                                 <div className="w-[20%] border-r border-black p-1 flex flex-col justify-center items-center text-center">
                                    <div className="text-[9px] font-bold leading-tight mb-2">TOTAL NUMBER OF REPORTED EMPLOYEES</div>
                                    <div className="text-2xl font-bold">{chunk.length}</div>
                                 </div>
                                 <div className="w-[80%] border-r border-black flex flex-col">
                                     <div className="flex-grow p-1">
                                         <div className="flex border-b border-black h-full">
                                            <div className="w-[45%] p-1 border-r border-black">
                                                <label className="block text-[7px] font-bold mb-1">NAME OF OWNER/MANAGING PARTNER/PRESIDENT/CHAIRMAN/CORPORATE SECRETARY</label>
                                                <div className="mt-2 text-xs font-bold uppercase text-center">{selectedBu?.name ? 'JERSON CAMPOS' : ''}</div>
                                            </div>
                                            <div className="w-[55%] p-1 flex flex-col justify-between text-center">
                                                <div className="text-[10px]">I certify that the information provided in this form are true and correct.</div>
                                                <div className="mt-3 border-b border-black w-[80%] mx-auto"></div>
                                                <div className="text-[8px]">SIGNATURE</div>
                                            </div>
                                         </div>
                                     </div>
                                     <div className="h-8 flex">
                                        <div className="w-[60%] border-r border-black p-1">
                                            <div className="text-[9px] font-bold text-center pt-1">GENERAL MANAGER</div>
                                            <div className="text-[7px] text-center">POSITION TITLE</div>
                                        </div>
                                         <div className="w-[40%] p-1">
                                            <div className="text-[9px] font-bold text-center pt-1">{new Date().toLocaleDateString()}</div>
                                            <div className="text-[7px] text-center">DATE</div>
                                        </div>
                                     </div>
                                 </div>
                             </div>

                             {/* Part II (SSS) */}
                             <div className="w-[40%] flex flex-col">
                                  <div className="bg-black text-white text-center font-bold text-[10px] border-b border-black py-0.5">PART II - TO BE FILLED OUT BY SSS</div>
                                  <div className="flex flex-grow">
                                      <div className="w-[40%] border-r border-black p-1">
                                          <div className="text-[8px] font-bold mb-1">SCREENING & RECEIVING RESULTS</div>
                                           <div className="flex items-start space-x-1 mb-0.5"><div className="w-2.5 h-2.5 border border-black"></div><span className="text-[8px] leading-tight">Correct authorized signatory per SS Form L-501</span></div>
                                           <div className="flex items-start space-x-1 mb-0.5"><div className="w-2.5 h-2.5 border border-black"></div><span className="text-[8px] leading-tight">Unauthorized signatory</span></div>
                                           <div className="flex items-start space-x-1"><div className="w-2.5 h-2.5 border border-black"></div><span className="text-[8px] leading-tight">Others: ____________</span></div>
                                      </div>
                                      <div className="w-[60%] flex flex-col">
                                          <div className="bg-gray-200 text-center font-bold text-[9px] border-b border-black">SCREENED & RECEIVED BY</div>
                                          <div className="flex-grow border-b border-black flex items-end justify-center pb-1">
                                              <div className="text-center">
                                                  <div className="w-32 border-b border-black"></div>
                                                  <div className="text-[8px]">SIGNATURE OVER PRINTED NAME</div>
                                              </div>
                                          </div>
                                          <div className="h-8 flex">
                                               <div className="w-1/2 border-r border-black p-1">
                                                   <div className="text-[8px]">BRANCH</div>
                                               </div>
                                               <div className="w-1/2 p-1">
                                                   <div className="text-[8px]">DATE & TIME</div>
                                               </div>
                                          </div>
                                      </div>
                                  </div>
                             </div>
                        </div>
                        
                        <div className="flex border-2 border-t-0 border-black h-8 text-[8px]">
                            <div className="w-[60%] border-r border-black flex">
                                 <div className="w-[20%] p-1 font-bold flex items-center justify-center">PROCESSED BY</div>
                                 <div className="w-[40%] border-r border-black p-1 flex flex-col justify-end items-center">
                                     <div className="w-full border-b border-black"></div>
                                     <div>SIGNATURE OVER PRINTED NAME</div>
                                 </div>
                                 <div className="w-[40%] p-1 flex flex-col justify-end items-center">
                                     <div className="w-full border-b border-black"></div>
                                     <div>DATE</div>
                                 </div>
                            </div>
                             <div className="w-[40%] flex">
                                 <div className="w-[20%] p-1 font-bold flex items-center justify-center">REVIEWED BY</div>
                                 <div className="w-[40%] border-r border-black p-1 flex flex-col justify-end items-center">
                                     <div className="w-full border-b border-black"></div>
                                     <div>SIGNATURE OVER PRINTED NAME</div>
                                 </div>
                                 <div className="w-[40%] p-1 flex flex-col justify-end items-center">
                                     <div className="w-full border-b border-black"></div>
                                     <div>DATE</div>
                                 </div>
                            </div>
                        </div>

                         <div className="absolute right-6 bottom-14 text-[10px] font-bold">PAGE {pageIndex + 1} OF {totalPages}</div>

                    </div>
                ))}
            </div>
        );
    };

    const handleExportXML = () => {
        const xmlContent = `
<alphalist>
    <header>
        <employer_tin>${selectedBu?.tin || '000-000-000'}</employer_tin>
        <employer_name>${selectedBu?.name}</employer_name>
        <year>${new Date().getFullYear()}</year>
    </header>
    <employees>
        ${buEmployees.map(emp => `
        <employee>
            <tin>${emp.tin || ''}</tin>
            <last_name>${emp.name.split(' ').pop()}</last_name>
            <first_name>${emp.name.split(' ')[0]}</first_name>
            <gross_compensation>${(emp.monthlySalary || 0) * 12}</gross_compensation>
            <tax_withheld>0.00</tax_withheld>
        </employee>`).join('')}
    </employees>
</alphalist>
        `;
        const blob = new Blob([xmlContent], { type: 'text/xml' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.setAttribute('hidden', '');
        a.setAttribute('href', url);
        a.setAttribute('download', `alphalist_${selectedBu?.name.replace(/\s/g,'_')}.xml`);
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    };

    return (
        <div className="space-y-6">
            <div className="no-print">
                <Link to="/payroll/government-reports" className="flex items-center text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 mb-2">
                    <ArrowLeftIcon />
                    Back to Government Reports
                </Link>
                <div className="flex justify-between items-center">
                    <h1 className="text-3xl font-bold text-gray-900 dark:text-white">{report.name}</h1>
                    <div className="flex space-x-2">
                         {report.id === 'BIR-ALPHALIST' && (
                            <Button onClick={handleExportXML} disabled={!selectedBuId}>
                                <CodeIcon /> Export XML
                            </Button>
                         )}
                         <Button variant="secondary" onClick={handlePrint} disabled={!selectedBuId}>
                            <PrinterIcon /> Print / PDF
                        </Button>
                    </div>
                </div>
                <p className="text-gray-600 dark:text-gray-400 mt-1">{report.description}</p>
            </div>
            
            <Card className="no-print">
                <div className="p-4">
                    <label htmlFor="bu-select" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Select Business Unit to Populate Data
                    </label>
                    <select
                        id="bu-select"
                        value={selectedBuId}
                        onChange={(e) => setSelectedBuId(e.target.value)}
                        className="block w-full max-w-xs pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                    >
                        <option value="" disabled>-- Select Business Unit --</option>
                        {accessibleBus.map(bu => (
                            <option key={bu.id} value={bu.id}>{bu.name}</option>
                        ))}
                    </select>
                </div>
            </Card>
            
            {selectedBu ? (
                <div className="overflow-auto bg-gray-50 dark:bg-gray-900 p-4 border rounded-lg">
                    {report.id === 'SSS-R1A' ? renderSSSR1A() : 
                     report.id === '13TH-MONTH' ? render13thMonth() :
                     report.id === 'BIR-ALPHALIST' ? (
                         <Card className="p-8 text-center">
                             <p className="text-lg">Alphalist Data Preview for {selectedBu.name}</p>
                             <p className="text-sm text-gray-500 mt-2">Click "Export XML" to generate the file for BIR submission.</p>
                             {render13thMonth()} 
                         </Card>
                     ) :
                     <div className="p-12 text-center text-gray-500">
                        Report template for {report.name} is under development.
                     </div>
                    }
                </div>
            ) : (
                 <div className="text-center py-12 text-gray-500">
                    Please select a Business Unit to view the report.
                </div>
            )}
        </div>
    );
};

export default GovernmentReportDetail;
