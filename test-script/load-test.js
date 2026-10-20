
import http from 'k6/http';
import { check } from 'k6';
import { Counter, Rate, Trend } from 'k6/metrics';

const BASE_URL = (__ENV.BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
const TOKEN = __ENV.AUTH_TOKEN;

const batchDuration = new Trend('inbox_batch_duration');
const batchSuccess = new Rate('inbox_batch_success');
const invalidResponses = new Counter('inbox_invalid_responses');

export const options = {
  scenarios: {
    inbox_burst: {
      executor: 'constant-arrival-rate',
      rate: Number(__ENV.RATE || 5),
      timeUnit: '1s',
      duration: __ENV.DURATION || '60s',
      preAllocatedVUs: Number(__ENV.PREALLOCATED_VUS || 10),
      maxVUs: Number(__ENV.MAX_VUS || 40),
    },
  },

  thresholds: {
    http_req_failed: ['rate<0.05'],
    http_req_duration: ['p(95)<30000'],
    inbox_batch_success: ['rate>0.95'],
    inbox_batch_duration: ['p(95)<30000'],
  },
};

export function setup() {
  if (!TOKEN) {
    throw new Error(
      'AUTH_TOKEN is required. Provide a valid candidate JWT using -e AUTH_TOKEN=...',
    );
  }
}

export default function () {
  // Each iteration creates an independent batch.
  const key = `load-${__VU}-${__ITER}`;

  const payload = JSON.stringify({
    key,
    messages: [
      {
        sender: 'load-test@example.com',
        body: 'Can we schedule a short call to discuss my application?',
      },
    ],
  });

  const response = http.post(`${BASE_URL}/api/inbox/messages/batch`, payload, {
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${TOKEN}`,
      'request-Key': key,
    },
    timeout: '45s',
    tags: { endpoint: 'create_inbox_batch' },
  });

  batchDuration.add(response.timings.duration);

  let body;
  let validResponse = false;

  try {
    body = response.json();
    validResponse =
      body !== null &&
      typeof body === 'object' &&
      typeof body.batchId === 'string' &&
      body.batchId.length > 0 &&
      Array.isArray(body.messages) &&
      body.messages.length === 1;
  } catch {
    validResponse = false;
  }

  const successful = check(response, {
    'batch creation returns 200 or 201': (r) =>
      r.status === 200 || r.status === 201,
    'response contains a batch ID and one message': () => validResponse,
  });

  batchSuccess.add(successful);

  if (!validResponse) {
    invalidResponses.add(1);
  }
}
