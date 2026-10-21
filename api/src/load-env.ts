import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Loads api/.env (next to src/ and dist/) without overriding real variables.
const file = fileURLToPath(new URL('../.env', import.meta.url));
if (existsSync(file)) {
  process.loadEnvFile(file);
}
