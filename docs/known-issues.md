# Known issues — deferred fixes

Found by the adversarial review on 2026-09-26. Each item has been accepted for now and is to be fixed later.
When you fix one, delete its entry.

## 1. Concurrent refreshes can log a user out of every session

- **Where:** `AuthService.refresh` in `apps/api/src/services/auth.service.ts`
- **Problem:** token rotation is check-then-act. The code SELECTs `revoked_at`, then UPDATEs it without
  `AND revoked_at IS NULL ... RETURNING`.
- **Failure:** two refreshes with the same cookie can arrive together, for example from two tabs, or from
  React StrictMode running `restoreSession` twice in development. Then either:
  - both succeed, so one replay goes undetected, or
  - the second trips reuse detection and revokes every session for that user.
- **Client mitigation (2026-09-29):** the web app no longer sends concurrent refreshes. Refresh, login
  and logout run one at a time under a Web Lock shared by all tabs (`withAuthLock` in
  `apps/web/src/services/api.ts`), and concurrent callers in a tab share one request. The server-side
  race remains for any other client.
- **Fix direction:**
  - Make revocation atomic: `UPDATE ... WHERE token_hash = $1 AND revoked_at IS NULL RETURNING id`.
  - Add a short grace window where the just-rotated token returns the same successor instead of
    counting as reuse. This is a design choice.

## 2. PAN registration can be enumerated

- **Where:** `PanService.register` / `findConflict` in `apps/api/src/services/pan.service.ts`
- **Problem:** `PAN_LINKED_TO_ANOTHER_ACCOUNT` is returned *before* Setu verification. Any signed-in user
  without a PAN can therefore test whether an arbitrary PAN is registered in the app, and it costs them
  nothing.
- **Current limit:** the only limit is `panRateLimiter`: 3 attempts per 24 hours per IP.
- **Why it matters:** this is a DPDP privacy concern.
- **Trade-off:**
  - Checking the PAN hash only *after* verification means every attempt costs a billed Setu call.
  - Alternatively, return a generic 409 that doesn't say whose account has the PAN.
  - Or add a per-user limit on PAN attempts on top of the IP limit.

## 3. Double-submitting "Link PAN" bills Setu twice

- **Where:** `PanService.register`
- **Problem:** the conflict pre-check is time-of-check/time-of-use. Concurrent requests all pass it and
  each one calls the billed verifier. The unique indexes reject all but one INSERT.
- **Failure:** the user whose link actually succeeded receives a 409 from the losing request.
- **Fix direction:** serialize per user, with `pg_advisory_xact_lock` keyed on the user id, around check
  → verify → insert. Or insert a pending row before verifying.

## 4. Concurrent sign-ups with the same username or email return 500

- **Where:** `AuthService.register` in `apps/api/src/services/auth.service.ts`
- **Problem:** the SELECTs for username and email run before the INSERT, and a 23505 from the INSERT is
  not handled.
- **Failure:** the losing request returns a 500 instead of `USERNAME_TAKEN` / `EMAIL_TAKEN`.
- **Note:** pg's error `detail` is now redacted in the error logs, so the email no longer leaks there.
- **Fix direction:** catch `isUniqueViolation` from `apps/api/src/utils/db.utils.ts` around the INSERT.
  Then re-query to find which field conflicts, the same way `PanService.findConflict` does.

## 5. Nothing automatically type-checks the web app

- **Where:** `.husky/pre-commit`
- **Problem:** builds were deliberately removed from the hook. Because of that, web type errors are
  caught only by the manual build step in the pre-completion review:
  - Vitest strips types without checking them.
  - There is no CI pipeline.
- **Fix direction:**
  - Add `npx tsc --noEmit -p apps/web`, a type check rather than a build, to the hook.
  - Or set up CI that runs both builds.

## 6. A mailbox sync can outlive its pg-boss job

- **Where:** the `mail-sync-mailbox` queue in `apps/api/src/jobs/mail-sync.jobs.ts`
  (`expireInSeconds` = 30 minutes) and `MailSyncService.syncMailbox`.
- **Problem:** pg-boss expires the job after 30 minutes, but it cannot cancel the running handler.
  `syncMailbox` keeps scanning while pg-boss treats the job as failed and may start a retry.
- **Failure:** two runs for the same mailbox can overlap. The upserts are idempotent, so no data is
  wrong. The only cost is duplicate provider calls and database work, and the run that finishes
  last sets `last_synced_at`.
- **More likely since 2026-10-06:** the lookback grew from 180 to 365 days (for the card page's
  12-month history), so a full scan reads about twice as much mail. Every existing mailbox does one
  full scan on its next sync, because the lookback is part of the search-filter hash.
- **Fix direction:**
  - Pass an `AbortSignal` into `syncMailbox` and stop between messages once the job deadline passes.
  - Or cap the messages per run so a run always finishes well inside the expiry.

## 7. With more than one replica, a stately promotion conflict can stall a replica's queue

- **Where:** the `stately` policy on the `mail-sync-mailbox` queue, with the pg-boss worker running
  in-process in every API replica.
- **Problem:** a stately queue allows one queued and one active job per `singletonKey`. With N > 1
  replicas, one replica can try to promote the queued job for a mailbox while another replica still
  holds the active one. pg-boss rejects the promotion with a unique-constraint conflict.
- **Failure:** that replica's fetch for the queue keeps failing, so its worker makes no progress on
  that queue until the active job for the mailbox finishes. Other mailboxes queued behind it wait
  too. With a single replica this cannot happen.
- **Fix direction:**
  - Run the mailbox worker in one dedicated replica (or a separate worker deployment).
  - Or move to the `singleton` policy / a per-mailbox advisory lock inside `syncMailbox`.

## 8. Login, register and refresh audit entries have no user

- **Where:** `auditMiddleware` in `apps/api/src/middleware/audit.middleware.ts`, and the auth routes.
- **Problem:** the audit row takes its user from `req.user`, which only exists after `requireAuth`. These
  three routes run without it, so `USER_LOGIN`, `USER_REGISTER` and `TOKEN_REFRESH` are written with
  `user_id` null. Logout was fixed on 2026-09-29 via `setAuditUserId`.
- **Why it matters:** SOC 2 / CERT-In expect audit entries to name the actor.
- **Fix direction:** call `setAuditUserId(res, user.id)` in the login and register handlers, and make
  `AuthService.refresh` return the user id so the refresh handler can do the same.

## 9. Audit rows are never written for routes inside a mounted router

- **Where:** `auditMiddleware` in `apps/api/src/middleware/audit.middleware.ts`.
- **Problem:** the route key is built as `/api/v1` + `req.route.path`. Inside a router mounted at
  `/api/v1/credit-cards`, `req.route.path` is only the router-relative path (`/` or
  `/:cardId/statements`). So the key never matches `ROUTE_ACTION_MAP`, and nothing is written. Found
  on 2026-10-06 with a supertest probe: `GET /api/v1/credit-cards` writes no `CARD_LIST` row. The
  unit tests fake `req.route.path` as the full path, so they pass.
- **Why it matters:** card list and card statement views (`CARD_LIST`, `CARD_VIEW`) go unaudited.
  SOC 2 / CERT-In expect access to financial data to be logged.
- **Fix direction:** build the key from `req.baseUrl + req.route.path` with the trailing `/` trimmed.
  Add a supertest through `createApp` that asserts the INSERT. The route tests' `db.query` mocks then
  need a default resolved value, because the audit INSERT calls `.catch` on the result.

## 10. A bank whose emails stop parsing makes its cards look inactive

- **Where:** `deriveCardStatus` in `apps/api/src/services/card-status.ts`, together with mail sync in
  `apps/api/src/services/mailbox/mail-sync.service.ts`.
- **Problem:** a card is `INACTIVE` when its latest statement is more than 70 days older than its
  mailbox's last successful sync. A sync counts as successful even when every statement email it
  finds is skipped (no parser, or required fields missing). If a bank changes its email layout,
  `last_synced_at` keeps moving forward and no new statements are stored.
- **Why it matters:** 70 days later, cards from that bank show as "Inactive" even though they are
  still in use and still getting statements.
- **Fix direction:** have the sync record, per mailbox and bank, the newest statement email it saw
  even when it could not parse it. Measure inactivity against that rather than `last_synced_at`.

## Minor (also deferred)

- **`apiErrorCode` exists twice.** It is exported from both `apps/web/src/services/api.ts` and
  `apps/web/src/services/mailbox.api.ts`, and `PanRegisterPage.tsx` extracts the code inline. Make
  `mailbox.api.ts` re-export the `api.ts` version, and use it in `PanRegisterPage`.

- **A legacy-path cookie is never revoked at logout.** A client holding only the pre-change cookie
  (`Path=/api/v1/auth/refresh`) doesn't send it to `/logout`. The browser copy is cleared, but the
  database row stays valid until it expires.
- **PanRegisterPage stays on the form after a 409 `PAN_ALREADY_REGISTERED`.** It shows the error but
  doesn't refresh the user's `hasPan` state.
- **A card found first by name can show up twice once its digits appear.** An email that names a card
  without its last 4 digits makes a name-only card; a later email for the same card that shows the
  digits makes a second card, because name-only and digit cards are matched separately (see
  `RecordUpsertService` in `apps/api/src/services/mailbox/record-upsert.service.ts`).
