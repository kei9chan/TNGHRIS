export const parsePanParticulars = (raw: any) => {
  if (!raw) return { from: {}, to: {} };
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? parsed : { from: {}, to: {} };
    } catch {
      return { from: {}, to: {} };
    }
  }
  return raw;
};

export const parseSalaryPayload = (raw: any) => {
  if (!raw) return undefined;
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? parsed : undefined;
    } catch {
      return undefined;
    }
  }
  return raw;
};

export const mergePanParticulars = (rawParticulars: any, rawSalaryFrom: any) => {
  const base = parsePanParticulars(rawParticulars);
  const salaryFrom = parseSalaryPayload(rawSalaryFrom) ?? base?.from?.salary;
  return {
    ...base,
    from: {
      ...(base.from || {}),
      salary: salaryFrom,
    },
  };
};
