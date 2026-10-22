import axios from 'axios';

import { apiUrl } from '../api/config';

const api = axios.create({
  baseURL: apiUrl(),
});

export default api;
