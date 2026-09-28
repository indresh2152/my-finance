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

## Minor (also deferred)

- **A legacy-path cookie is never revoked at logout.** A client holding only the pre-change cookie
  (`Path=/api/v1/auth/refresh`) doesn't send it to `/logout`. The browser copy is cleared, but the
  database row stays valid until it expires.
- **PanRegisterPage stays on the form after a 409 `PAN_ALREADY_REGISTERED`.** It shows the error but
  doesn't refresh the user's `hasPan` state.
