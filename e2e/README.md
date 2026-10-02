# End-to-end tests (Playwright)

Real browser (Chromium) against the full Docker stack: sign-up and quick add, trash with Undo,
drag and drop on the board and calendar, password reset through the email in Mailpit,
dark mode and language, push notification settings.

## Run locally

```bash
# From the repo root: start the app with rate limits off (all test traffic comes from one IP)
DISABLE_RATE_LIMITS=true docker compose up -d --build

cd e2e
npm ci
npx playwright install chromium
npm test                      # all tests
npx playwright test drag      # one file
npx playwright test --ui      # interactive runner
npm run report                # HTML report of the last run
```

Point at another server with `E2E_BASE_URL` (default `http://localhost`) and
`E2E_MAILPIT_URL` (default `http://localhost:8025`).

## Notes

- Each test signs up its own user, so tests run in parallel and leave nothing shared behind.
- Push: subscribing needs a real push service, which tests can't reach; the tests cover the
  settings UI with notifications allowed (`push.spec.ts`, full Chromium) and blocked (the
  default headless shell denies them). With no VAPID keys, they check the "not set up" message.
- Don't start the stack with `DISABLE_RATE_LIMITS` anywhere but test runs.
