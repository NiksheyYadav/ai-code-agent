# CodeNex AI - Web UI

This is the Next.js web interface for CodeNex AI, an AI-powered code generation and editing tool.

## Prerequisites

- Node.js 14+ and npm/yarn
- Python 3.8+
- A running instance of the CodeNex AI backend

## Getting Started

1. **Install dependencies**:
   ```bash
   cd ui
   npm install
   # or
   yarn install
   ```

2. **Set up environment variables**:
   Create a `.env.local` file in the `ui` directory with the following content:
   ```
   NEXT_PUBLIC_API_URL=http://localhost:8000
   ```

3. **Start the development server**:
   ```bash
   npm run dev
   # or
   yarn dev
   ```
   The app will be available at http://localhost:3000

## Project Structure

- `/pages` - Next.js pages and API routes
- `/components` - Reusable UI components
- `/styles` - Global styles and Tailwind configuration
- `/public` - Static assets

## Available Scripts

- `npm run dev` - Start the development server
- `npm run build` - Build for production
- `npm start` - Start the production server
- `npm run lint` - Run ESLint

## API Endpoints

The UI communicates with the following API endpoints:

- `POST /api/generate` - Generate new code based on a task
- `POST /api/edit` - Edit existing code based on a task
- `POST /api/fix` - Fix syntax errors in code
- `GET /api/tree` - Get the project file tree
- `GET /api/file` - Get the content of a specific file

## Development

### Adding New Features

1. Create a new branch for your feature:
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. Make your changes and commit them:
   ```bash
   git add .
   git commit -m "Add your feature"
   ```

3. Push to the branch and create a pull request

### Code Style

- Use Prettier for code formatting
- Follow the Airbnb JavaScript Style Guide
- Use functional components with hooks
- Keep components small and focused

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
