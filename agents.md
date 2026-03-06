# Apify CLI - AI Agent Instructions

This file contains instructions for AI agents working on the Apify CLI project to understand the codebase structure, conventions, and best practices.

## Project Overview

The Apify CLI is a command-line interface that helps developers create, develop, build, and run Apify Actors, and manage their Actors on the Apify cloud platform. It's built with TypeScript and uses a modular command framework.

## Command Development Guidelines

When creating new CLI commands, follow these guidelines:

### Command Structure

- **Base Class**: All commands must extend `ApifyCommand` from `src/lib/command-framework/apify-command.ts`
  - Import: `import { ApifyCommand } from '../lib/command-framework/apify-command.js'`
  - Do NOT use `BuiltApifyCommand` class

- **Arguments**: Import from `src/lib/command-framework/args.ts`
  - Import: `import { Args } from '../lib/command-framework/args.js'`
  - Usage example: `Args.string()`

- **Flags**: Import from `src/lib/command-framework/flags.ts`
  - Import: `import { Flags } from '../lib/command-framework/flags.js'`
  - Usage example: `Flags.string()`

### Naming Conventions

- Command names must be lowercase
- Use dashes for separators (NOT spaces, NOT underscores)
- Example: `my-command`, `validate-schema`, `push-data`

### Command Class Template

```typescript
export class MyCommandCommand extends ApifyCommand<typeof MyCommandCommand> {
  static override name = "my-command" as const;

  static override description = "Description of what this command does";

  static override args = {
    // Define arguments here using Args.*
  };

  static override flags = {
    // Define flags here using Flags.*
  };

  async run() {
    // Command logic implementation
  }
}
```

### Command Registration

After creating a command:

1. **For general Apify commands**: Add to the end of the `apifyCommands` array in `src/commands/_register.ts`
2. **For Actor-specific commands**: Add to the `actorCommands` array in `src/commands/_register.ts`

### Reference Examples

Study these existing commands for patterns and best practices:

- `src/commands/validate-schema.ts` - Simple command with validation
- `src/commands/cli-management/upgrade.ts` - Command with flags and external API calls
- `src/commands/_register.ts` - Command registration patterns

### File Organization

- Commands are organized in `src/commands/` directory
- Group related commands in subdirectories (e.g., `cli-management/`, `actor-management/`)
- Use descriptive filenames that match the command name

## Code Style and Conventions

### TypeScript Guidelines

- Always mark class properties as `static override` when extending base classes
- Use proper type annotations and generics
- Follow the existing import patterns and module structure

### Error Handling

- Use appropriate exit error codes from `src/lib/consts.ts`
- Provide helpful error messages to users
- Handle edge cases gracefully

### Configuration

- Actor configuration uses `.actor/actor.json` (new format)
- Reference constants from `src/lib/consts.ts` for file paths and configurations

## Testing

- Write tests for new commands following existing patterns in the `test/` directory
- Use the testing utilities and setup from the project
- Test both success and error scenarios

## Development Workflow

1. Install dependencies: `yarn install`
2. Lint code: `yarn lint` or `yarn lint:fix`
3. Format code: `yarn format` or `yarn format:fix`
4. Build project: `yarn build`
5. Run tests: `yarn test:local`

## Important Notes

- Always prompt users for required information if not provided
- Follow the established patterns for command structure and organization
- When in doubt about command type (apify vs actor), ask for clarification
- Maintain backward compatibility when possible
- Do NOT override the documentation when adding new commands, as it is automatically generated
