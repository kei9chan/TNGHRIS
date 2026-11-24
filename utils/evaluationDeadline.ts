/** Evaluation deadlines close at the end of the selected Philippine calendar day. */
export const evaluationDeadlineDay = (value: Date | string): string => {
  if (typeof value === 'string') return value.slice(0, 10);
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(value);
};

export const isEvaluationDeadlinePassed = (value?: Date | string, now = new Date()): boolean =>
  !!value && evaluationDeadlineDay(now) > evaluationDeadlineDay(value);

export const formatEvaluationDeadline = (value: Date | string): string =>
  new Date(`${evaluationDeadlineDay(value)}T00:00:00+08:00`).toLocaleDateString('en-PH', {
    timeZone: 'Asia/Manila', month: 'short', day: 'numeric', year: 'numeric',
  });
