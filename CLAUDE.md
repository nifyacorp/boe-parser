# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## BOE Parser Project Guidelines

## Build Commands
- `npm run start` - Start production server
- `npm run dev` - Start development server with hot-reload
- `npm run lint` - Run ESLint on source files
- `npm test` - Run all tests with Vitest
- `npx vitest run path/to/test.js` - Run a specific test file

## Code Style Guidelines
- **Architecture**: Layered architecture with config/, controllers/, middleware/, routes/, services/, and utils/
- **JavaScript**: ES Modules (type: module in package.json)
- **Imports**: Group external packages first, then internal modules by layer
- **Naming**: camelCase for variables/functions, PascalCase for classes
- **Error Handling**: Use AppError class hierarchy from utils/errors with standardized HTTP status codes
- **Formatting**: 2-space indentation, line length under 100 characters
- **Logging**: Use structured logger (utils/logger.js) with context object followed by message string
- **API Routes**: Organized in routes/ with controller logic in controllers/
- **Services**: Domain-driven organization (ai/, parser/) with client/implementation separation
- **PubSub**: Follow message schema in docs/pubsub-structure.md

## Important Notes
- API key validation via Bearer token authentication
- Secrets managed via config/config.js with Secret Manager integration
- Request IDs propagated for traceability
- Configuration validation on startup