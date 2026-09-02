// Runtime configuration template.
// scripts/build.js overwrites frontend/config.js with the real deployed
// values from CloudFormation outputs — never hardcode them in source.
// For local development, scripts/dev-server.js serves this file as /config.js.

window.LINELESS_CONFIG = {
  apiBaseUrl: 'http://localhost:8787',
  wsBaseUrl: 'ws://localhost:8787',
  region: 'us-east-1',
  cognito: {
    userPoolId: 'dev-local',
    clientId: 'dev-local',
  },
};
