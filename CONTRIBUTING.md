# Contributing

Thanks for your interest in contributing to `forgejo-ts`.

## Development setup

```bash
npm install
npm run build
npm run lint
npm test
```

For integration tests:

```bash
export FORGEJO_TEST_URL=http://forgejo:3000
export FORGEJO_TEST_TOKEN=<token>
npm run test:live
```

A helper script is available at `scripts/setup-forgejo-test.sh` for CI/containerized setup.

## Pull request checklist

- [ ] Code compiles (`npm run build`)
- [ ] Type checks pass (`npm run lint`)
- [ ] Unit tests pass (`npm test`)
- [ ] Coverage thresholds pass (`npm run test:coverage`)
- [ ] README/API docs updated when behavior changes
- [ ] No secrets, personal tokens, or private endpoints committed

## Commit hygiene

- Keep commits focused and descriptive.
- Add/adjust tests for behavior changes.
- Prefer backward-compatible API changes unless versioned as breaking.
