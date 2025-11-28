# MOOSE Client Frontend

This is the frontend for the MOOSE Data Explorer, a web application for searching, exploring, and managing neuron morphology data from the model database repo (Currently only Neuromorpho is supported). It is built with [Next.js](https://nextjs.org/), [React](https://react.dev/), [Material UI](https://mui.com/), and [Tailwind CSS](https://tailwindcss.com/).

## Features

- Search and filter neurons by species, brain region, and cell type
- Save selected neurons to your local storage
- View and manage stored neuron data
- Visualize local storage usage

## Getting Started

### 1. Install dependencies

```bash
npm install
```

### 2. Run the development server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### 3. Build and start for production

```bash
npm run build
npm start
```

## API Connection

- The frontend expects the backend API to be running at `http://localhost:8000` by default.
- You can override the API URL by setting the `NEXT_PUBLIC_API_URL` environment variable (see `next.config.mjs`).

## Project Structure

- `src/app/page.js` — Main application UI and logic
- `src/app/layout.js` — Global layout and font setup
- `src/app/globals.css` — Global styles (Tailwind + custom CSS)
- `public/` — Static assets

## Customization & Notes

- Uses Material UI for components and theme, with a custom theme toggle
- Uses Tailwind CSS for utility-first styling (referenced in `globals.css` and `postcss.config.mjs`)
- Linting: `npm run lint` (ESLint with Next.js config)

## Development Tips

- Edit the main UI in `src/app/page.js` — changes auto-update in dev mode
- Make sure the backend is running for full functionality

---
