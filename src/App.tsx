import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { LanguageProvider } from './context/LanguageContext';
import Login from './pages/Login';
import DashboardLayout from './layout/DashboardLayout';
import Materials from './pages/Materials';
import Users from './pages/Users';
import Projects from './pages/Projects';
import Requisitions from './pages/Requisitions';
import Reports from './pages/Reports';
import Waybills from './pages/Waybills';
import Inventory from './pages/Inventory';
import Invoices from './pages/Invoices';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  
  if (loading) return <div className="flex items-center justify-center h-screen">Loading...</div>;
  if (!user) return <Navigate to="/login" />;
  
  return <>{children}</>;
}

export default function App() {
  return (
    <LanguageProvider>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route
              path="/*"
              element={
                <ProtectedRoute>
                  <DashboardLayout>
                    <Routes>
                      <Route path="/" element={<Navigate to="/materials" />} />
                      <Route path="/materials" element={<Materials />} />
                      <Route path="/users" element={<Users />} />
                      <Route path="/projects" element={<Projects />} />
                      <Route path="/requisitions" element={<Requisitions />} />
                      <Route path="/reports" element={<Reports />} />
                      <Route path="/waybills" element={<Waybills />} />
                      <Route path="/inventory" element={<Inventory />} />
                      <Route path="/invoices" element={<Invoices />} />
                    </Routes>
                  </DashboardLayout>
                </ProtectedRoute>
              }
            />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </LanguageProvider>
  );
}
