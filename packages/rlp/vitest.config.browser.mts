import { defineConfig, mergeConfig } from 'vitest/config'
import baseConfig from '../../config/vitest.config.browser.mts'

export default mergeConfig(
  baseConfig,
  defineConfig({
    test: {
      exclude: ['test/cli.spec.ts'],
      testTimeout: 180000,
    },
  }),
)
