import js from '@eslint/js';
import globals from 'globals';

export default [
    { ignores: ['node_modules/**', 'frontend/**', 'legacy/**'] },
    { files: ['backend/**/*.js'], languageOptions: { globals: globals.node },
      rules: { ...js.configs.recommended.rules, 'no-unused-vars': ['error', { caughtErrors: 'none' }] } },
];
