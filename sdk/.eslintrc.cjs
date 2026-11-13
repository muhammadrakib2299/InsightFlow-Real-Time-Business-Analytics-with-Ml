module.exports = {
  parser: '@typescript-eslint/parser',
  parserOptions: {
    // The build tsconfig excludes *.test.ts so tests never ship in dist/.
    // Linting still covers them, so it needs a project that includes them.
    project: 'tsconfig.eslint.json',
    tsconfigRootDir: __dirname,
    sourceType: 'module',
  },
  plugins: ['@typescript-eslint'],
  extends: ['plugin:@typescript-eslint/recommended', 'prettier'],
  root: true,
  env: { node: true, browser: true },
  ignorePatterns: ['.eslintrc.cjs', 'dist/**', 'node_modules/**'],
  rules: {
    '@typescript-eslint/no-explicit-any': 'warn',
    '@typescript-eslint/no-non-null-assertion': 'off',
  },
};
