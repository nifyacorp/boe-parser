# BOE Parser Project Guidelines

## Build Commands
- `npm run start` - Start production server
- `npm run dev` - Start development server with hot-reload
- `npm run lint` - Run ESLint on source files
- `npm test` - Run all tests with Vitest
- `npx vitest run path/to/test.js` - Run a specific test file

## Code Style Guidelines
- **Architecture**: Service-oriented with clear separation between API endpoints, services, and utilities
- **JavaScript**: ES Modules (type: module in package.json)
- **Imports**: Group external packages first, then internal modules
- **Naming**: camelCase for variables/functions, PascalCase for classes
- **Error Handling**: Use structured error responses with standard HTTP status codes, propagate to PubSub for monitoring
- **Formatting**: 2-space indentation, consistent line length
- **Logging**: Use structured logger (src/utils/logger.js) with context first, message second
- **API**: RESTful endpoints with Bearer token authentication
- **PubSub**: Follow message schema in docs/pubsub-structure.md

## Important Notes
- Cloud-based deployment on Google Cloud Run
- Secrets managed via Google Cloud Secret Manager
- Request IDs used for traceability throughout the system
- Environmental variables for configuration