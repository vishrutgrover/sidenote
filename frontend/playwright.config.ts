import { defineConfig } from "@playwright/test";

// Starts the real backend (fresh database) and the production build of the frontend on spare ports,
// so these tests never touch a dev server or dev data.
const API = "http://localhost:8100";
const WEB = "http://localhost:3100";

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 30_000,
  workers: 1, // tests share one database, so they run one after another
  use: { baseURL: WEB, trace: "retain-on-failure" },
  webServer: [
    {
      command: `rm -f e2e.db && DATABASE_URL=sqlite:///./e2e.db CORS_ORIGINS=${WEB} ../backend/.venv/bin/uvicorn app.main:app --port 8100`,
      cwd: "../backend",
      url: `${API}/api/health`,
    },
    {
      command: `NEXT_PUBLIC_API_URL=${API} npm run build && NEXT_PUBLIC_API_URL=${API} npx next start -p 3100`,
      url: WEB,
      timeout: 240_000,
    },
  ],
});
