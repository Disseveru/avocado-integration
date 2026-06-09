```markdown
# avocado-integration Development Patterns

> Auto-generated skill from repository analysis

## Overview
This skill teaches the core development patterns and conventions used in the `avocado-integration` TypeScript repository. You'll learn about file naming, import/export styles, commit message habits, and how to write and run tests. While no specific frameworks or automated workflows are detected, this guide will help you contribute code that matches the established practices.

## Coding Conventions

### File Naming
- Use **camelCase** for file names.
  - Example: `userProfile.ts`, `dataFetcher.ts`

### Import Style
- Use **relative imports** for referencing other modules.
  - Example:
    ```typescript
    import { fetchData } from './dataFetcher';
    ```

### Export Style
- Use **named exports** rather than default exports.
  - Example:
    ```typescript
    // In dataFetcher.ts
    export function fetchData() { ... }

    // In another file
    import { fetchData } from './dataFetcher';
    ```

### Commit Messages
- Commit messages are **freeform** and do not follow a strict prefix or format.
- Average commit message length: ~39 characters.
  - Example: `fix bug in data fetching logic`

## Workflows

_No automated or documented workflows detected in this repository._

## Testing Patterns

- **Test File Naming:** Test files use the pattern `*.test.*`
  - Example: `userProfile.test.ts`
- **Testing Framework:** Not explicitly detected; check existing test files for clues.
- **Test Example:**
  ```typescript
  // userProfile.test.ts
  import { getUserProfile } from './userProfile';

  describe('getUserProfile', () => {
    it('returns user data for valid id', () => {
      expect(getUserProfile(1)).toEqual({ id: 1, name: 'Alice' });
    });
  });
  ```

## Commands

| Command      | Purpose                                 |
|--------------|-----------------------------------------|
| /test        | Run all test files (`*.test.*`)         |
| /lint        | Lint the codebase (if linter is present)|
| /build       | Build the TypeScript project            |

> _Note: Commands are suggestions based on common TypeScript workflows. Adjust according to your local setup._
```