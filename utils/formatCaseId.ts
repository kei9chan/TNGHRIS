/**
 * Formats a sequential case number into a human-readable display ID.
 * 
 * @example formatIRDisplayId(1)   => "TNGIR-00001"
 * @example formatNTEDisplayId(42) => "TNGNTE-00042"
 */
export const formatIRDisplayId = (caseNumber?: number | null): string | null => {
  if (caseNumber == null) return null;
  return `TNGIR-${String(caseNumber).padStart(5, '0')}`;
};

export const formatNTEDisplayId = (nteNumber?: number | null): string | null => {
  if (nteNumber == null) return null;
  return `TNGNTE-${String(nteNumber).padStart(5, '0')}`;
};
