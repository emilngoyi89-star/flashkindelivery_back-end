// src/api.js
import axios from 'axios';

const DEFAULT_BASE = import.meta.env.VITE_API_BASE_URL || (window.location.hostname === 'localhost'
  ? 'http://localhost:3000'
  : 'https://flashkindelivery-back-end.onrender.com');

axios.defaults.baseURL = DEFAULT_BASE;
axios.defaults.withCredentials = true;
const api = axios.create({
  baseURL: window.location.hostname === 'localhost' 
    ? 'http://localhost:3000' 
    : 'https://flashkin-api.onrender.com',
  withCredentials: true,
  timeout: 10000 // Le frontend affichera une erreur de lui-même si ça prend plus de 10 secondes !
});

export default axios;