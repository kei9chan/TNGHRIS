import { CaseRow, columns, confidentiality, cellValue, csvCell, reportSummary, safeLink } from './model';
export async function createReport(rows:CaseRow[], keys:string[], format:string, layout:string, metadata:{auditId:string;generatedAt:string;filters:unknown},origin:string):Promise<Blob>{
 const chosen=columns.filter(([key])=>keys.includes(key));
 const headers=layout==='summary'?['Business Unit','Type of Offense','Total','Open','Closed','Overdue','Average resolution (days)','Resolution sample size']:chosen.map(c=>c[1]);
 const values=layout==='summary'?reportSummary(rows):rows.map(r=>chosen.map(([key])=>cellValue(r,key,origin)));
 const notes=[confidentiality,`Generated: ${metadata.generatedAt} | Audit: ${metadata.auditId} | Records: ${rows.length} | Dates: Asia/Manila`, `Filters: ${JSON.stringify(metadata.filters)}`];
 if(format==='csv')return new Blob(['\ufeff'+[...notes.map(n=>[n]),headers,...values].map(r=>r.map(csvCell).join(',')).join('\r\n')],{type:'text/csv;charset=utf-8'});
 if(format==='xlsx'){
  const {default:ExcelJS}=await import('exceljs');const book=new ExcelJS.Workbook();book.creator='TNG HRIS';
  const sheet=book.addWorksheet(layout==='summary'?'Case Summary':'Case Register');
  notes.forEach(n=>sheet.addRow([n]));sheet.addRow(headers);const header=sheet.getRow(4);header.font={bold:true,color:{argb:'FFFFFFFF'}};header.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF334155'}};
  values.forEach(valuesRow=>{const row=sheet.addRow(valuesRow);if(layout!=='summary')chosen.forEach(([key],i)=>{if(key.endsWith('Document')){const link=safeLink(valuesRow[i],origin);if(link){row.getCell(i+1).value={text:link,hyperlink:link};row.getCell(i+1).font={color:{argb:'FF2563EB'},underline:true};}}});});
  sheet.columns.forEach(c=>{c.width=26;});sheet.views=[{state:'frozen',ySplit:4}];sheet.autoFilter={from:{row:4,column:1},to:{row:4,column:headers.length}};
  sheet.eachRow(r=>{r.alignment={vertical:'top',wrapText:true};});
  return new Blob([await book.xlsx.writeBuffer() as ArrayBuffer],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
 }
 const {jsPDF}=await import('jspdf');const doc=new jsPDF({orientation:'landscape',unit:'mm',format:'a3'});const width=doc.internal.pageSize.getWidth(),height=doc.internal.pageSize.getHeight();
 // Horizontal bands keep every selected field readable, without shrinking 25 columns onto one page.
 const bandSize=layout==='summary'?8:5;let first=true;
 for(let offset=0;offset<headers.length;offset+=bandSize){
  const band=['Row',...headers.slice(offset,offset+bandSize)];const colWidth=(width-24)/band.length;let y=0;
  const page=()=>{if(!first)doc.addPage();first=false;doc.setFontSize(14);doc.text(layout==='summary'?'Case Monitoring — Summary':'Case Monitoring — Detailed Register',12,14);doc.setFontSize(8);doc.text(doc.splitTextToSize(notes[1],width-24),12,21);doc.text(`Columns ${offset+1}–${Math.min(offset+bandSize,headers.length)} of ${headers.length}; filters listed on final page`,12,27);y=34;band.forEach((h,i)=>doc.text(doc.splitTextToSize(h,colWidth-4),12+i*colWidth,y));y+=13;doc.setFontSize(7);doc.text(doc.splitTextToSize(confidentiality,width-24),12,height-10);};
  page();
  for(let index=0;index<values.length;index++){
   const cells=[index+1,...values[index].slice(offset,offset+bandSize)].map(v=>doc.splitTextToSize(String(v??''),colWidth-4));let line=0;const lineCount=Math.max(1,...cells.map(c=>c.length));
   while(line<lineCount){if(y>height-24)page();const take=Math.max(1,Math.min(lineCount-line,Math.floor((height-22-y)/4)));doc.setFontSize(8);cells.forEach((c,i)=>doc.text(c.slice(line,line+take),12+i*colWidth,y));y+=take*4+3;line+=take;if(line<lineCount)page();}
  }
 }
 doc.addPage();doc.setFontSize(10);let y=16;for(const note of notes){const lines=doc.splitTextToSize(note,width-24);for(const line of lines){if(y>height-16){doc.addPage();y=16;}doc.text(line,12,y);y+=5;}y+=5;}
 return doc.output('blob');
}
