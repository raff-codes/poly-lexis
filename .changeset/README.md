# Changesets

This project uses [Changesets](https://github.com/changesets/changesets) for version management and publishing.

## Creating a Changeset

When you make changes that should trigger a new version:

```bash
npm run changeset
```

This will prompt you to:
1. Select which packages to bump (in this case, just `lexis`)
2. Choose the bump type (major, minor, or patch)
3. Write a summary of the changes

The changeset will be saved in the `.changeset` directory.

## Version Bumping

To consume all changesets and bump versions:

```bash
npm run version
```

This will:
- Update the version in `package.json`
- Update `CHANGELOG.md`
- Delete consumed changesets

## Publishing

To publish to npm:

```bash
npm run release
```

Or use the GitHub Action which will automatically publish when changesets are merged to `main`.

## CI/CD

The GitHub Actions workflow will:
- **On PR**: Check that a changeset exists (if needed)
- **On main**: Automatically create a "Version Packages" PR or publish to npm if merged
