const fields = ['run_id','scheduled_date','recipient_user_id','employee_name','recipient_email','profile_email','account_status','linked','email_problem','pending_count','status','error_summary','suggested_fix','attempted_at','sent_at','resend_message_id'];
export function approvalEmailCsv(rows: Record<string, unknown>[]) {
  const cell = (value: unknown) => {
    let text = String(value ?? '');
    if (/^[\s]*[=+@-]/.test(text) || /^[\t\r\n]/.test(text)) text = "'" + text;
    return '"' + text.replace(/"/g, '""') + '"';
  };
  return '\uFEFF' + [fields, ...rows.map(row => fields.map(f => row[f]))].map(row => row.map(cell).join(',')).join('\r\n');
}
