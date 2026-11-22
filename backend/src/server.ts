// Process entry. Loads this project's .env (never a parent directory's) and
// boots the API. Run from backend/: npm run dev
import './load-env.js';
import { startServer } from './main.js';

startServer().catch((err) => {
  // console.error is allowed by the eslint config; last-resort boot error.
  console.error('fatal boot error', err);
  process.exit(1);
});
