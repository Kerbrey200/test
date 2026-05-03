import React, { createContext, useContext, useEffect, useState } from 'react';
import { UserProfile } from '../types';
import { apiFetch } from '../lib/api';

interface AuthContextType {
  user: any | null;
  profile: UserProfile | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType>({ 
  user: null, 
  profile: null, 
  loading: true,
  login: async () => {},
  logout: () => {}
});

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const savedUser = localStorage.getItem('erp_user');
    if (savedUser) {
      setProfile(JSON.parse(savedUser));
    }
    setLoading(false);
  }, []);

  const login = async (email: string, password: string) => {
    const data = await apiFetch('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password })
    });
    setProfile(data.user);
    localStorage.setItem('erp_user', JSON.stringify(data.user));
  };

  const logout = () => {
    setProfile(null);
    localStorage.removeItem('erp_user');
  };

  return (
    <AuthContext.Provider value={{ user: profile, profile, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
