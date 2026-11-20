export function buildEmail(p: any) {
 const url = `https://tnghris-omega.vercel.app/feedback/nte/${p.nteId}`;
 const reminder=p.kind==='reminder';
 const deadline=reminder ? new Intl.DateTimeFormat('en-PH',{timeZone:'Asia/Manila',dateStyle:'full',timeStyle:'short'}).format(new Date(p.deadline)) : '';
 const subject=reminder ? '[TNG HRIS] Reminder: your NTE response is due soon' : '[TNG HRIS] Notice to Explain issued';
 const text=`Hello ${p.name || 'there'},\n\n${reminder ? 'Your written explanation has not yet been recorded. Please submit it before the deadline below.' : 'Your Notice to Explain has completed approval and has been issued. Please sign in to HRIS to read and acknowledge receipt of the notice.'}\n\nNTE: ${p.number || p.nteId}\n${reminder ? `Response deadline: ${deadline} Philippine time\n` : 'Your response deadline is determined by the documented receipt in HRIS. Email delivery alone does not acknowledge receipt.\n'}\nOpen NTE: ${url}\n\nPlease submit your explanation in HRIS so it is recorded against the NTE. If you have already responded outside HRIS, contact HR to have it recorded.`;
 return {subject,text};
}
