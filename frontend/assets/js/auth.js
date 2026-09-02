// Cognito authentication for staff/business users (browser-side, using the
// Cognito Identity Provider HTTP API directly — no SDK, no secrets).
// Passwords never touch LineLess servers; tokens live in localStorage
// (documented limitation; a hosted-UI + httpOnly-cookie flow is the
// hardening roadmap).

const config = window.LINELESS_CONFIG ?? {};

const STORAGE_KEY = 'lineless.auth';

function cognitoEndpoint(target) {
  const { region, cognito } = config;
  return {
    url: `https://cognito-idp.${region}.amazonaws.com/`,
    headers: {
      'Content-Type': 'application/x-amz-json-1.1',
      'X-Amz-Target': `AWSCognitoIdentityProviderService.${target}`,
    },
  };
}

async function cognitoCall(target, payload) {
  const { url, headers } = cognitoEndpoint(target);
  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok) {
    const err = new Error(data.message ?? 'Authentication failed');
    err.code = data.__type?.split('#').pop();
    throw err;
  }
  return data;
}

function readSession() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const session = JSON.parse(raw);
    return session?.accessToken ? session : null;
  } catch {
    return null;
  }
}

function writeSession(result) {
  // AuthenticationResult absent for challenges (NEW_PASSWORD_REQUIRED etc.)
  if (!result?.AuthenticationResult) {
    return { challenge: result?.ChallengeName ?? 'UNKNOWN_CHALLENGE', session: result?.Session };
  }
  const s = result.AuthenticationResult;
  const session = {
    accessToken: s.AccessToken,
    idToken: s.IdToken,
    refreshToken: s.RefreshToken,
    expiresAt: Date.now() + (s.ExpiresIn ?? 3600) * 1000,
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  return { session };
}

export const auth = {
  getAccessToken() {
    const s = readSession();
    if (!s) return null;
    if (s.expiresAt - 60000 < Date.now()) return null; // expired; refresh flow handles it
    return s.accessToken;
  },

  getSession: readSession,

  isAuthenticated() {
    return readSession() !== null;
  },

  async signUp(email, password, name) {
    return cognitoCall('SignUp', {
      ClientId: config.cognito.clientId,
      Username: email,
      Password: password,
      UserAttributes: [
        { Name: 'email', Value: email },
        ...(name ? [{ Name: 'name', Value: name }] : []),
      ],
    });
  },

  async confirmSignUp(email, code) {
    return cognitoCall('ConfirmSignUp', {
      ClientId: config.cognito.clientId,
      Username: email,
      ConfirmationCode: code,
    });
  },

  async resendCode(email) {
    return cognitoCall('ResendConfirmationCode', {
      ClientId: config.cognito.clientId,
      Username: email,
    });
  },

  async signIn(email, password) {
    const result = await cognitoCall('InitiateAuth', {
      ClientId: config.cognito.clientId,
      AuthFlow: 'USER_PASSWORD_AUTH',
      AuthParameters: { USERNAME: email, PASSWORD: password },
    });
    return writeSession(result);
  },

  async respondToNewPassword(email, session, newPassword) {
    const result = await cognitoCall('RespondToAuthChallenge', {
      ClientId: config.cognito.clientId,
      ChallengeName: 'NEW_PASSWORD_REQUIRED',
      Session: session,
      ChallengeResponses: { USERNAME: email, NEW_PASSWORD: newPassword },
    });
    return writeSession(result);
  },

  async forgotPassword(email) {
    return cognitoCall('ForgotPassword', {
      ClientId: config.cognito.clientId,
      Username: email,
    });
  },

  async confirmForgotPassword(email, code, newPassword) {
    return cognitoCall('ConfirmForgotPassword', {
      ClientId: config.cognito.clientId,
      Username: email,
      ConfirmationCode: code,
      Password: newPassword,
    });
  },

  async refreshSession() {
    const s = readSession();
    if (!s?.refreshToken) return false;
    try {
      const result = await cognitoCall('InitiateAuth', {
        ClientId: config.cognito.clientId,
        AuthFlow: 'REFRESH_TOKEN_AUTH',
        AuthParameters: { REFRESH_TOKEN: s.refreshToken },
      });
      const written = writeSession(result);
      return Boolean(written.session);
    } catch {
      this.signOut();
      return false;
    }
  },

  signOut() {
    localStorage.removeItem(STORAGE_KEY);
  },
};
