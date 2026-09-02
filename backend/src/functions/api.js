// HTTP API Lambda entrypoint (single router function for all routes).

import { route } from '../routes/router.js';
import { assertEnv, env } from '../shared/env.js';
import { CognitoIdentityProviderClient, AdminCreateUserCommand } from '@aws-sdk/client-cognito-identity-provider';

let cognito = null;

/** Creates a Cognito user for an invited staff member (email = username,
 * generated temporary password delivered by Cognito's invitation email). */
async function cognitoAdmin(email) {
  if (!cognito) cognito = new CognitoIdentityProviderClient({ region: env.region });
  const res = await cognito.send(new AdminCreateUserCommand({
    UserPoolId: env.userPoolId,
    Username: email,
    UserAttributes: [
      { Name: 'email', Value: email },
      { Name: 'email_verified', Value: 'true' },
    ],
    DesiredDeliveryMediums: ['EMAIL'],
    ForceAliasCreation: false,
  }));
  return { sub: res.User?.Attributes?.find((a) => a.Name === 'sub')?.Value };
}

export async function handler(event) {
  assertEnv(['tableName', 'eventBusName']);
  return route(event, {
    cognitoAdmin: env.userPoolId ? cognitoAdmin : undefined,
    publicUrl: process.env.PUBLIC_URL || '',
  });
}
