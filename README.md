# Inbox Helper

A small AI-first inbox assistant that groups candidate messages by intent and drafts short replies for human review.

## Prerequisites

- Node.js 22+
- npm
- Docker and Docker Compose
- An NVIDIA NIM API key and an enabled model
- k6 for load testing

## Run locally

### 1\. Configure the environment

```
cp .env.example .env
```

Edit `.env` and configure your NVIDIA NIM credentials and model. Never commit `.env`.

### 2\. Start PostgreSQL and Redis

```
docker compose up -d
docker compose ps
```

Wait until both services are healthy.

### 3\. Install dependencies

```
npm install
```

Commit `package-lock.json` after resolving and verifying the dependency versions.

### 4\. Build and run

**Using NPM:**

```
npm run build
npm run migration:run
npm run start:dev
```

**Using Docker compose:**

To start:

```
docker compose up
```

To stop:

```
docker compose down --remove-orphans
```

**Env:** https://drive.google.com/file/d/1HNxDNog-MRlwjhjRns50grYPIhVZTvr6/view?usp=sharing

Verify the health endpoint:

```
curl http://localhost:3000/api/health
```

### 5\. Submit candidate messages

```
curl -X POST http://localhost:3000/api/inbox/batch \
  -H 'Content-Type: application/json' \
  -H 'request-Key: demo-batch-001' \
  -d '{
    "messages": [
      {
        "sender": "candidate@example.com",
        "body": "Could we schedule an interview for next week?"
      }
    ]
  }'
```

Read the returned message ID and version. Review the draft, then explicitly approve or reject it using the corresponding API endpoint.

## Tests

```
npm test
npm run test:watch
```

It run the unit tests against a mocked data store.

## Load testing

With the API and dependencies running:

```
k6 run -e BASE_URL=http://localhost:3000 -e AUTH_TOKEN='{AUTH_TOKEN}' -e RATE=5 -e DURATION=10s test-script/load-test.js
```

The example load profile targets five arrivals per second for 10 seconds.

Record the date, commit, dependency lockfile, machine resources, batch size, arrival rate, latency percentiles, error rate, database connection utilization, and NVIDIA NIM throttling for each run.

## Architecture

- `inbox.controller.ts`: HTTP endpoints.
- `inbox.service.ts`: application workflow and state transitions.
- `ai-drafter.service.ts`: Mastra/NVIDIA NIM integration.
- `inbox.entity.ts`: message state and version.
- `batch.entity.ts`: batch idempotency.
- `intent.md`: product intent and risks.
- `final directive.md`: implementation and release constraints.
- `docs/unlearning-note.md`: engineering reflection.

## Known limitations

This is an engineering prototype, not a production ready mail client. It does send email out limited emails.

AI responses may be wrong. Every draft must be reviewed before any future delivery integration is allowed to send it.
