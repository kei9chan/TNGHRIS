import React from 'react';
import {Link} from 'react-router-dom';

export default function SetupChecklistLink(){
 return <p className="text-sm"><Link className="text-indigo-600 underline dark:text-indigo-300" to="/payroll/attendance-readiness#team-checklist">View team setup checklist in Attendance Readiness</Link></p>;
}
