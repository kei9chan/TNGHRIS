
import React, { useState, useEffect } from 'react';
import { useNavigate, Link, useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { DeviceConflictError } from '../context/AuthContext';
import GoogleIcon from '../components/icons/GoogleIcon';

// Floating Icon Component for the "HR Universe"
const FloatingIcon: React.FC<{ children: React.ReactNode; delay?: string; className?: string }> = ({ children, delay = '0s', className = '' }) => (
  <div 
    className={`absolute bg-white/20 backdrop-blur-md p-3 rounded-2xl shadow-lg text-white ${className}`}
    style={{ animation: `float 6s ease-in-out infinite`, animationDelay: delay }}
  >
    {children}
  </div>
);

const Login: React.FC = () => {
  const [email, setEmail] = useState('kay@thenextperience.com');
  const [password, setPassword] = useState('@Tng2025');
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [isDeviceConflict, setDeviceConflict] = useState(false);
  const { login, forceLogin, loginWithGoogle } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [successMessage, setSuccessMessage] = useState(location.state?.message || '');

  useEffect(() => {
    if (successMessage) {
        const timer = setTimeout(() => setSuccessMessage(''), 5000);
        window.history.replaceState({}, document.title);
        return () => clearTimeout(timer);
    }
  }, [successMessage]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setDeviceConflict(false);
    setIsLoading(true);
    try {
      const user = await login(email, password);
      if (user) {
        navigate('/dashboard');
      } else {
        setError('Invalid email or password. New accounts require HR approval.');
      }
    } catch (err) {
      if (err instanceof DeviceConflictError) {
        setDeviceConflict(true);
        setError('You are already signed in on another device. Force sign in here to log out your other session.');
      } else {
        setError('An unexpected error occurred. Please try again.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleForceSubmit = async () => {
    setError('');
    setDeviceConflict(false);
    setIsLoading(true);
    try {
        const user = await forceLogin(email, password);
        if(user) navigate('/dashboard');
        else setError('Invalid email or password.');
    } catch(err) {
        setError('An unexpected error occurred during force login.');
    } finally {
        setIsLoading(false);
    }
  };
  
  const handleGoogleLogin = async () => {
    setError('');
    setIsGoogleLoading(true);
    try {
      const user = await loginWithGoogle();
      if (user) navigate('/dashboard');
      else setError('Google Sign-In failed. Please try again or use email/password.');
    } catch (err) {
      setError('An unexpected error occurred during Google Sign-In.');
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
        }
        .glass-input:focus {
            background: #FFFFFF;
            box-shadow: 0 0 0 4px rgba(167, 139, 250, 0.2);
            border-color: #8B5CF6;
        }
      `}</style>

      {/* LEFT SIDE: The Welcome Universe */}
      <div className="hidden lg:flex w-1/2 relative bg-gradient-to-br from-violet-600 via-fuchsia-500 to-teal-400 animate-gradient-x items-center justify-center overflow-hidden">
        {/* Decorative Blobs */}
        <div className="absolute top-[-10%] left-[-10%] w-96 h-96 bg-purple-400 rounded-full mix-blend-multiply filter blur-3xl opacity-50 animate-blob"></div>
        <div className="absolute top-[-10%] right-[-10%] w-96 h-96 bg-teal-300 rounded-full mix-blend-multiply filter blur-3xl opacity-50 animate-blob animation-delay-2000"></div>
        <div className="absolute bottom-[-20%] left-[20%] w-96 h-96 bg-pink-400 rounded-full mix-blend-multiply filter blur-3xl opacity-50 animate-blob animation-delay-4000"></div>
        
        <div className="relative z-10 text-center p-12 max-w-xl">
            {/* The HR Hero Composition */}
            <div className="relative w-64 h-64 mx-auto mb-12">
                {/* Hero Character (Simple representation) */}
                <div className="absolute inset-0 flex items-center justify-center z-20">
                     <div className="w-32 h-32 bg-white rounded-full shadow-2xl flex items-center justify-center text-6xl border-4 border-white/30 backdrop-blur-sm">
                        👩‍💼
                     </div>
                </div>
                {/* Orbiting Icons */}
                <FloatingIcon delay="0s" className="top-0 left-0 -rotate-12">
                    <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                </FloatingIcon>
                <FloatingIcon delay="1.5s" className="top-10 right-0 rotate-12">
                    <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                </FloatingIcon>
                <FloatingIcon delay="3s" className="bottom-0 left-4 -rotate-6">
                     <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.653-.122-1.28-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.653.122-1.28.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" /></svg>
                </FloatingIcon>
                 <FloatingIcon delay="2s" className="bottom-4 right-4 rotate-6">
                     <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                </FloatingIcon>
            </div>

            <h1 className="text-5xl font-extrabold text-white mb-6 tracking-tight drop-shadow-sm">
                WELCOME TO <br/>TNG HRIS
            </h1>
            <p className="text-lg text-white/90 font-medium leading-relaxed">
                Your all-in-one HR playground where everything just flows.
            </p>
        </div>
      </div>

      {/* RIGHT SIDE: The Magic Login Card */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-6 relative">
        {/* Mobile background gradient hint */}
        <div className="lg:hidden absolute top-0 left-0 w-full h-64 bg-gradient-to-b from-violet-600 to-transparent opacity-20"></div>

        <div className="max-w-md w-full bg-white rounded-3xl shadow-2xl p-8 md:p-12 relative z-10 border border-gray-100">
             {/* Header for Mobile */}
             <div className="lg:hidden text-center mb-8">
                <h1 className="text-3xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-violet-600 to-pink-500">TNG HRIS</h1>
            </div>

            <div className="mb-8 text-center lg:text-left">
                <h2 className="text-3xl font-bold text-gray-900">Login</h2>
                <p className="text-gray-500 mt-2">Welcome back! Ready to get things done?</p>
            </div>

            {successMessage && (
                <div className="bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded-xl relative mb-6 flex items-center animate-pulse" role="alert">
                    <svg className="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd"/></svg>
                    <span className="block sm:inline font-medium">{successMessage}</span>
                </div>
            )}

            {error && (
                 <div className={`px-4 py-3 rounded-xl relative mb-6 flex items-center ${isDeviceConflict ? 'bg-amber-100 text-amber-800 border border-amber-300' : 'bg-red-100 text-red-700 border border-red-300'}`} role="alert">
                    <span className="block sm:inline font-medium">{error}</span>
                </div>
            )}

            <form className="space-y-6" onSubmit={handleSubmit}>
                <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">Email Address</label>
                    <input
                        id="email"
                        type="email"
                        required
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="glass-input w-full px-4 py-3 rounded-xl border border-gray-200 outline-none text-gray-700 font-medium"
                        placeholder="you@company.com"
                    />
                </div>
                <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">Password</label>
                    <input
                        id="password"
                        type="password"
                        required
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="glass-input w-full px-4 py-3 rounded-xl border border-gray-200 outline-none text-gray-700 font-medium"
                        placeholder="••••••••"
                    />
                </div>

                <div className="flex items-center justify-between">
                    {/* Cute Toggle */}
                    <label className="flex items-center cursor-pointer">
                        <div className="relative">
                            <input type="checkbox" className="sr-only" checked={rememberMe} onChange={(e) => setRememberMe(e.target.checked)} />
                            <div className={`block w-10 h-6 rounded-full transition-colors ${rememberMe ? 'bg-violet-500' : 'bg-gray-300'}`}></div>
                            <div className={`dot absolute left-1 top-1 bg-white w-4 h-4 rounded-full transition-transform ${rememberMe ? 'translate-x-4' : ''}`}></div>
                        </div>
                        <div className="ml-3 text-sm text-gray-600 font-medium">Remember me</div>
                    </label>
                    
                    <div className="text-sm">
                        <a href="#" className="font-semibold text-pink-500 hover:text-pink-600 hover:underline">
                            Forgot password?
                        </a>
                    </div>
                </div>

                <div className="pt-2">
                    {isDeviceConflict ? (
                         <button 
                            type="button" 
                            onClick={handleForceSubmit}
                            disabled={isLoading}
                            className="w-full bg-amber-500 hover:bg-amber-600 text-white font-bold py-3.5 rounded-xl shadow-lg shadow-amber-200 transform transition hover:-translate-y-0.5 disabled:opacity-50 disabled:cursor-not-allowed"
                         >
                            {isLoading ? 'Processing...' : 'Force Sign In'}
                         </button>
                    ) : (
                        <button 
                            type="submit" 
                            disabled={isLoading}
                            className="w-full bg-gradient-to-r from-violet-600 to-pink-500 hover:from-violet-500 hover:to-pink-400 text-white font-bold py-3.5 rounded-xl shadow-xl shadow-violet-200 transform transition hover:-translate-y-0.5 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {isLoading ? (
                                <span className="flex items-center justify-center">
                                    <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                    </svg>
                                    Signing in...
                                </span>
                            ) : "Sign In"}
                        </button>
                    )}
                </div>
            </form>

            <div className="mt-8">
                <div className="relative">
                    <div className="absolute inset-0 flex items-center">
                        <div className="w-full border-t border-gray-200"></div>
                    </div>
                    <div className="relative flex justify-center text-sm">
                        <span className="px-4 bg-white text-gray-400 font-medium">Or continue with</span>
                    </div>
                </div>

                <div className="mt-6">
                    <button 
                        type="button" 
                        onClick={handleGoogleLogin}
                        disabled={isGoogleLoading}
                        className="w-full flex items-center justify-center px-4 py-3 border border-gray-200 rounded-xl shadow-sm bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 hover:border-gray-300 transition-all disabled:opacity-50"
                    >
                        {isGoogleLoading ? (
                             <svg className="animate-spin h-5 w-5 text-gray-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                        ) : (
                             <>
                                <GoogleIcon className="h-5 w-5 mr-2" />
                                Sign in with Google
                            </>
                        )}
                    </button>
                </div>
            </div>

            <div className="mt-8 text-center">
                <p className="text-gray-500 text-sm">
                    New Employee?{' '}
                    <Link to="/signup" className="font-bold text-violet-600 hover:text-violet-500">
                        Sign up here
                    </Link>
                </p>
            </div>
        </div>
      </div>
    </div>
  );
};

export default Login;
