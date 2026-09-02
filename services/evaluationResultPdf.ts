import { EvaluationCategoryScore, getEvaluationPerformanceLabel } from '../components/evaluation/EvaluationResultSummary';

export interface EvaluationResultPdfData {
  evaluationName: string;
  employeeName: string;
  score: number;
  usedWeight: number;
  completedComponents: number;
  totalComponents: number;
  status: string;
  categories: EvaluationCategoryScore[];
}

export const downloadEvaluationResultPdf = async (data: EvaluationResultPdfData) => {
  const { jsPDF } = await import('jspdf');
  const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait', compress: true });
  const margin = 18;
  let y = 20;
  const hasScore = data.usedWeight > 0;

  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(18);
  pdf.text('Evaluation Result Summary', margin, y);
  y += 10;
  pdf.setFontSize(12);
  pdf.text(data.evaluationName, margin, y);
  y += 8;
  pdf.setFont('helvetica', 'normal');
  pdf.text(`Employee: ${data.employeeName}`, margin, y);
  y += 7;
  pdf.text(`Overall score: ${hasScore ? data.score.toFixed(2) : 'Pending'} / 5.0`, margin, y);
  y += 7;
  pdf.text(`Performance: ${getEvaluationPerformanceLabel(data.score, hasScore)}`, margin, y);
  y += 7;
  pdf.text(`Completion: ${data.completedComponents} of ${data.totalComponents} evaluator components`, margin, y);
  y += 7;
  pdf.text(`Status: ${data.status}`, margin, y);
  y += 7;
  pdf.text(`Data integrity: ${data.usedWeight}% weighted data available`, margin, y);
  y += 12;

  pdf.setFont('helvetica', 'bold');
  pdf.text('Category scores', margin, y);
  y += 8;
  pdf.setFont('helvetica', 'normal');
  data.categories.forEach(category => {
    if (y > 275) {
      pdf.addPage();
      y = 20;
    }
    pdf.text(`${category.name}: ${category.usedWeight > 0 ? category.score.toFixed(2) : 'Pending'} / ${category.maxScore.toFixed(1)}`, margin, y);
    y += 6;
    const description = category.description || 'Weighted rating category';
    const lines = pdf.splitTextToSize(description, 170);
    pdf.setTextColor(90);
    pdf.text(lines, margin, y);
    pdf.setTextColor(0);
    y += (lines.length * 5) + 4;
  });

  if (y > 255) {
    pdf.addPage();
    y = 20;
  }
  pdf.setFontSize(9);
  pdf.setTextColor(90);
  const integrity = 'Weighted scoring averages responses within each evaluator component, applies configured weights, and normalizes only across components with submitted data. Scores below 100% weighted data are preliminary.';
  pdf.text(pdf.splitTextToSize(integrity, 170), margin, y);

  const safeName = `${data.employeeName}-${data.evaluationName}`.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase();
  pdf.save(`${safeName || 'evaluation-result'}.pdf`);
};
