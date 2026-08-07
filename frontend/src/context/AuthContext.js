import { createContext, useContext, useEffect, useState } from "react";
import { api } from "@/lib/api";

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null); // null = loading, false = not authed
  const [token, setToken] = useState(localStorage.getItem("eurasia_token"));

  useEffect(() => {
    const check = async () => {
      if (!token) {
        setUser(false);
        return;
      }
      try {
        const { data } = await api.get("/auth/me");
        setUser(data);
      } catch {
        localStorage.removeItem("eurasia_token");
        setToken(null);
        setUser(false);
      }
    };
    check();
  }, [token]);

  const login = async (email, password) => {
    const { data } = await api.post("/auth/login", { email, password });
    localStorage.setItem("eurasia_token", data.access_token);
    setToken(data.access_token);
    setUser(data.user);
    return data.user;
  };

  const staffLogin = async (pin) => {
    const { data } = await api.post("/auth/staff-login", { pin });
    localStorage.setItem("eurasia_token", data.access_token);
    setToken(data.access_token);
    setUser(data.user);
    return data.user;
  };

  const logout = () => {
    localStorage.removeItem("eurasia_token");
    setToken(null);
    setUser(false);
  };

  const isAdmin = user && user !== false && user.role === "admin";

  return (
    <AuthContext.Provider value={{ user, isAdmin, login, staffLogin, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
