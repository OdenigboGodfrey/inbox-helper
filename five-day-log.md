Writing

# 3-Day Execution Log: Building The Inbox Helper

**Note:** While the quest timeline requested for 5 days, I compressed and shipped this production grade architecture in an intense 2 day sprint. Maximizing pressure, tightening feedback loops, and forcing rapid iteration.

## Day 1: Schema Design, Raw SQL, and Dropping ORM Crutches

**Core Focus:** Establishing the PostgreSQL database schema (tables, constraints, composite worker indexes) and API batching logic.

Initially started relying on standard TypeORM migration builders. Hit friction with database-specific primitives. Rewrote the migrations to use explicit raw SQL via `queryRunner.query`, gaining total transparency over `gen_random_uuid()` and composite indexing (status, attempts, createdAt).

**What I Unlearned:** Stopped treating ORMs as sacred abstractions. Realized that writing clean raw SQL with an AI partner gives absolute performance control without the bloat.

## Day 2: API Streamlining, Redis Helpers, and Conquering Jest ESM

**Core Focus:** Refactoring the admin reviewMessage transaction, completing Redis caching helpers (`writeToCache`, `readFromCache`, `invalidateCache`), and setting up unit tests.

I encountered a NestJS/Jest ESM module loading conflict (Must use import to load ES Module). Instead of abandoning unit tests or waiting for a framework patch, I worked on re-configuring the `ts-jest` (`useESM: true`, custom `transformIgnorePatterns`) and structured standalone test suites to make concurrency and version-checking tests pass cleanly.

**What I Unlearned:** I can push through build system roadblocks with AI to establish a bulletproof testing foundation under high-pressure constraints.

## Day 3: Load Testing, Idempotency, and Reflection

I introduced k6 load testing to evaluate the inbox API under concurrent HTTP traffic. I configured arrival rate scenarios, performance thresholds, response validation, and custom metrics. Along the way, I addressed Docker migration issues involving an existing database table and missing migration history. I reflected on how AI can support the entire engineering process, from debugging and test design to performance testing, while recognizing that generated solutions still require independent verification.

## Overall Reflection

These three days reinforced that effective AI first engineering is not simply about generating code faster. It requires asking better questions, validating assumptions, testing failure scenarios, and taking responsibility for the reliability and security of what gets shipped.
