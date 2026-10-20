# Final Directive — Inbox Helper

Build the smallest reliable AI-assisted inbox workflow that demonstrates deliberate engineering trade-offs.

## Architecture

- NestJS and TypeScript provide the HTTP API and application boundaries.
- PostgreSQL is the authoritative store.
- TypeORM manages persistence and migrations.
- Redis is an optional performance layer, never the sole source of correctness.
- Mastra AI orchestrates the drafting agent.
- NVIDIA NIM provides the configured inference endpoint.
- AI output must never trigger an email send (the only current source of notification).
- Only a human-authorized endpoint can approve a draft.
- Every state transition must be validated by application logic and guarded by a conditional database write.
- Idempotency must be enforced in PostgreSQL, with payload consistency checks.
- External model calls must not occur inside long-running database transactions.
- Invalid model output must be rejected rather than repaired silently into trusted content.
- Failures must be visible through structured, redacted logs and metrics.
- Redis outages must not compromise database correctness.
- No performance claim is valid without a reproducible load-test result.
- No test is considered passing until it has actually been executed.

## Delivery sequence

1. Establish the API contract and state machine.
2. Implement persistence, validation, and idempotency.
3. Test unit behavior, PostgreSQL concurrency, and load.
4. Record defects, measurements, and deferred work honestly.
