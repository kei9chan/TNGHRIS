import React, {useEffect,useState} from 'react';
import {supabase} from '../../services/supabaseClient';
export default function DirectReportScheduleAccess({userId,children}:{userId:string;children:React.ReactElement}) {
 const [state,setState]=useState('loading');
 useEffect(()=>{let active=true;void supabase.rpc('get_schedule_roster_people').then(({data,error})=>{
  if(active)setState(!error&&Array.isArray(data)&&data.some(row=>row.reports_to===userId&&String(row.status).toLowerCase()==='active')?'allowed':'denied');
 });return()=>{active=false;};},[userId]);
 if(state==='allowed')return children;
 return <p role="status" className="p-6">{state==='loading'?'Checking schedule access…':'Schedule access could not be verified. Refresh to retry or contact HR.'}</p>;
}
