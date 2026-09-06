import React from 'react';
import {AttendanceRecord} from '../../types';
import Modal from '../ui/Modal';
import AttendanceCorrection from '../attendance/AttendanceCorrection';
interface Props{isOpen:boolean;onClose:()=>void;record:AttendanceRecord|null;onUpdate:()=>void;}
export default function DailyRecordModal({isOpen,onClose,record,onUpdate}:Props){
 if(!record)return null;
 const d=new Date(record.date);const date=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Manila',year:'numeric',month:'2-digit',day:'2-digit'}).format(d);
 return <Modal isOpen={isOpen} onClose={onClose} title={`Review attendance: ${record.employeeName}`}><AttendanceCorrection key={`${record.employeeId}:${date}`} employee={record.employeeId} date={date} onSaved={onUpdate}/></Modal>;
}
