// Staff/business sign-in view: sign in, first-use password change, reset.
// Backed by Cognito; LineLess servers never see passwords.

import { h, toast } from '../dom.js';
import { auth } from '../auth.js';
import { navigate } from '../router.js';

function formCard(title, sub, ...children) {
  return h('div', { class: 'page page--narrow' },
    h('div', { class: 'card form-card auth-card' },
      h('h1', {}, title),
      sub ? h('p', { class: 'muted' }, sub) : null,
      ...children,
    ),
  );
}

export function LoginPage(app) {
  if (auth.isAuthenticated()) {
    navigate('/dashboard');
    return null;
  }
  let challengeContext = null;

  const emailInput = h('input', { id: 'email', type: 'email', required: true, autocomplete: 'username', placeholder: 'you@business.com' });
  const passInput = h('input', { id: 'password', type: 'password', required: true, autocomplete: 'current-password' });
  const submit = h('button', { class: 'btn btn--primary btn--lg btn--block', type: 'submit' }, 'Sign in');

  function renderLogin() {
    app.replaceChildren(
      formCard('Business sign in', 'Manage queues, staff and analytics.',
        h('form', {
          onsubmit: async (e) => {
            e.preventDefault();
            submit.disabled = true;
            submit.textContent = 'Signing in…';
            try {
              const result = await auth.signIn(emailInput.value.trim(), passInput.value);
              if (result.challenge === 'NEW_PASSWORD_REQUIRED') {
                challengeContext = result.session;
                showNewPassword(emailInput.value.trim());
                return;
              }
              const returnTo = sessionStorage.getItem('lineless.returnTo') || '/dashboard';
              sessionStorage.removeItem('lineless.returnTo');
              navigate(returnTo);
            } catch (err) {
              submit.disabled = false;
              submit.textContent = 'Sign in';
              toast(err.message ?? 'Sign in failed', 'error');
            }
          },
        },
          h('div', { class: 'field' }, h('label', { for: 'email' }, 'Email'), emailInput),
          h('div', { class: 'field' }, h('label', { for: 'password' }, 'Password'), passInput),
          submit,
        ),
        h('div', { class: 'auth-links' },
          h('a', { href: '#', onclick: (e) => { e.preventDefault(); showForgot(); } }, 'Forgot password?'),
          h('a', { href: '/signup', 'data-link': true }, 'Create a business account'),
        ),
      ),
    );
  }

  function showNewPassword(email) {
    const np = h('input', { id: 'np', type: 'password', required: true, autocomplete: 'new-password', minlength: '8' });
    app.replaceChildren(
      formCard('Set a new password', 'Your account requires a new password on first sign-in.',
        h('form', {
          onsubmit: async (e) => {
            e.preventDefault();
            try {
              await auth.respondToNewPassword(email, challengeContext, np.value);
              navigate('/dashboard');
            } catch (err) {
              toast(err.message ?? 'Could not set password', 'error');
            }
          },
        },
          h('div', { class: 'field' }, h('label', { for: 'np' }, 'New password (min 8 chars)'), np),
          h('button', { class: 'btn btn--primary btn--lg btn--block', type: 'submit' }, 'Save & continue'),
        ),
      ),
    );
  }

  function showForgot() {
    const fe = h('input', { id: 'fe', type: 'email', required: true, autocomplete: 'username' });
    const fc = h('input', { id: 'fc', type: 'text', required: false, inputmode: 'numeric', placeholder: '6-digit code' });
    const fp = h('input', { id: 'fp', type: 'password', required: false, autocomplete: 'new-password', minlength: '8' });
    const fcField = h('div', { class: 'field', hidden: true }, h('label', { for: 'fc' }, 'Code'), fc);
    const fpField = h('div', { class: 'field', hidden: true }, h('label', { for: 'fp' }, 'New password'), fp);
    const btn = h('button', { class: 'btn btn--primary btn--lg btn--block', type: 'submit' }, 'Send code');
    let step = 0;

    app.replaceChildren(
      formCard('Reset password', 'We will email you a verification code.',
        h('form', {
          onsubmit: async (e) => {
            e.preventDefault();
            try {
              if (step === 0) {
                await auth.forgotPassword(fe.value.trim());
                step = 1;
                fcField.hidden = false;
                fpField.hidden = false;
                fc.required = true;
                fp.required = true;
                btn.textContent = 'Set new password';
                toast('Check your email for the code.', 'info');
              } else {
                await auth.confirmForgotPassword(fe.value.trim(), fc.value.trim(), fp.value);
                toast('Password updated. Sign in now.', 'success');
                renderLogin();
              }
            } catch (err) {
              toast(err.message ?? 'Reset failed', 'error');
            }
          },
        },
          h('div', { class: 'field' }, h('label', { for: 'fe' }, 'Email'), fe),
          fcField,
          fpField,
          btn,
        ),
      ),
    );
  }

  renderLogin();
  return null;
}

export { formCard };
