import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../services/supabaseClient';

const ForgotPassword: React.FC = () => {
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccessMessage('');
    setIsLoading(true);

    try {
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(
        email.trim(),
        {
          // After clicking the link in the email, Supabase redirects here
          redirectTo: `${window.location.origin}/reset-password`,
        }
      );

      if (resetError) {
        setError(resetError.message || 'Failed to send reset email. Please try again.');
      } else {
        setSuccessMessage(
          'Password reset link sent! Check your email inbox and follow the instructions.'
        );
        setEmail('');
      }
    } catch (err) {
      console.error('[ForgotPassword] unexpected error', err);
      setError('An unexpected error occurred. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex overflow-hidden bg-gray-50 font-sans">
      <style>{`
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
        }
        .glass-input:focus {
          background: #FFFFFF;
          box-shadow: 0 0 0 4px rgba(167, 139, 250, 0.2);
          border-color: #8B5CF6;
        }
      `}</style>

      {/* LEFT SIDE */}
      <div className="hidden lg:flex w-1/2 relative bg-gradient-to-br from-violet-600 via-fuchsia-500 to-teal-400 animate-gradient-x items-center justify-center overflow-hidden">
        <div className="absolute top-[-10%] left-[-10%] w-96 h-96 bg-purple-400 rounded-full mix-blend-multiply filter blur-3xl opacity-50" />
        <div className="absolute top-[-10%] right-[-10%] w-96 h-96 bg-teal-300 rounded-full mix-blend-multiply filter blur-3xl opacity-50" />
        <div className="absolute bottom-[-20%] left-[20%] w-96 h-96 bg-pink-400 rounded-full mix-blend-multiply filter blur-3xl opacity-50" />

        <div className="relative z-10 text-center p-12 max-w-xl">
          <div className="w-28 h-28 bg-white/20 backdrop-blur-md rounded-3xl flex items-center justify-center mx-auto mb-10 shadow-2xl">
            <svg className="w-14 h-14 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
            </svg>
          </div>
          <h1 className="text-5xl font-extrabold text-white mb-6 tracking-tight drop-shadow-sm">
            RESET YOUR<br />PASSWORD
          </h1>
          <p className="text-lg text-white/90 font-medium leading-relaxed">
            No worries! Just enter your email and we'll send you a reset link in seconds.
          </p>
        </div>
      </div>

      {/* RIGHT SIDE */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-6 relative">
        <div className="lg:hidden absolute top-0 left-0 w-full h-64 bg-gradient-to-b from-violet-600 to-transparent opacity-20" />

        <div className="max-w-md w-full bg-white rounded-3xl shadow-2xl p-8 md:p-12 relative z-10 border border-gray-100">
          {/* Mobile header */}
          <div className="lg:hidden text-center mb-8">
            <h1 className="text-3xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-violet-600 to-pink-500">
              TNG HRIS
            </h1>
          </div>

          {/* Back to login */}
          <Link
            to="/login"
            className="inline-flex items-center text-sm text-gray-500 hover:text-violet-600 mb-8 transition-colors group"
          >
            <svg className="w-4 h-4 mr-2 group-hover:-translate-x-1 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            Back to Login
          </Link>

          <div className="mb-8">
            <h2 className="text-3xl font-bold text-gray-900">Forgot Password?</h2>
            <p className="text-gray-500 mt-2">
              Enter your email address and we'll send you a link to reset your password.
            </p>
          </div>

          {successMessage && (
            <div
              className="bg-green-50 border border-green-300 text-green-700 px-4 py-4 rounded-xl relative mb-6 flex items-start gap-3"
              role="alert"
            >
              <svg className="w-5 h-5 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
              <span className="font-medium">{successMessage}</span>
            </div>
          )}

          {error && (
            <div
              className="bg-red-50 border border-red-300 text-red-700 px-4 py-3 rounded-xl relative mb-6 flex items-center"
              role="alert"
            >
              <svg className="w-5 h-5 mr-2 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
              </svg>
              <span className="font-medium">{error}</span>
            </div>
          )}

          {!successMessage && (
            <form className="space-y-6" onSubmit={handleSubmit}>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Email Address
                </label>
                <input
                  id="forgot-email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="glass-input w-full px-4 py-3 rounded-xl border border-gray-200 outline-none text-gray-700 font-medium"
                  placeholder="you@company.com"
                />
              </div>

              <button
                id="send-reset-link-btn"
                type="submit"
                disabled={isLoading}
                className="w-full bg-gradient-to-r from-violet-600 to-pink-500 hover:from-violet-500 hover:to-pink-400 text-white font-bold py-3.5 rounded-xl shadow-xl shadow-violet-200 transform transition hover:-translate-y-0.5 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isLoading ? (
                  <span className="flex items-center justify-center">
                    <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    Sending...
                  </span>
                ) : (
                  'Send Reset Link'
                )}
              </button>
            </form>
          )}

          {successMessage && (
            <div className="text-center mt-4">
              <Link
                to="/login"
                className="font-semibold text-violet-600 hover:text-violet-500 text-sm"
              >
                Return to Login
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ForgotPassword;
