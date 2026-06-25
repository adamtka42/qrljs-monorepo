import { configDefaults, defineConfig, mergeConfig } from 'vitest/config'
import baseConfig from '../../config/vitest.config.browser.mts'

export default mergeConfig(
  baseConfig,
  defineConfig({
    test: {
      exclude: [
        ...configDefaults.exclude,
        // default export for minimist
        'test/transactionRunner.spec.ts',
        'test/eip4844.spec.ts',
        'test/eip7594.spec.ts',
        'test/t9n.spec.ts',
      ],
    },
  }),
)
