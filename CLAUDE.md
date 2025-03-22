# BOE Parser Project Guidelines

## Build Commands
- `npm run start` - Start production server
- `npm run dev` - Start development server with hot-reload
- `npm run lint` - Run ESLint on source files
- `npm test` - Run all tests with Vitest
- `npx vitest run path/to/test.js` - Run a single test file

## Code Style Guidelines
- **JavaScript**: ES Modules (type: module in package.json)
- **Imports**: Group external packages first, then internal modules
- **Naming**: camelCase for functions/variables, PascalCase for classes
- **Error Handling**: Structured error responses with proper HTTP status codes
- **Formatting**: Consistent indentation and line length
- **Logging**: Use the structured logger (src/utils/logger.js)
- **API**: RESTful endpoints with proper authentication
- **Architecture**: Modular design with services and utilities separation

## Important Notes
- All requests require API key authentication
- Secrets are managed via Google Cloud Secret Manager
- Follow the PubSub message format in docs/pubsub-structure.md
- Use environment variables for configuration
- Deployed on Google Cloud Run