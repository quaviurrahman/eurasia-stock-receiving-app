import axios from "axios";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
export const API = `${BACKEND_URL}/api`;

export const api = axios.create({ baseURL: API });

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("eurasia_token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Build a public URL for an object-storage file path stored in the DB.
export const fileUrl = (path) => (path ? `${API}/files/${path}` : "");
