import { configDefaults, defineConfig, mergeConfig } from 'vitest/config'
import baseConfig from '../../config/vitest.config.browser.mts'

export default mergeConfig(
  baseConfig,
  defineConfig({
    test: {
      exclude: [
        ...configDefaults.exclude,
        // The QRL util tests are validated in the node environment.
        'test/qrl/**/*.spec.ts',
      ],
    },
  }),
)
