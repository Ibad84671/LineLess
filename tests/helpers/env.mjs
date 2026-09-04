// Test environment variables. This module MUST be imported before any backend
// module so backend/shared/env.js captures the right values at load time
// (ESM import hoisting makes the ordering explicit here).
process.env.TABLE_NAME = 'test-table';
process.env.EVENT_BUS_NAME = 'test-bus'; // events routed to the recorder in setup.mjs
process.env.AWS_REGION = 'us-east-1';
process.env.ALLOWED_ORIGINS = 'http://localhost:5173';
process.env.SENDER_EMAIL = '';
