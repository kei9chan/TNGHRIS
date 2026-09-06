import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import {buildPaymentWorkbook} from '../modules/payroll/paymentWorkbook.ts';

const book=await buildPaymentWorkbook({
 kind:'register',label:'SHADOW — INTERNAL REVIEW WORKPAPER',exportId:'local-fixture',
 reportingNote:'Annual/YTD snapshots are not additive.',gross:'123456789012345678.90',
 employees:[{employeeId:'local-only',employeeName:'=SUM(1,2)',gross:'123456789012345678.90',deductions:'10.00',net:'123456789012345668.90',tax:'10.00',
 lines:[{label:'=HYPERLINK("invalid")',amount:'-1.01'}],contributions:[{label:'sssEE',amount:'10.00',monthly:'20.00',prior:'10.00'}],ytd:{taxable:'1000.00',withheld:'10.00'}}],
 payments:[{employeeName:'local-only',due:'1000',confirmed:'400',pending:'300',unpaid:'600',available:'300'}],
 reviewInputs:{employees:[{employeeId:'local-only',openingTaxable:'990.00',taxLines:[{taxable:'10.00',kind:'regular'}]}]},
});
const loaded=new ExcelJS.Workbook();await loaded.xlsx.load(await book.xlsx.writeBuffer());
assert.equal(loaded.getWorksheet('Register').getCell('B3').value,'=SUM(1,2)');
assert.equal(loaded.getWorksheet('Register').getCell('C3').value,'123456789012345678.90');
assert.equal(loaded.getWorksheet('Earnings and adjustments').getCell('D3').value,'-1.01');
assert.equal(loaded.getWorksheet('Payment reconciliation').getCell('G3').value,'300');
for(const sheet of loaded.worksheets){assert.equal(sheet.getCell('A1').value,'SHADOW — INTERNAL REVIEW WORKPAPER');sheet.eachRow(row=>row.eachCell(cell=>assert.notEqual(cell.type,ExcelJS.ValueType.Formula)));}
assert.ok(loaded.getWorksheet('BIR 1604-C 2316 source'));
assert.ok(loaded.getWorksheet('SSS PH HDMF source'));
console.log('PASS: workbook preserves exact amounts, labels, payment columns, source sheets and literal formula-like text.');
