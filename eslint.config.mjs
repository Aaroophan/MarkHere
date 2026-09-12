import eslint from '@eslint/js'
import tseslint from 'typescript-eslint'
import vuePlugin from 'eslint-plugin-vue'
import vueParser from 'vue-eslint-parser'

const ignores = [
  '**/node_modules/**',
  '**/out/**',
  '**/dist/**',
  '**/coverage/**',
  '**/artifacts/**'
]

export default [
  { ignores },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  ...vuePlugin.configs['flat/recommended'],
  {
    files: ['**/*.vue'],
    languageOptions: {
      parser: vueParser,
      parserOptions: {
        parser: tseslint.parser,
        sourceType: 'module',
        ecmaVersion: 'latest'
      }
    }
  },
  {
    files: ['**/*.{ts,tsx,mts,cts,vue,js,mjs,cjs}'],
    rules: {
      'no-console': ['warn', { allow: ['warn', 'error'] }]
    }
  },
  {
    files: ['scripts/**/*.mjs', 'eslint.config.mjs'],
    rules: {
      'no-console': 'off'
    }
  }
]
