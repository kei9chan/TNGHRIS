import React, { useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';

const RegistrationSuccess: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();

  // If someone navigates here directly without coming from the signup flow, redirect away
  useEffect(() => {
    if (!location.state?.fromSignUp) {
      navigate('/login', { replace: true });
    }
  }, [location.state, navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 font-sans p-4">
      <style>{`
        @keyframes float-up {
          0% { opacity: 0; transform: translateY(24px); }
          100% { opacity: 1; transform: translateY(0); }
        }
        @keyframes pop {
          0% { transform: scale(0.6); opacity: 0; }
          70% { transform: scale(1.1); }
          100% { transform: scale(1); opacity: 1; }
        }
        @keyframes gradient-x {
          0%, 100% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
        }
        .animate-float-up { animation: float-up 0.6s ease-out forwards; }
        .animate-pop { animation: pop 0.5s ease-out forwards; }
        .animate-gradient-x {
          background-size: 200% 200%;
          animation: gradient-x 8s ease infinite;
        }
        .step-line {
          height: 2px;
          flex: 1;
        }
      `}</style>

      {/* Background blobs */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-32 -left-32 w-96 h-96 bg-violet-300 rounded-full mix-blend-multiply filter blur-3xl opacity-30" />
        <div className="absolute -bottom-32 -right-32 w-96 h-96 bg-teal-300 rounded-full mix-blend-multiply filter blur-3xl opacity-30" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-72 h-72 bg-pink-300 rounded-full mix-blend-multiply filter blur-3xl opacity-20" />
      </div>

      <div className="relative z-10 max-w-lg w-full">
        {/* Main card */}
        <div className="animate-float-up bg-white rounded-3xl shadow-2xl p-8 md:p-12 border border-gray-100 text-center">

          {/* Success icon */}
          <div className="animate-pop flex items-center justify-center mb-6">
            <div className="w-24 h-24 rounded-full bg-gradient-to-br from-violet-500 to-teal-400 animate-gradient-x flex items-center justify-center shadow-lg shadow-violet-200">
              <svg className="w-12 h-12 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
          </div>

          <h1 className="text-3xl font-extrabold text-gray-900 mb-2">
            You're Registered! 🎉
          </h1>
          <p className="text-gray-500 text-base mb-8 leading-relaxed">
            Your account has been successfully created and is now awaiting HR approval.
            You'll be notified once your account is activated.
          </p>

          {/* What happens next */}
          <div className="bg-gray-50 rounded-2xl p-5 mb-8 text-left space-y-4">
            <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wider mb-3">What happens next?</h2>

            <div className="flex items-start space-x-3">
              <div className="flex-shrink-0 w-7 h-7 rounded-full bg-violet-100 flex items-center justify-center">
                <span className="text-violet-600 font-bold text-xs">1</span>
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-800">Check your email</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  A confirmation link has been sent to your email address. Click it to verify your account.
                </p>
              </div>
            </div>

            <div className="flex items-start space-x-3">
              <div className="flex-shrink-0 w-7 h-7 rounded-full bg-violet-100 flex items-center justify-center">
                <span className="text-violet-600 font-bold text-xs">2</span>
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-800">HR reviews your registration</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  Our HR team will verify your information and activate your account, usually within 1–2 business days.
                </p>
              </div>
            </div>

            <div className="flex items-start space-x-3">
              <div className="flex-shrink-0 w-7 h-7 rounded-full bg-teal-100 flex items-center justify-center">
                <span className="text-teal-600 font-bold text-xs">3</span>
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-800">You're in!</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  Once approved, you can log in and access the TNG HRIS system.
                </p>
              </div>
            </div>
          </div>

          {/* Info note */}
          <div className="flex items-center space-x-2 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 mb-8 text-left">
            <svg className="w-5 h-5 text-amber-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p className="text-xs text-amber-700">
              <span className="font-semibold">Note:</span> Your registration has been received by HR. You will not be able to log in until your account is approved.
            </p>
          </div>

          <Link
            to="/login"
            className="block w-full bg-gradient-to-r from-violet-600 to-teal-500 animate-gradient-x text-white font-bold py-3.5 rounded-xl shadow-lg shadow-violet-200 hover:shadow-xl transition-all hover:-translate-y-0.5 transform text-center"
          >
            Go to Login
          </Link>
        </div>

        <p className="text-center text-xs text-gray-400 mt-6">
          Questions? Contact HR at{' '}
          <a href="mailto:hr@thenextexperience.com" className="text-violet-500 hover:underline">
            hr@thenextexperience.com
          </a>
        </p>
      </div>
    </div>
  );
};

export default RegistrationSuccess;
