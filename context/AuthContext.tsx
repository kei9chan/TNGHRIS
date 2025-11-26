
import React, { createContext, useState, useEffect, ReactNode } from 'react';
import { User, DeviceBind } from '../types';
import { mockLogin, mockLogout } from '../services/mockApi';
import { mockDeviceBinds, mockUsers } from '../services/mockData';
import { getDeviceId, getAppVersion } from '../services/deviceSecurity';

export class DeviceConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DeviceConflictError';
  }
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (email: string, pass: string) => Promise<User | null>;
  forceLogin: (email: string, pass: string) => Promise<User | null>;
  loginWithGoogle: () => Promise<User | null>;
  logout: () => void;
  connectGoogle: () => void;
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    try {
      const storedUserStr = localStorage.getItem('user');
      if (storedUserStr) {
        const storedUser = JSON.parse(storedUserStr);
        // CRITICAL FIX: Re-fetch the latest user data from mockUsers based on ID.
        // This ensures that if we add new fields (like accessScope) to the code, 
        // the logged-in user gets them immediately without needing to clear cache.
        const freshUser = mockUsers.find(u => u.id === storedUser.id);
        
        if (freshUser) {
            setUser(freshUser);
            // Update local storage to match
            localStorage.setItem('user', JSON.stringify(freshUser));
        } else {
            // User no longer exists in mock data (e.g. code change deleted them), clear session
            setUser(null);
            localStorage.removeItem('user');
        }
      }
    } catch (error) {
      console.error("Failed to parse user from localStorage", error);
      localStorage.removeItem('user');
    } finally {
      setLoading(false);
    }
  }, []);
  
  const handleSuccessfulLogin = (loggedInUser: User, deviceId: string): User => {
    // Inactivate any other bindings for this user on OTHER devices.
    mockDeviceBinds.forEach(bind => {
        if (bind.employeeId === loggedInUser.id && bind.deviceId !== deviceId) {
            bind.isBlocked = true; // Simulating old session invalidation
        }
    });
      
    let deviceBind = mockDeviceBinds.find(b => b.deviceId === deviceId && b.employeeId === loggedInUser.id);
    if (deviceBind) {
        deviceBind.lastLogin = new Date();
        deviceBind.isBlocked = false;
    } else {
        deviceBind = {
            id: `bind-${Date.now()}`,
            employeeId: loggedInUser.id,
            deviceId: deviceId,
            platform: 'web',
            appVersion: getAppVersion(),
            lastLogin: new Date(),
            isBlocked: false,
        };
        mockDeviceBinds.push(deviceBind);
    }

    // Update user object and mock DB
    const userWithDevice = { ...loggedInUser, activeDeviceId: deviceId };
    const userIndex = mockUsers.findIndex(u => u.id === loggedInUser.id);
    if(userIndex > -1) {
        mockUsers[userIndex].activeDeviceId = deviceId;
    }

    setUser(userWithDevice);
    localStorage.setItem('user', JSON.stringify(userWithDevice));
    return userWithDevice;
  };

  const login = async (email: string, pass: string): Promise<User | null> => {
    setLoading(true);
    const loggedInUser = await mockLogin(email, pass);
    if (!loggedInUser) {
        setLoading(false);
        return null;
    }

    const deviceId = getDeviceId();
    const activeBind = mockDeviceBinds.find(b => 
        b.employeeId === loggedInUser.id && 
        b.isBlocked === false && 
        b.deviceId !== deviceId &&
        // Only consider it a conflict if the last login was recent (e.g., within 24 hours)
        (new Date().getTime() - new Date(b.lastLogin).getTime() < 24 * 60 * 60 * 1000)
    );
    
    if (activeBind) {
        setLoading(false);
        throw new DeviceConflictError('An active session already exists on another device.');
    }
    
    const finalUser = handleSuccessfulLogin(loggedInUser, deviceId);
    setLoading(false);
    return finalUser;
  };
  
  const forceLogin = async (email: string, pass: string): Promise<User | null> => {
    setLoading(true);
    const loggedInUser = await mockLogin(email, pass);
    if (!loggedInUser) {
        setLoading(false);
        return null;
    }
    const deviceId = getDeviceId();
    const finalUser = handleSuccessfulLogin(loggedInUser, deviceId);
    setLoading(false);
    return finalUser;
  };
  
  const loginWithGoogle = async (): Promise<User | null> => {
    setLoading(true);
    try {
      // Simulate Google Auth by fetching a predefined user
      // In a real app, you'd use a library like @react-oauth/google
      const googleUser = mockUsers.find(u => u.id === '4'); // Jane Smith
      if (!googleUser) {
        throw new Error("Mock Google user not found.");
      }
      
      // The Google sign-in will act like a "force login", invalidating other sessions.
      const deviceId = getDeviceId();
      return handleSuccessfulLogin(googleUser, deviceId);

    } catch (error) {
      console.error("Google login simulation failed", error);
      return null;
    } finally {
      setLoading(false);
    }
  };


  const logout = () => {
    const deviceId = getDeviceId();
    const bind = mockDeviceBinds.find(b => b.deviceId === deviceId && b.employeeId === user?.id);
    if (bind) {
        bind.isBlocked = true; // Mark as inactive
    }
    if (user) {
        const userIndex = mockUsers.findIndex(u => u.id === user.id);
        if(userIndex > -1) {
            mockUsers[userIndex].activeDeviceId = undefined;
        }
    }
    
    mockLogout();
    setUser(null);
    localStorage.removeItem('user');
  };
  
  const connectGoogle = () => {
    if (user) {
        const userIndex = mockUsers.findIndex(u => u.id === user.id);
        if (userIndex > -1) {
            mockUsers[userIndex].isGoogleConnected = true;
            const updatedUser = { ...user, isGoogleConnected: true };
            setUser(updatedUser);
            localStorage.setItem('user', JSON.stringify(updatedUser));
            alert('Successfully connected your Google account (Simulation).');
        }
    }
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, forceLogin, loginWithGoogle, logout, connectGoogle }}>
      {children}
    </AuthContext.Provider>
  );
};
