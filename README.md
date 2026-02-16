# Business Walrus

Monorepo for the Business Walrus party game prototype.

## Getting started

1. Install dependencies from the repo root:

```
npm install
```

2. Start both frontend and backend in dev mode:

```
npm run dev
```

- Frontend: http://localhost:5173
- Backend: http://localhost:3001/api/health

## Scripts

- `npm run dev` - run web + api together
- `npm run build` - build both apps
- `npm run start:api` - run the backend build

## Notes

The frontend uses a Vite dev proxy so `/api/*` calls reach the Fastify server during development.
