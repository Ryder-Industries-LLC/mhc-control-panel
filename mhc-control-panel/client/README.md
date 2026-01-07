# MHC Control Panel - Frontend

React TypeScript frontend for the MHC Control Panel.

## Features

- **Lookup Page**: Search for users by username or paste text to extract usernames
- **Hudson Dashboard**: Real-time dashboard for Hudson Cage with:
  - Live session tracking
  - Chaturbate account stats with deltas
  - Recent sessions history
  - Recent activity feed
  - Auto-refresh every 30 seconds

## Development

### Prerequisites

- Node.js 18+
- npm or yarn

### Installation

```bash
npm install
```

### Configuration

Create a `.env` file in the client directory:

```env
REACT_APP_API_URL=http://localhost:3000
```

For production, set this to your deployed backend URL:

```env
REACT_APP_API_URL=https://your-backend.onrender.com
```

### Running Locally

```bash
npm start
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### Building for Production

```bash
npm run build
```

This creates an optimized production build in the `build/` directory.

## Deployment

### Deploy to Render

1. Create a new **Static Site** on Render
2. Connect your GitHub repository
3. Configure build settings:
   - **Build Command**: `cd client && npm install && npm run build`
   - **Publish Directory**: `client/build`
4. Add environment variable:
   - `REACT_APP_API_URL`: Your backend URL (e.g., `https://mhc-control-panel.onrender.com`)
5. Deploy!

### Deploy to Vercel

```bash
cd client
npx vercel
```

Set environment variable in Vercel dashboard:
- `REACT_APP_API_URL`: Your backend URL

## Project Structure

```
client/
├── public/          # Static files
├── src/
│   ├── api/         # API client and TypeScript interfaces
│   ├── pages/       # Page components
│   │   ├── Home.tsx      # User lookup page
│   │   └── Hudson.tsx    # Hudson dashboard
│   ├── App.tsx      # Main app component with routing
│   ├── App.css      # Global styles
│   └── index.tsx    # App entry point
├── .env             # Environment variables (gitignored)
├── .env.example     # Example environment variables
└── package.json
```

## Technology Stack

- **React 18** - UI library
- **TypeScript** - Type safety
- **React Router** - Client-side routing
- **Axios** - HTTP client
- **CSS3** - Styling with dark theme

---

This project was bootstrapped with [Create React App](https://github.com/facebook/create-react-app).
