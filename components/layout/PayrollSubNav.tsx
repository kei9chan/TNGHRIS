import React from 'react';
import {Link,useLocation,useNavigate} from 'react-router-dom';
import {usePermissions} from '../../hooks/usePermissions';
import {useAuth} from '../../hooks/useAuth';
import {NAV_LINKS} from '../../constants';
import {payrollGroups,payrollGroupFor} from '../../modules/payroll/workspace';
export default function PayrollSubNav(){
 const {can}=usePermissions();const {user}=useAuth();const location=useLocation();const navigate=useNavigate();
 const links=(NAV_LINKS.find(l=>l.name==='Payroll')?.children||[]).filter(l=>(!l.visibilityRoles?.length||l.visibilityRoles.some(r=>user?.role===r||user?.roles?.includes(r)))&&l.requiredPermission&&can(l.requiredPermission.resource,l.requiredPermission.permission));
 if(!links.length)return null;
 const current=links.find(l=>location.pathname===l.path||location.pathname.startsWith(l.path+'/'));
 const active=location.pathname==='/payroll/home'?'Payroll Home':current?payrollGroupFor(current.name):'Payroll Home';
 const groups=payrollGroups.map(g=>({...g,links:links.filter(l=>payrollGroupFor(l.name)===g.name).sort((a,b)=>g.names.length?g.names.indexOf(a.name)-g.names.indexOf(b.name):0)})).filter(g=>g.name==='Payroll Home'||g.name==='Schedule Builder'||g.links.length);
 const detail=groups.find(g=>g.name===active);
 return <div className="border-b bg-white px-4 py-3 dark:border-slate-700 dark:bg-slate-900 sm:px-6"><nav aria-label="Payroll sections" className="flex flex-wrap gap-2">{groups.map(g=><Link key={g.name} to={g.name==='Payroll Home'||g.name==='Schedule Builder'?g.path:g.links.find(l=>l.path===g.path)?.path||g.links[0].path} className={`min-h-11 rounded-lg px-4 py-3 text-sm font-semibold ${active===g.name?'bg-violet-600 text-white':'text-slate-600 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800'}`} aria-current={active===g.name?'page':undefined}>{g.name}</Link>)}</nav>
 {active!=='Payroll Home'&&active!=='Schedule Builder'&&detail&&<div className="mt-3 flex flex-wrap items-center gap-3 border-t pt-3 dark:border-slate-700"><label className="text-sm font-medium" htmlFor="payroll-screen">{active}</label><select id="payroll-screen" className="min-h-11 max-w-full rounded-lg border bg-transparent px-3 dark:border-slate-600" value={current?.path||''} onChange={e=>navigate(e.target.value)}>{detail.links.map(l=><option key={l.path} value={l.path}>{l.path==='/payroll/attendance-readiness'?'Timekeeping Review':l.name}</option>)}</select><Link to="/payroll/home" className="text-sm text-violet-600 dark:text-violet-300">Change business unit / cutoff →</Link></div>}
 </div>;
}
