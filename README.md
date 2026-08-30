# Table Host

Table Host is a restaurant reservation and floor-management application. This repository contains
the Next.js frontend; the Django API lives in `portfolio_database/tablehost` and is mounted at
`/api/v1/tablehost/`.

## Local development

The frontend defaults to `http://127.0.0.1:8000` for the Django backend in development and
`https://bengarlock.com` in production. Runtime overrides belong in the appropriate 1Password
Environment under `NEXT_PUBLIC_BACKEND_URL`.

```bash
npm install
npm run backend:check:dev
npm run dev
```

The local app is available at `http://127.0.0.1:3000/reservations`. Production builds use the
`/tablehost` base path.
