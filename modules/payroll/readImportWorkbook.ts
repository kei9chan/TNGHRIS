/** ExcelJS 4 does not recognize prefixed SpreadsheetML element names.
 * Normalize that namespace in-memory without changing any cell contents. */
export async function readImportWorkbook(bytes:ArrayBuffer){
 const [{default:JSZip},excel]=await Promise.all([import('jszip'),import('exceljs')]);
 const zip=await JSZip.loadAsync(bytes);let total=0;
 for(const file of Object.values(zip.files)){
  if(file.dir||!file.name.endsWith('.xml'))continue;
  let xml=await file.async('string');total+=xml.length;
  if(total>30*1024*1024)throw new Error('Workbook is too large when expanded. Export only the required payroll rows.');
  const binding=xml.match(/xmlns:([A-Za-z_][\w.-]*)="http:\/\/schemas.openxmlformats.org\/spreadsheetml\/2006\/main"/);
  if(binding){const prefix=binding[1].replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
   xml=xml.replace(binding[0],'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"').replace(new RegExp(`(<\\/?)${prefix}:`,'g'),'$1');zip.file(file.name,xml);
  }
 }
 const Workbook=excel.Workbook||excel.default.Workbook;
 const workbook=new Workbook();await workbook.xlsx.load(await zip.generateAsync({type:'arraybuffer'}));return workbook;
}
