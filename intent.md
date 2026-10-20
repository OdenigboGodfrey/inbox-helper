Writing

# Intent — Inbox Helper

## Problem

People receive messages that require similar actions: scheduling, answering questions, providing information, handling complaints, and following up. Repeatedly reading and drafting replies consumes attention.

The goal is to build a small AI-first tool that groups incoming messages by intent and proposes concise replies while keeping a human responsible for every final decision.

## User

A recruiter, hiring manager, or small team reviewing candidate correspondence.

## Core workflow

1. Submit a batch of candidate messages.
2. Generate an intent label and a short proposed reply for each message.
3. Review the drafts and their source messages.
4. Explicitly approve or reject each draft.
5. Retry failed drafts without silently resending or duplicating work.

## Success criteria

- Every persisted draft can be traced to its source message.
- No draft is automatically approved or sent.
- Repeated submissions with the same idempotency key and payload do not create duplicate batches.
- Reusing a key with a different payload produces a conflict.
- Simultaneous reviews cannot overwrite each other.
- Invalid model output never becomes an approved draft.
- AI and cache failures remain observable and recoverable.
- Automated tests cover state transitions, retries, idempotency, and concurrent review.

## Non-goals

- Autonomous email sending.
- Long-term memory of candidates.

## Product principle

AI proposes; deterministic application logic enforces; a human decides. The model is not trusted to enforce business rules or authorize external actions.

## Initial risk register

- Hallucinated commitments or dates in replies.
- Prompt injection inside candidate messages.
- Duplicate requests under concurrency.
- Stale drafts shown from cache.
- Provider throttling and malformed output.
- Sensitive candidate data in prompts, logs, or cache entries.

Mitigations include constrained output validation, short drafts, explicit review, database constraints, bounded processing, cache invalidation, and data minimization.
