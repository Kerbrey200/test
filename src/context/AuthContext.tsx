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

  const saveProfile = (user: any) => {
    const normalized = { ...user, uid: user.uid || user.id };
    setProfile(normalized);
    localStorage.setItem('erp_user', JSON.stringify(normalized));
  };

  useEffect(() => {
    const savedUser = localStorage.getItem('erp_user');
    if (!savedUser) {
      setLoading(false);
      return;
    }
    const cached = JSON.parse(savedUser);
    // The cached copy goes stale when an admin changes this user's role or object, so re-read it.
    fetch(`/api/auth/me/${cached.uid || cached.id}`)
      .then(async res => {
        if (res.ok) {
          saveProfile((await res.json()).user);
        } else if (res.status === 404) {
          setProfile(null);
          localStorage.removeItem('erp_user');
        } else {
          setProfile(cached);
        }
      })
      .catch(() => setProfile(cached))
      .finally(() => setLoading(false));
  }, []);

  const login = async (email: string, password: string) => {
    const data = await apiFetch('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password })
    });
    saveProfile(data.user);
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
