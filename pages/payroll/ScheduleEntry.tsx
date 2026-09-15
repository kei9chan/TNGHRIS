import React from 'react';
import {useAuth} from '../../hooks/useAuth';
import {Role} from '../../types';
import MySchedule from './MySchedule';
const ScheduleBuilder=React.lazy(()=>import('./Timekeeping'));
/** Existing employee bookmarks open the personal view without requesting management data. */
export default function ScheduleEntry(){
 const {user}=useAuth();
 const roles=user?.roles?.length?user.roles:user?[user.role]:[];
 return roles.length>0&&roles.every(role=>role===Role.Employee)?<MySchedule/>:<ScheduleBuilder/>;
}
