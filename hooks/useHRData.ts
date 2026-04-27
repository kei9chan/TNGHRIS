import { useState, useEffect } from 'react';
import { supabase } from '../services/supabaseClient';
import { User } from '../types';

export function useUsers() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  async function fetchUsers() {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('hris_users')
        .select('*')
        .order('name');
      
      if (error) throw error;
      
      // Map the DB structure to the expected User interface if needed
      const mappedUsers = (data || []).map((u: any) => ({
        id: u.id,
        name: u.name,
        email: u.email,
        role: u.role,
        department: u.department || '',
        businessUnit: u.business_unit || '',
        businessUnitId: u.business_unit_id,
        title: u.title || '',
        status: u.status || 'Active',
        avatarUrl: u.avatar_url || '',
        hireDate: u.hire_date || '',
        address: u.address || '',
        managerId: u.manager_id || null,
        civilStatus: u.civil_status || '',
        taxStatus: u.tax_status || '',
        salary: {
          basic: u.salary_basic !== null && u.salary_basic !== undefined ? Number(u.salary_basic) : 0,
          deminimis: u.salary_deminimis !== null && u.salary_deminimis !== undefined ? Number(u.salary_deminimis) : 0,
          reimbursable: u.salary_reimbursable !== null && u.salary_reimbursable !== undefined ? Number(u.salary_reimbursable) : 0,
        },
        sssNo: u.sss_no || '',
        pagibigNo: u.pagibig_no || '',
        philhealthNo: u.philhealth_no || '',
        tin: u.tin || '',
        emergencyContact: {
          name: u.emergency_contact_name || '',
          relationship: u.emergency_contact_relationship || '',
          phone: u.emergency_contact_phone || '',
        },
        bankingDetails: {
          bankName: u.bank_name || '',
          accountNumber: u.bank_account_number || '',
          accountType: (u.bank_account_type as any) || 'Savings',
        },
      }));

      setUsers(mappedUsers);
      setError(null);
    } catch (err: any) {
      console.error('Error fetching users:', err);
      setError(err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchUsers();
  }, []);

  return { users, loading, error, refetchUsers: fetchUsers };
}

export function useBusinessUnits() {
  const [businessUnits, setBusinessUnits] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    async function fetchBU() {
      try {
        setLoading(true);
        const { data, error } = await supabase
          .from('business_units')
          .select('*')
          .order('name');
        
        if (error) throw error;
        
        setBusinessUnits((data || []).map((b: any) => ({
          id: b.id,
          name: b.name,
          code: b.code,
          color: b.color || '#4F46E5',
        })));
        setError(null);
      } catch (err: any) {
        console.error('Error fetching business units:', err);
        setError(err);
      } finally {
        setLoading(false);
      }
    }

    fetchBU();
  }, []);

  return { businessUnits, loading, error };
}

export function useDepartments() {
  const [departments, setDepartments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    async function fetchDept() {
      try {
        setLoading(true);
        const { data, error } = await supabase
          .from('departments')
          .select('*')
          .order('name');
        
        if (error) throw error;
        
        setDepartments(data || []);
        setError(null);
      } catch (err: any) {
        console.error('Error fetching departments:', err);
        setError(err);
      } finally {
        setLoading(false);
      }
    }

    fetchDept();
  }, []);

  return { departments, loading, error };
}

export function useSites() {
  const [sites, setSites] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    async function fetchSites() {
      try {
        setLoading(true);
        const { data, error } = await supabase
          .from('sites')
          .select('*')
          .order('name');
        
        if (error) throw error;
        
        setSites(data || []);
        setError(null);
      } catch (err: any) {
        console.error('Error fetching sites:', err);
        setError(err);
      } finally {
        setLoading(false);
      }
    }

    fetchSites();
  }, []);

  return { sites, loading, error };
}

export function useShiftTemplates() {
  const [shiftTemplates, setShiftTemplates] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    async function fetchShiftTemplates() {
      try {
        setLoading(true);
        const { data, error } = await supabase
          .from('shift_templates')
          .select('*')
          .order('name');
        
        if (error) throw error;
        
        // Map db columns to interface properties if needed
        const mapped = (data || []).map((t: any) => ({
          id: t.id,
          name: t.name,
          startTime: t.start_time,
          endTime: t.end_time,
          breakMinutes: t.break_minutes,
          gracePeriodMinutes: t.grace_period_minutes,
          businessUnitId: t.business_unit_id,
          color: t.color || '#4F46E5',
          isFlexible: t.is_flexible,
          minHoursPerDay: t.min_hours_per_day,
          minDaysPerWeek: t.min_days_per_week
        }));

        setShiftTemplates(mapped);
        setError(null);
      } catch (err: any) {
        console.error('Error fetching shift templates:', err);
        setError(err);
      } finally {
        setLoading(false);
      }
    }

    fetchShiftTemplates();
  }, []);

  return { shiftTemplates, loading, error };
}

export function useAttendanceRecords() {
  const [attendanceRecords, setAttendanceRecords] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    async function fetchAttendance() {
      try {
        setLoading(true);
        // Catch gracefully if table does not exist
        const { data, error } = await supabase
          .from('attendance_records')
          .select('*')
          .order('date', { ascending: false });
          
        if (error) {
           console.warn('attendance_records table may not exist yet', error);
           setAttendanceRecords([]);
           setError(error);
           return;
        }
        
        const mapped = (data || []).map((a: any) => ({
          id: a.id,
          employeeId: a.employee_id,
          date: a.date ? new Date(a.date) : new Date(),
          firstIn: a.first_in ? new Date(a.first_in) : null,
          lastOut: a.last_out ? new Date(a.last_out) : null,
          status: a.status,
          shiftName: a.shift_name,
          scheduledStart: a.scheduled_start ? new Date(a.scheduled_start) : null,
          scheduledEnd: a.scheduled_end ? new Date(a.scheduled_end) : null,
          totalWorkMinutes: a.total_work_minutes || 0,
          breakMinutes: a.break_minutes || 0,
          overtimeMinutes: a.overtime_minutes || 0,
          exceptions: a.exceptions || [],
          hasManualEntry: a.has_manual_entry || false
        }));
        setAttendanceRecords(mapped);
      } catch (err: any) {
        console.error('Error fetching attendance records:', err);
        setError(err);
      } finally {
        setLoading(false);
      }
    }
    fetchAttendance();
  }, []);

  return { attendanceRecords, loading, error };
}

export function useShiftAssignments() {
  const [shiftAssignments, setShiftAssignments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    async function fetchShifts() {
      try {
        setLoading(true);
        const { data, error } = await supabase
          .from('shift_assignments')
          .select('*');
          
        if (error) {
           console.warn('shift_assignments table may not exist yet', error);
           setShiftAssignments([]);
           setError(error);
           return;
        }
        
        const mapped = (data || []).map((s: any) => ({
          id: s.id,
          employeeId: s.employee_id,
          shiftTemplateId: s.shift_template_id,
          date: s.date ? new Date(s.date) : new Date(),
        }));
        setShiftAssignments(mapped);
      } catch (err: any) {
        console.error('Error fetching shift assignments:', err);
        setError(err);
      } finally {
        setLoading(false);
      }
    }
    fetchShifts();
  }, []);

  return { shiftAssignments, loading, error };
}
