import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
execFileSync('node_modules/.bin/esbuild', ['supabase/functions/holiday-calendar-sync/parser.ts','--bundle','--platform=node','--format=esm','--outfile=/tmp/holiday-calendar-parser-test.mjs']);
const {annual,oneOff}=await import('/tmp/holiday-calendar-parser-test.mjs');
const rows=(names,month,days)=>names.map((name,i)=>`<tr><td>${name}</td><td>-</td><td>${days[i]}</td><td><br /></td><td>${month}</td></tr>`).join('');
const annualHtml=`<p>[ PROCLAMATION NO. 1427, September 08, 2026 ]</p><p>DECLARING THE REGULAR HOLIDAYS AND SPECIAL (NON-WORKING) DAYS FOR THE YEAR 2027</p>
<p>A. Regular Holidays</p><dir><table>${rows(['New Year’s Day','Maundy Thursday','Good Friday','Araw ng Kagitingan','Labor Day','Independence Day','National Heroes Day','Bonifacio Day','Christmas Day','Rizal Day'],'December',[1,25,26,9,1,12,30,30,25,30])}</table></dir>
<p>B. Special (Non-Working) Days</p><dir><table>${rows(['Ninoy Aquino Day','All Saints Day','Immaculate Conception','Last Day of the Year'],'December',[21,1,8,31])}</table></dir>
<p>C. Special (Working) Day</p><dir><table>${rows(['EDSA Revolution Anniversary','Chinese New Year','Black Saturday','All Souls Day','Christmas Eve'],'December',[25,6,27,2,24])}</table></dir></dir><p class="jn"><b>Section 2.</b></p>`;
const link='https://lawphil.net/executive/proc/proc2026/proc_1427_2026.html';
const holidays=annual(annualHtml,2027,'1427',link);
assert.equal(holidays.length,19);
assert.equal(holidays.find(x=>x.name==='Chinese New Year').kind,'special_nonworking');
assert.equal(holidays.find(x=>x.name.includes('EDSA')).kind,'special_working');
assert.equal(annual(annualHtml,2027,'9999',link).length,0);
const ncrHtml=`<p>BY THE PRESIDENT OF THE PHILIPPINES</p><p>[ PROCLAMATION NO. 1447, September 17, 2026 ]</p><p>DECLARING 16 - 18 NOVEMBER 2026 AS SPECIAL (NON-WORKING) DAYS IN THE NATIONAL CAPITAL REGION</p><p>WHEREAS, the summit is held in NCR.</p>`;
assert.deepEqual(oneOff(ncrHtml,2026,'1447',link).map(x=>x.date),['2026-11-16','2026-11-17','2026-11-18']);
assert.deepEqual(oneOff(ncrHtml,2026,'1449',link),[]);
console.log('Holiday proclamation parser checks passed');
