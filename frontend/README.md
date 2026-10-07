# Sidenote frontend

Next.js (App Router) + TypeScript. Plain CSS with variables, no UI library.

```
app/         pages and layouts      components/  UI pieces        lib/  api client, types, helpers
tests/unit   Vitest                 tests/e2e    Playwright
```

`npm run dev` · `npm test` · `npm run test:e2e` · set `NEXT_PUBLIC_API_URL` to point at the backend (default `http://localhost:8000`).
