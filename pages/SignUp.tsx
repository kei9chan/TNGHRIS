import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { User, Role } from '../types';
import { mockBusinessUnits, mockDepartments } from '../services/mockData';
import { useAuth } from '../hooks/useAuth';
import GoogleIcon from '../components/icons/GoogleIcon';
import { supabase } from '../services/supabaseClient';

// Floating Icon Component (Reused for consistency)
const FloatingIcon: React.FC<{ children: React.ReactNode; delay?: string; className?: string }> = ({
  children,
  delay = '0s',
  className = '',
}) => (
  <div
    className={`absolute bg-white/20 backdrop-blur-md p-3 rounded-2xl shadow-lg text-white ${className}`}
    style={{ animation: `float 6s ease-in-out infinite`, animationDelay: delay }}
  >
    {children}
  </div>
);

const SignUp: React.FC = () => {
  const navigate = useNavigate();
  const { loginWithGoogle } = useAuth();
  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState<Partial<User>>({
    role: Role.Employee,
    status: 'Inactive',
    isPhotoEnrolled: false,
    emergencyContact: { name: '', relationship: '', phone: '' },
    bankingDetails: { bankName: '', accountNumber: '', accountType: 'Savings' },
  });
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [hasCompletedStep1, setHasCompletedStep1] = useState(false);
  const [submitIntent, setSubmitIntent] = useState(false); // ensures submit only fires from the final button
  const roleOptions = Object.values(Role);

  const normalizeEmail = (raw?: string) => (raw || '').trim().toLowerCase();
  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  const validateStep1 = (): string | null => {
    const errors: Record<string, string> = {};
    const normalizedEmail = normalizeEmail(formData.email);
    if (
      !firstName.trim() ||
      !lastName.trim() ||
      !normalizedEmail ||
      !password ||
      !confirmPassword ||
      !formData.businessUnit ||
      !formData.department ||
      !formData.role
    ) {
      errors.general = 'Please fill in all required fields to proceed.';
    }
    if (!firstName.trim()) {
      errors.firstName = 'First name is required.';
    }
    if (!lastName.trim()) {
      errors.lastName = 'Last name is required.';
    }
    if (!normalizedEmail) {
      errors.email = 'Email is required.';
    } else if (!emailPattern.test(normalizedEmail)) {
      errors.email = 'Enter a valid email address.';
    }
    if (!password) {
      errors.password = 'Password is required.';
    }
    if (!confirmPassword) {
      errors.confirmPassword = 'Please confirm your password.';
    }
    if (password !== confirmPassword) {
      errors.password = 'Passwords do not match.';
      errors.confirmPassword = 'Passwords do not match.';
    }
    if (password.length < 8) {
      errors.password = 'Password must be at least 8 characters long.';
    }
    if (!formData.businessUnit) {
      errors.businessUnit = 'Select a business unit.';
    } else if (!mockBusinessUnits.some(bu => bu.name === formData.businessUnit)) {
      errors.businessUnit = 'Choose a valid business unit.';
    }
    if (!formData.department) {
      errors.department = 'Select a department.';
    } else if (!mockDepartments.some(d => d.name === formData.department)) {
      errors.department = 'Choose a valid department.';
    }
    if (!formData.role) {
      errors.role = 'Role is required.';
    }

    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) {
      return errors.general || 'Please correct the highlighted fields.';
    }
    return null;
  };

  const validateStep2 = (): string | null => {
    const errors: Record<string, string> = {};

    const validateOptionalId = (value: string | undefined, key: string, label: string) => {
      if (!value) return;
      const clean = value.trim();
      if (clean && !/^[0-9- ]+$/.test(clean)) {
        errors[key] = `${label} must contain numbers only.`;
      }
    };

    validateOptionalId(formData.sssNo, 'sssNo', 'SSS Number');
    validateOptionalId(formData.pagibigNo, 'pagibigNo', 'Pag-IBIG');
    validateOptionalId(formData.philhealthNo, 'philhealthNo', 'PhilHealth');
    validateOptionalId(formData.tin, 'tin', 'TIN');

    if (formData.emergencyContact?.phone) {
      const phoneClean = formData.emergencyContact.phone.trim();
      if (!/^[0-9+ ()-]+$/.test(phoneClean) || phoneClean.replace(/\D/g, '').length < 7) {
        errors.emergencyPhone = 'Enter a valid phone number.';
      }
    }

    if (formData.bankingDetails?.accountNumber) {
      const accountClean = formData.bankingDetails.accountNumber.trim();
      if (!/^[0-9- ]+$/.test(accountClean) || accountClean.replace(/\D/g, '').length < 6) {
        errors.accountNumber = 'Enter a valid account number.';
      }
    }

    setFieldErrors(prev => ({ ...prev, ...errors }));
    if (Object.keys(errors).length > 0) {
      return 'Please correct the highlighted fields.';
    }
    return null;
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: name === 'email' ? normalizeEmail(value) : value,
    }));
    setFieldErrors(prev => {
      const { [name]: _removed, general: _g, ...rest } = prev;
      return rest;
    });
  };

  const handleNestedChange = (
    section: 'emergencyContact' | 'bankingDetails',
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [section]: {
        ...(prev[section] as any),
        [name]: value,
      },
    }));
    setFieldErrors(prev => {
      const key = section === 'emergencyContact' && name === 'phone' ? 'emergencyPhone' : name;
      const { [key]: _removed, general: _g, ...rest } = prev;
      return rest;
    });
  };

  const nextStep = () => {
    setError('');
    if (step === 1) {
      const stepError = validateStep1();
      if (stepError) {
        setError(stepError);
        return;
      }
      setHasCompletedStep1(true);
    }
    setStep(s => s + 1);
  };

  const prevStep = () => {
    setError('');
    setStep(s => s - 1);
  };
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    // Guard: only allow submit on step 2 after step 1 was explicitly completed
    if (!submitIntent) {
      // Ignore any accidental form submits (e.g., Enter key bubbling)
      return;
    }
    if (step !== 2 || !hasCompletedStep1) {
      setError('Please complete basic info first, then add personal details.');
      setStep(1);
      return;
    }

    // Re-validate before hitting Supabase
    const step1Error = validateStep1();
    if (step1Error) {
      setError(step1Error);
      setStep(1);
      return;
    }
    const step2Error = validateStep2();
    if (step2Error) {
      setError(step2Error);
      return;
    }

    const email = normalizeEmail(formData.email);
    const fullName = `${firstName} ${lastName}`.trim();

    setIsSubmitting(true);

    try {
      // Resolve Business Unit / Department IDs from Supabase based on the selected names
      let businessUnitId: string | null = null;
      let departmentId: string | null = null;

      if (formData.businessUnit) {
        const { data: buRow } = await supabase
          .from('business_units')
          .select('id')
          .ilike('name', formData.businessUnit)
          .maybeSingle();
        businessUnitId = buRow?.id ?? null;
      }

      if (formData.department) {
        const deptQuery = supabase
          .from('departments')
          .select('id, business_unit_id')
          .ilike('name', formData.department)
          .limit(1);

        const { data: deptRow } = businessUnitId
          ? await deptQuery.eq('business_unit_id', businessUnitId).maybeSingle()
          : await deptQuery.maybeSingle();

        departmentId = deptRow?.id ?? null;
        if (!businessUnitId && deptRow?.business_unit_id) {
          businessUnitId = deptRow.business_unit_id;
        }
      }

      // 1) Create Supabase Auth user (auth.users)
      const baseUrl =
        (import.meta as any).env?.VITE_APP_BASE_URL || window.location.origin;
      const emailRedirectTo =
        typeof window !== 'undefined' ? `${baseUrl}/login` : undefined;
      const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { full_name: fullName },
          emailRedirectTo,
        },
      });

      if (signUpError || !signUpData.user) {
        console.error(signUpError);

        const code = (signUpError as any)?.code;
        if (code === 'user_already_exists') {
          setError('An account with this email already exists. Please log in instead.');
        } else {
          setError(signUpError?.message || 'Could not create account. Please try again.');
        }
        return; // stay on step 2
      }

      const authUserId = signUpData.user.id;

      // 2) Insert into hris_users, linked to auth.users
      const { error: insertError, status: insertStatus, statusText } = await supabase.from('hris_users').insert({
        auth_user_id: authUserId,

        email,
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        full_name: fullName,

        role: formData.role || Role.Employee,
        status: formData.status || 'Inactive',
        is_photo_enrolled: formData.isPhotoEnrolled ?? false,

        business_unit: formData.businessUnit || null,
        business_unit_id: businessUnitId,
        department: formData.department || null,
        department_id: departmentId,
        position: formData.position || null,
        date_hired: new Date().toISOString().slice(0, 10), // YYYY-MM-DD

        sss_no: formData.sssNo || null,
        pagibig_no: formData.pagibigNo || null,
        philhealth_no: formData.philhealthNo || null,
        tin: formData.tin || null,

        emergency_contact_name: formData.emergencyContact?.name || null,
        emergency_contact_relationship: formData.emergencyContact?.relationship || null,
        emergency_contact_phone: formData.emergencyContact?.phone || null,

        bank_name: formData.bankingDetails?.bankName || null,
        bank_account_number: formData.bankingDetails?.accountNumber || null,
        bank_account_type: formData.bankingDetails?.accountType || 'Savings',
      });

      if (insertError) {
        console.error(insertError);
        const code = (insertError as any)?.code;
        const status = (insertError as any)?.status ?? insertStatus ?? statusText;
        const message = `${(insertError as any)?.message || ''} ${(insertError as any)?.details || ''}`.toLowerCase();
        const isConflict =
          code === '23505' ||
          code === 23505 ||
          status === 409 ||
          status === '409' ||
          message.includes('duplicate') ||
          message.includes('already exists');

        if (isConflict) {
          setError('An account with this email already exists. Please log in instead.');
        } else {
          setError('Profile could not be saved. Please try again.');
        }
        return; // don't redirect; user stays on step 2
      }

      // Optional: ensure user is logged out so they return to login flow
      await supabase.auth.signOut().catch(() => {});

      // 3) Only after both writes succeed, redirect to login
      navigate('/login', {
        state: {
          message: 'Sign-up successful! Please check your email and wait for HR approval.',
        },
        replace: true,
      });
    } catch (err) {
      console.error(err);
      setError('Unexpected error. Please try again.');
    } finally {
      setIsSubmitting(false);
      setSubmitIntent(false);
    }
  };

  const handleGoogleSignUp = async () => {
    setError('');
    setIsGoogleLoading(true);
    try {
      const user = await loginWithGoogle();
      if (user) {
        navigate('/dashboard');
      } else {
        setError('Google Sign-Up failed. Please try again or use the manual form.');
      }
    } catch (err) {
      setError('An unexpected error occurred during Google Sign-Up.');
    } finally {
      setIsGoogleLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex overflow-hidden bg-gray-50 font-sans">
      {/* Custom Styles for Animations */}
      <style>{`
        @keyframes float {
          0% { transform: translateY(0px) rotate(0deg); }
          50% { transform: translateY(-20px) rotate(2deg); }
          100% { transform: translateY(0px) rotate(0deg); }
        }
        @keyframes gradient-x {
          0%, 100% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
        }
        .animate-gradient-x {
          background-size: 200% 200%;
          animation: gradient-x 15s ease infinite;
        }
        .glass-input {
          background: #F3F4F6;
          transition: all 0.3s ease;
          border: 1px solid transparent;
        }
        .glass-input:focus {
          background: #FFFFFF;
          box-shadow: 0 0 0 4px rgba(167, 139, 250, 0.2);
          border-color: #8B5CF6;
          outline: none;
        }
        .glass-input:hover {
          background: #F9FAFB;
          border-color: #E5E7EB;
        }
      `}</style>

      {/* LEFT SIDE: The "Join Us" Universe */}
      <div className="hidden lg:flex w-1/2 relative bg-gradient-to-tr from-indigo-600 via-purple-600 to-pink-500 animate-gradient-x items-center justify-center overflow-hidden">
        {/* Decorative Blobs */}
        <div className="absolute top-[-10%] left-[-10%] w-96 h-96 bg-blue-500 rounded-full mix-blend-multiply filter blur-3xl opacity-40 animate-blob"></div>
        <div className="absolute bottom-[-10%] right-[-10%] w-96 h-96 bg-pink-500 rounded-full mix-blend-multiply filter blur-3xl opacity-40 animate-blob animation-delay-2000"></div>

        <div className="relative z-10 text-center p-12 max-w-xl">
          <div className="relative w-64 h-64 mx-auto mb-12">
            {/* Hero Character */}
            <div className="absolute inset-0 flex items-center justify-center z-20">
              <div className="w-32 h-32 bg-white rounded-full shadow-2xl flex items-center justify-center text-6xl border-4 border-white/30 backdrop-blur-sm">
                🚀
              </div>
            </div>
            {/* Orbiting Icons */}
            <FloatingIcon delay="0s" className="top-0 left-4 -rotate-12">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2.25-4.125c0-.621.504-1.125 1.125-1.125h5.25c.621 0 1.125.504 1.125 1.125v6.75c0 .621-.504 1.125-1.125 1.125H9.75a1.125 1.125 0 0 1-1.125-1.125V9.75Z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 14v-2" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12h-3" />
              </svg>
            </FloatingIcon>
            <FloatingIcon delay="2s" className="top-10 right-0 rotate-12">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
            </FloatingIcon>
            <FloatingIcon delay="4s" className="bottom-0 right-10 rotate-6">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
              </svg>
            </FloatingIcon>
          </div>
          <h1 className="text-5xl font-extrabold text-white mb-6 tracking-tight drop-shadow-md">
            JOIN THE <br />
            TEAM
          </h1>
          <p className="text-lg text-white/90 font-medium leading-relaxed">
            Start your journey with TNG. Let's build something amazing together.
          </p>
        </div>
      </div>

      {/* RIGHT SIDE: The Form */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-4 sm:p-8 relative overflow-y-auto">
        {/* Mobile background hint */}
        <div className="lg:hidden absolute top-0 left-0 w-full h-64 bg-gradient-to-b from-indigo-600 to-transparent opacity-20 pointer-events-none"></div>

        <div className="max-w-xl w-full bg-white rounded-3xl shadow-2xl p-8 md:p-10 relative z-10 border border-gray-100 my-8">
          {/* Header */}
          <div className="text-center mb-8">
            <h2 className="text-3xl font-bold text-gray-900">Create Account</h2>
            <p className="text-gray-500 mt-2">
              Step {step} of 2: {step === 1 ? 'Basic Information' : 'Personal Details'}
            </p>
          </div>

          {/* Step Indicator */}
          <div className="flex justify-center items-center space-x-4 mb-8">
            <div className={`h-2 w-12 rounded-full transition-colors duration-300 ${step >= 1 ? 'bg-indigo-600' : 'bg-gray-200'}`}></div>
            <div className={`h-2 w-12 rounded-full transition-colors duration-300 ${step >= 2 ? 'bg-pink-500' : 'bg-gray-200'}`}></div>
          </div>

          {/* Error Message */}
          {(error || Object.keys(fieldErrors).length > 0) && (
            <div className="mb-6 bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-xl flex items-center animate-bounce-short">
              <svg className="w-5 h-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="font-medium">
                {error || fieldErrors.general || 'Please correct the highlighted fields.'}
              </span>
            </div>
          )}

          {/* Google Sign Up Button (Only on Step 1) */}
          {step === 1 && (
            <>
              <button
                type="button"
                onClick={handleGoogleSignUp}
                disabled={isGoogleLoading}
                className="w-full flex items-center justify-center px-4 py-3.5 border border-gray-200 rounded-xl shadow-sm bg-white text-sm font-bold text-gray-700 hover:bg-gray-50 hover:border-gray-300 transition-all disabled:opacity-50 mb-6"
              >
                {isGoogleLoading ? (
                  <svg className="animate-spin h-5 w-5 text-gray-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    ></path>
                  </svg>
                ) : (
                  <>
                    <GoogleIcon className="h-5 w-5 mr-2" />
                    Sign up with Google
                  </>
                )}
              </button>
              <div className="relative mb-6">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-gray-200"></div>
                </div>
                <div className="relative flex justify-center text-sm">
                  <span className="px-4 bg-white text-gray-400 font-medium uppercase tracking-wider">or</span>
                </div>
              </div>
            </>
          )}

          <form
            onSubmit={handleSubmit}
            onKeyDown={(e) => {
              // Prevent Enter from submitting while on step 1; instead advance to step 2
              if (step === 1 && e.key === 'Enter') {
                e.preventDefault();
                nextStep();
              }
            }}
            className="space-y-5"
          >
            {step === 1 && (
              <div className="space-y-5 animate-fade-in-up">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-1.5">First Name</label>
                    <input
                      className="glass-input w-full px-4 py-3 rounded-xl text-gray-900"
                      type="text"
                      value={firstName}
                      onChange={e => {
                        setFirstName(e.target.value);
                        setFieldErrors(prev => {
                          const { firstName: _removed, ...rest } = prev;
                          return rest;
                        });
                      }}
                      placeholder="Jane"
                      required
                      aria-invalid={!!fieldErrors.firstName}
                    />
                    {fieldErrors.firstName && <p className="mt-1 text-xs text-red-600">{fieldErrors.firstName}</p>}
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-1.5">Last Name</label>
                    <input
                      className="glass-input w-full px-4 py-3 rounded-xl text-gray-900"
                      type="text"
                      value={lastName}
                      onChange={e => {
                        setLastName(e.target.value);
                        setFieldErrors(prev => {
                          const { lastName: _removed, ...rest } = prev;
                          return rest;
                        });
                      }}
                      placeholder="Doe"
                      required
                      aria-invalid={!!fieldErrors.lastName}
                    />
                    {fieldErrors.lastName && <p className="mt-1 text-xs text-red-600">{fieldErrors.lastName}</p>}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-1.5">Email Address</label>
                  <input
                    className="glass-input w-full px-4 py-3 rounded-xl text-gray-900"
                    type="email"
                    name="email"
                    value={formData.email || ''}
                    onChange={handleChange}
                    placeholder="jane.doe@company.com"
                    required
                    aria-invalid={!!fieldErrors.email}
                  />
                  {fieldErrors.email && <p className="mt-1 text-xs text-red-600">{fieldErrors.email}</p>}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-1.5">Password</label>
                    <input
                      className="glass-input w-full px-4 py-3 rounded-xl text-gray-900"
                      type="password"
                      value={password}
                      onChange={e => {
                        setPassword(e.target.value);
                        setFieldErrors(prev => {
                          const { password: _removed, ...rest } = prev;
                          return rest;
                        });
                      }}
                      placeholder="••••••••"
                      required
                      aria-invalid={!!fieldErrors.password}
                    />
                    {fieldErrors.password && <p className="mt-1 text-xs text-red-600">{fieldErrors.password}</p>}
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-1.5">Confirm Password</label>
                    <input
                      className="glass-input w-full px-4 py-3 rounded-xl text-gray-900"
                      type="password"
                      value={confirmPassword}
                      onChange={e => {
                        setConfirmPassword(e.target.value);
                        setFieldErrors(prev => {
                          const { confirmPassword: _removed, ...rest } = prev;
                          return rest;
                        });
                      }}
                      placeholder="••••••••"
                      required
                      aria-invalid={!!fieldErrors.confirmPassword}
                    />
                    {fieldErrors.confirmPassword && <p className="mt-1 text-xs text-red-600">{fieldErrors.confirmPassword}</p>}
                  </div>
                </div>

                <div className="pt-2">
                  <h3 className="text-sm font-bold text-gray-900 border-b border-gray-100 pb-2 mb-4 uppercase tracking-wider">
                    Employment Details
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-1.5">Business Unit</label>
                      <select
                        name="businessUnit"
                        value={formData.businessUnit || ''}
                        onChange={handleChange}
                        required
                        className="glass-input w-full px-4 py-3 rounded-xl text-gray-900 appearance-none cursor-pointer"
                        aria-invalid={!!fieldErrors.businessUnit}
                      >
                        <option value="">Select...</option>
                        {mockBusinessUnits.map(bu => (
                          <option key={bu.id} value={bu.name}>
                            {bu.name}
                          </option>
                        ))}
                      </select>
                      {fieldErrors.businessUnit && <p className="mt-1 text-xs text-red-600">{fieldErrors.businessUnit}</p>}
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-1.5">Department</label>
                      <select
                        name="department"
                        value={formData.department || ''}
                        onChange={handleChange}
                        required
                        className="glass-input w-full px-4 py-3 rounded-xl text-gray-900 appearance-none cursor-pointer"
                        aria-invalid={!!fieldErrors.department}
                      >
                        <option value="">Select...</option>
                        {mockDepartments.map(d => (
                          <option key={d.id} value={d.name}>
                            {d.name}
                          </option>
                        ))}
                      </select>
                      {fieldErrors.department && <p className="mt-1 text-xs text-red-600">{fieldErrors.department}</p>}
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1.5">Role / Position / Job Title</label>
                    <select
                      name="role"
                      value={formData.role || Role.Employee}
                      onChange={handleChange}
                      required
                      className="glass-input w-full px-4 py-3 rounded-xl text-gray-900 appearance-none cursor-pointer"
                    >
                      {roleOptions.map(r => (
                        <option key={r} value={r}>
                          {r}
                        </option>
                      ))}
                    </select>
                    {fieldErrors.role && <p className="mt-1 text-xs text-red-600">{fieldErrors.role}</p>}
                  </div>
                </div>
              </div>
            )}

            {step === 2 && (
              <div className="space-y-6 animate-fade-in-up">
                <div>
                  <h3 className="text-sm font-bold text-gray-900 border-b border-gray-100 pb-2 mb-4 uppercase tracking-wider">
                    Government IDs (Optional)
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-gray-500 mb-1">SSS Number</label>
                      <input
                      className="glass-input w-full px-3 py-2.5 rounded-xl text-sm"
                      name="sssNo"
                      value={formData.sssNo || ''}
                      onChange={handleChange}
                      placeholder="00-0000000-0"
                      aria-invalid={!!fieldErrors.sssNo}
                    />
                    {fieldErrors.sssNo && <p className="mt-1 text-xs text-red-600">{fieldErrors.sssNo}</p>}
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-500 mb-1">Pag-IBIG</label>
                    <input
                      className="glass-input w-full px-3 py-2.5 rounded-xl text-sm"
                      name="pagibigNo"
                      value={formData.pagibigNo || ''}
                      onChange={handleChange}
                      placeholder="0000-0000-0000"
                      aria-invalid={!!fieldErrors.pagibigNo}
                    />
                    {fieldErrors.pagibigNo && <p className="mt-1 text-xs text-red-600">{fieldErrors.pagibigNo}</p>}
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-500 mb-1">PhilHealth</label>
                    <input
                      className="glass-input w-full px-3 py-2.5 rounded-xl text-sm"
                      name="philhealthNo"
                      value={formData.philhealthNo || ''}
                      onChange={handleChange}
                      placeholder="00-000000000-0"
                      aria-invalid={!!fieldErrors.philhealthNo}
                    />
                    {fieldErrors.philhealthNo && <p className="mt-1 text-xs text-red-600">{fieldErrors.philhealthNo}</p>}
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-500 mb-1">TIN</label>
                    <input
                      className="glass-input w-full px-3 py-2.5 rounded-xl text-sm"
                      name="tin"
                      value={formData.tin || ''}
                      onChange={handleChange}
                      placeholder="000-000-000-000"
                      aria-invalid={!!fieldErrors.tin}
                    />
                    {fieldErrors.tin && <p className="mt-1 text-xs text-red-600">{fieldErrors.tin}</p>}
                  </div>
                </div>
              </div>

              <div>
                <h3 className="text-sm font-bold text-gray-900 border-b border-gray-100 pb-2 mb-4 uppercase tracking-wider">
                    Emergency Contact
                  </h3>
                  <div className="space-y-3">
                    <input
                      className="glass-input w-full px-3 py-2.5 rounded-xl text-sm"
                      name="name"
                      value={formData.emergencyContact?.name || ''}
                      onChange={e => handleNestedChange('emergencyContact', e)}
                      placeholder="Contact Name"
                      aria-invalid={!!fieldErrors.emergencyContactName}
                    />
                    {fieldErrors.emergencyContactName && <p className="mt-1 text-xs text-red-600">{fieldErrors.emergencyContactName}</p>}
                    <div className="grid grid-cols-2 gap-4">
                      <input
                        className="glass-input w-full px-3 py-2.5 rounded-xl text-sm"
                        name="relationship"
                        value={formData.emergencyContact?.relationship || ''}
                        onChange={e => handleNestedChange('emergencyContact', e)}
                        placeholder="Relationship"
                        aria-invalid={!!fieldErrors.emergencyContactRelationship}
                      />
                      {fieldErrors.emergencyContactRelationship && <p className="mt-1 text-xs text-red-600">{fieldErrors.emergencyContactRelationship}</p>}
                      <input
                        className="glass-input w-full px-3 py-2.5 rounded-xl text-sm"
                        name="phone"
                        type="tel"
                        value={formData.emergencyContact?.phone || ''}
                        onChange={e => handleNestedChange('emergencyContact', e)}
                        placeholder="Phone Number"
                        aria-invalid={!!fieldErrors.emergencyPhone}
                      />
                      {fieldErrors.emergencyPhone && <p className="mt-1 text-xs text-red-600">{fieldErrors.emergencyPhone}</p>}
                    </div>
                  </div>
                </div>

                <div>
                  <h3 className="text-sm font-bold text-gray-900 border-b border-gray-100 pb-2 mb-4 uppercase tracking-wider">
                    Payroll Banking
                  </h3>
                  <div className="space-y-3">
                    <input
                      className="glass-input w-full px-3 py-2.5 rounded-xl text-sm"
                      name="bankName"
                      value={formData.bankingDetails?.bankName || ''}
                      onChange={e => handleNestedChange('bankingDetails', e)}
                      placeholder="Bank Name (e.g. BDO, BPI)"
                      aria-invalid={!!fieldErrors.bankName}
                    />
                    {fieldErrors.bankName && <p className="mt-1 text-xs text-red-600">{fieldErrors.bankName}</p>}
                    <div className="grid grid-cols-2 gap-4">
                      <input
                        className="glass-input w-full px-3 py-2.5 rounded-xl text-sm"
                        name="accountNumber"
                        value={formData.bankingDetails?.accountNumber || ''}
                        onChange={e => handleNestedChange('bankingDetails', e)}
                        placeholder="Account Number"
                        aria-invalid={!!fieldErrors.accountNumber}
                      />
                      {fieldErrors.accountNumber && <p className="mt-1 text-xs text-red-600">{fieldErrors.accountNumber}</p>}
                      <select
                        name="accountType"
                        value={formData.bankingDetails?.accountType || 'Savings'}
                        onChange={e => handleNestedChange('bankingDetails', e)}
                        className="glass-input w-full px-3 py-2.5 rounded-xl text-sm appearance-none cursor-pointer"
                      >
                        <option>Savings</option>
                        <option>Checking</option>
                      </select>
                    </div>
                  </div>
                </div>
              </div>
            )}

            <div className="flex justify-between items-center pt-6 mt-6 border-t border-gray-100">
              {step > 1 ? (
                <button
                  type="button"
                  onClick={prevStep}
                  className="text-gray-500 hover:text-gray-800 font-semibold px-4 py-2 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Back
                </button>
              ) : (
                <div></div>
              )}

              {step < 2 ? (
                <button
                  type="button"
                  onClick={nextStep}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 px-8 rounded-xl shadow-lg shadow-indigo-200 transform transition hover:-translate-y-0.5"
                >
                  Next Step
                </button>
              ) : (
                <button
                  type="submit"
                  disabled={isSubmitting}
                  onClick={() => setSubmitIntent(true)}
                  className="bg-gradient-to-r from-pink-500 to-rose-500 hover:from-pink-600 hover:to-rose-600 text-white font-bold py-3 px-8 rounded-xl shadow-lg shadow-pink-200 transform transition hover:-translate-y-0.5 disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {isSubmitting ? 'Saving...' : 'Complete Registration'}
                </button>
              )}
            </div>
          </form>

          <div className="mt-8 text-center">
            <p className="text-gray-500 text-sm">
              Already have an account?{' '}
              <Link to="/login" className="font-bold text-indigo-600 hover:text-indigo-500">
                Sign in
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SignUp;
