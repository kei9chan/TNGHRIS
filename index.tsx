import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import AppErrorBoundary from './components/AppErrorBoundary';
import { clearLocalPhoneOwner, startPhoneInstallListener } from './services/phonePushService';
import {supabase} from './services/supabaseClient';

startPhoneInstallListener();
supabase.auth.onAuthStateChange(event=>{if(event==='SIGNED_OUT') void clearLocalPhoneOwner().catch(()=>{});});

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <AppErrorBoundary>
      <App />
    </AppErrorBoundary>
  </React.StrictMode>
);
