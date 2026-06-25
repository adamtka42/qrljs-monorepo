import { configDefaults, defineConfig, mergeConfig } from 'vitest/config'
import baseConfig from '../../config/vitest.config.browser.mts'

export default mergeConfig(
  baseConfig,
  defineConfig({
    define: {
      global: 'globalThis',
    },
    test: {
      exclude: [
        ...configDefaults.exclude,
        // The QRL local VM test suite uses Node.js builtins and runs in the node environment.
        'test/qrl/**/*.spec.ts',
      ],
    },
    resolve: {
      alias: {
        events: 'eventemitter3',
      },
    },
  }),
)
