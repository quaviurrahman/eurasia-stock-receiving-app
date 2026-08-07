import { useEffect } from "react";
import "@/App.css";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "@/components/ui/sonner";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import Layout from "@/components/Layout";
import LoginPage from "@/pages/LoginPage";
import ReceivalListPage from "@/pages/ReceivalListPage";
import NewReceivalPage from "@/pages/NewReceivalPage";
import ReceivalDetailsPage from "@/pages/ReceivalDetailsPage";
import DashboardPage from "@/pages/DashboardPage";
import SettingsPage from "@/pages/SettingsPage";

const Protected = ({ children }) => {
  const { user } = useAuth();
  if (user === null)
    return (
      <div className="min-h-screen flex items-center justify-center text-sm text-muted-foreground">
        Loading…
      </div>
    );
  if (user === false) return <Navigate to="/login" replace />;
  return children;
};

const AdminOnly = ({ children }) => {
  const { user, isAdmin } = useAuth();
  if (user === null) return null;
  if (!isAdmin) return <Navigate to="/" replace />;
  return children;
};

function App() {
  return (
    <div className="App">
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route
              element={
                <Protected>
                  <Layout />
                </Protected>
              }
            >
              <Route index element={<ReceivalListPage />} />
              <Route path="new" element={<NewReceivalPage />} />
              <Route path="receival/:id" element={<ReceivalDetailsPage />} />
              <Route
                path="dashboard"
                element={
                  <AdminOnly>
                    <DashboardPage />
                  </AdminOnly>
                }
              />
              <Route
                path="settings"
                element={
                  <AdminOnly>
                    <SettingsPage />
                  </AdminOnly>
                }
              />
            </Route>
          </Routes>
        </BrowserRouter>
        <Toaster position="top-right" richColors />
      </AuthProvider>
    </div>
  );
}

export default App;
