import next from 'eslint-config-next';
import tsPlugin from '@typescript-eslint/eslint-plugin';

// eslint-config-next v16 exports its flat config as an array, not a function.
const config = [
  ...next,
  {
    ignores: ['.next/**', 'node_modules/**', 'out/**', 'next-env.d.ts'],
  },
  {
    // The rule lives in its own object, so the plugin must be registered here
    // (flat config resolves plugins per config object).
    plugins: { '@typescript-eslint': tsPlugin },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
    },
  },
];

export default config;
