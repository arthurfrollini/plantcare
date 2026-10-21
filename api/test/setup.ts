import { loadEnvFile } from 'node:process';

loadEnvFile(new URL('../.env.test', import.meta.url));
