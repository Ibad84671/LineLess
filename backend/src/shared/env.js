// Centralized environment access for Lambda functions.
// Every function reads configuration only from here — no scattered process.env.

const list = (v) => (v || '').split(',').map((s) => s.trim()).filter(Boolean);

export const env = {
  region: process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || 'us-east-1',
  tableName: process.env.TABLE_NAME || '',
  eventBusName: process.env.EVENT_BUS_NAME || '',
  allowedOrigins: list(process.env.ALLOWED_ORIGINS),
  userPoolId: process.env.USER_POOL_ID || '',
  cognitoIssuer: process.env.COGNITO_ISSUER || '',
  appClientId: process.env.APP_CLIENT_ID || '',
  senderEmail: process.env.SENDER_EMAIL || '',
  smsTopicArn: process.env.SMS_TOPIC_ARN || '',
  docsBucket: process.env.DOCS_BUCKET || '',
  stage: process.env.ENVIRONMENT || 'dev',
};

export function assertEnv(required = ['tableName']) {
  const missing = required.filter((k) => !env[k]);
  if (missing.length > 0) {
    throw new Error(`Missing required environment: ${missing.join(', ')}`);
  }
}
