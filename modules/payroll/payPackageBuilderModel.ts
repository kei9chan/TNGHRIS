import type {PayComponent,Treatment} from './payPackages';

const number=(value:unknown)=>{const n=Number(value||0);return Number.isFinite(n)?n:0;};
const money=(value:number)=>Math.round((value+Number.EPSILON)*100)/100;
const isApprovedReimbursement=(component:PayComponent)=>component.category!=='reimbursable_allowance'&&component.legacyField!=='reimbursable'||component.receiptStatus==='approved_and_payable';
const componentValue=(component:PayComponent)=>isApprovedReimbursement(component)&&component.status!=='rejected'&&component.status!=='not_payable'?number(component.amount):0;

export type PackagePreviewInput={baseAmount:string|number;components:PayComponent[];treatment:Treatment;employeeTax?:string|number|null;employerTax?:string|number|null;thirteenthMonthAccrual?:string|number|null;otherEmployerCosts?:string|number|null};
export type PackagePreview={employee:{basic:number;taxableAllowances:number;deMinimis:number;reimbursements:number;serviceCharge:number;employeeTax:number;employeeBenefits:number;deductions:number;estimatedNet:number};company:{grossEmployeePay:number;employerTax:number;employerContributions:number;employerBenefits:number;companyPaidEmployeeShare:number;thirteenthMonthAccrual:number;serviceCharge:number;otherEmployerCosts:number;totalActualCost:number};employerPays:number;pending:string[];excludedReimbursements:number};

export function calculatePackagePreview(input:PackagePreviewInput):PackagePreview{
 const base=number(input.baseAmount);const pending:string[]=[];
 let taxableAllowances=0,deMinimis=0,reimbursements=0,serviceCharge=0,employeeBenefits=0,deductions=0,employerContributions=0,employerBenefits=0,companyPaidEmployeeShare=0,excludedReimbursements=0;
 for(const component of input.components){
  const raw=number(component.amount),value=componentValue(component),category=component.category||(component.legacyField==='deminimis'?'de_minimis':component.legacyField==='reimbursable'?'reimbursable_allowance':'fixed_allowance');
  if(category==='reimbursable_allowance'&&!isApprovedReimbursement(component)){excludedReimbursements+=raw;pending.push(`${component.name||'Reimbursement'}: receipt approval`);continue;}
  if(component.policyLimit&&raw>number(component.policyLimit))pending.push(`${component.name||'De minimis'}: exceeds policy limit`);
  switch(category){
   case 'de_minimis':deMinimis+=value;break;
   case 'reimbursable_allowance':reimbursements+=value;break;
   case 'service_charge':serviceCharge+=value;break;
   case 'employee_deduction':deductions+=value;break;
   case 'employee_paid_benefit':employeeBenefits+=number(component.employeeShare||value);employerBenefits+=number(component.employerShare);companyPaidEmployeeShare+=number(component.companyPaidEmployeeShare);break;
   case 'employer_paid_benefit':employerBenefits+=number(component.employerShare||value);companyPaidEmployeeShare+=number(component.companyPaidEmployeeShare);break;
   case 'employer_contribution':employerContributions+=number(component.employerShare||value);break;
   default:taxableAllowances+=value;
  }
 }
 const responsibility=input.treatment.taxResponsibility||((input.treatment.payBasis||'gross')==='gross'?'employee':'employer');
 const employeeTax=input.employeeTax==null?0:number(input.employeeTax),employerTax=input.employerTax==null?0:number(input.employerTax);
 if(responsibility!=='employer'&&input.employeeTax==null)pending.push('Employee-paid income tax');
 if(responsibility!=='employee'&&input.employerTax==null)pending.push('Employer-paid income tax');
 const grossEmployeePay=base+taxableAllowances+deMinimis+reimbursements;
 const thirteenth=input.thirteenthMonthAccrual==null?base/12:number(input.thirteenthMonthAccrual),otherEmployerCosts=number(input.otherEmployerCosts);
 const employerPays=employerTax+employerContributions+employerBenefits+companyPaidEmployeeShare+thirteenth+otherEmployerCosts;
 return {employee:{basic:money(base),taxableAllowances:money(taxableAllowances),deMinimis:money(deMinimis),reimbursements:money(reimbursements),serviceCharge:money(serviceCharge),employeeTax:money(employeeTax),employeeBenefits:money(employeeBenefits),deductions:money(deductions),estimatedNet:money(grossEmployeePay+serviceCharge-employeeTax-employeeBenefits-deductions)},company:{grossEmployeePay:money(grossEmployeePay),employerTax:money(employerTax),employerContributions:money(employerContributions),employerBenefits:money(employerBenefits),companyPaidEmployeeShare:money(companyPaidEmployeeShare),thirteenthMonthAccrual:money(thirteenth),serviceCharge:money(serviceCharge),otherEmployerCosts:money(otherEmployerCosts),totalActualCost:money(grossEmployeePay+serviceCharge+employerPays)},employerPays:money(employerPays),pending:[...new Set(pending)],excludedReimbursements:money(excludedReimbursements)};
}

export const payBasisOptions=[
 {value:'gross',label:'Gross pay',description:'Employee shoulders ordinary tax and benefit deductions.'},
 {value:'net_tax',label:'Net of tax',description:'Employer covers the approved income-tax amount.'},
 {value:'gross_selected',label:'Gross — selected components covered',description:'Choose exactly which components receive company coverage.'},
 {value:'net_all',label:'Net of tax and benefits',description:'Employer covers approved tax and employee benefit shares.'}
] as const;

export function arrangementSummary(treatment:Treatment){
 const tax=treatment.taxResponsibility==='employer'?'Employer covers tax':treatment.taxResponsibility==='split'?'Employee and employer split tax':'Employee pays tax';
 const coverage=treatment.taxCoverage==='basic_only'?'on basic pay only':treatment.taxCoverage==='selected_components'?'on the selected components':'on the entire approved package';
 const benefits=treatment.benefitResponsibility==='employer'?'Employer covers approved benefits':treatment.benefitResponsibility==='split'?'Benefit costs are split':'Other benefits remain employee-paid';
 return `${tax} ${coverage}. ${benefits}.`;
}
