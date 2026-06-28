# QRL JS Developer Docs

This guide covers the active QRL-focused monorepo layout, common development commands,
and release helper behavior.

## Monorepo

The project uses npm workspaces to manage the active packages under `packages/`.
Package names use the QRL `@theqrl/*` scope.

### Structure

- `/packages` - Active QRL execution packages and generic helpers.
- `/config` - Shared TypeScript, lint, spellcheck, and test configuration.
- `/scripts` - Release and repository maintenance helpers.

### Common Commands

- Clean the workspace: `npm run clean`
- Lint code: `npm run lint`
- Fix linting issues: `npm run lint:fix`
- Build all packages: `npm run build --workspaces --if-present`
- Type-check all packages: `npm run tsc --workspaces --if-present`
- Test all packages: `npm test --workspaces --if-present`
- Spellcheck docs and code: `npm run spellcheck`

### Working on a Specific Package

Example for the VM package:

```sh
cd packages/vm
npm run test
npx vitest test/qrl/localVm.spec.ts
npm run build --workspace=@theqrl/vm
```

## Releases

Release tooling is retained for the active package set only:

```sh
tsx scripts/release-npm.ts [--bump-version=<version>] [--publish=<tag>] [--scope=<scope>] [--otp=<code>]
tsx scripts/release-github.ts --version=<version> [--start-with=<package>]
```

The npm release script defaults to the `@theqrl/*` package scope. Use `--scope=<scope>` only for an explicit fork-style publish.

Package changelogs are not maintained in this QRL-focused repository. GitHub release
notes are generated from package metadata by default. For richer notes, add an
optional `RELEASE_NOTES.md` to the package or summarize the release from the commit
range.

## Development Tools

### TypeScript

Each package should have:

- `tsconfig.json` for development and tests.
- `tsconfig.prod.json` for production builds.

Build scripts use the shared helpers in `config/cli`:

```json
{
  "scripts": {
    "tsc": "../../config/cli/ts-compile.sh",
    "build": "../../config/cli/ts-build.sh"
  }
}
```

### Linting

The project uses ESLint v9 and Biome. Package-level ESLint configs extend the
repository-wide config.

```sh
npm run lint
npm run lint:fix
```

### Spellcheck

Spellcheck configuration lives in:

- `config/cspell-md.json`
- `config/cspell-ts.json`

Run:

```sh
npm run spellcheck
```

### Testing

The project uses Vitest. QRL tests live under package `test/qrl` directories.

```sh
npm test --workspaces --if-present
npx vitest packages/vm/test/qrl/localVm.spec.ts
```

## Linking to an External Project

To test a package locally from another project:

```sh
cd packages/vm
npm run build
npm link

cd path/to/consumer
npm link @theqrl/vm
```

When done:

```sh
cd path/to/consumer
npm unlink --no-save @theqrl/vm

cd /path/to/qrljs-monorepo/packages/vm
npm unlink
```
