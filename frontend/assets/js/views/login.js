// Staff/business sign-in view: sign in, first-use password change, reset.
// Backed by Cognito; LineLess servers never see passwords.

import { h, toast } from '../dom.js';
import { auth } from '../auth.js';
import { navigate } from '../router.js';
import { icon } from '../icons.js';
import {
  passwordRuleChecks,
  passwordMeetsPolicy,
  passwordStrength,
  confirmMatches,
  describeCognitoError,
} from '../password-policy.js';

function formCard(title, sub, ...children) {
  return h('div', { class: 'page page--narrow' },
    h('div', { class: 'card form-card auth-card' },
      h('h1', {}, title),
      sub ? h('p', { class: 'muted' }, sub) : null,
      ...children,
    ),
  );
}

/**
 * Password input with an accessible show/hide toggle.
 * @returns {{input: HTMLInputElement, field: HTMLDivElement}}
 */
function passwordField(id, label, { autocomplete, minlength, placeholder } = {}) {
  const input = h('input', {
    id, type: 'password', required: true, placeholder,
    ...(autocomplete ? { autocomplete } : {}),
    ...(minlength ? { minlength: String(minlength) } : {}),
  });
  const toggle = h('button', {
    class: 'input-toggle', type: 'button', 'aria-label': 'Show password', 'aria-pressed': 'false',
    onclick: () => {
      const show = input.type === 'password';
      input.type = show ? 'text' : 'password';
      toggle.replaceChildren(icon(show ? 'eyeOff' : 'eye'));
      toggle.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
      toggle.setAttribute('aria-pressed', String(show));
    },
  }, icon('eye'));
  const field = h('div', { class: 'field' },
    h('label', { for: id }, label),
    h('div', { class: 'input-wrap' }, input, toggle),
  );
  return { input, field };
}

function setAlert(el, message) {
  el.hidden = false;
  el.replaceChildren(message);
}

function ruleRow(check) {
  return h('li', { class: `pw-rule${check.met ? ' pw-rule--met' : ''}`, 'data-met': String(check.met) },
    icon(check.met ? 'check' : 'x', { size: 14 }),
    h('span', {}, check.label),
  );
}

/**
 * Live password aids: a real-requirements checklist, a strength verdict and
 * (optionally) the confirmation-match state. Re-renders on every input event
 * of the referenced fields. State is conveyed by text + icon, with color as a
 * secondary cue, so it stays accessible.
 * @param {{newPassword: HTMLInputElement, confirm?: HTMLInputElement|null}} refs
 */
function createPasswordAids({ newPassword, confirm = null }) {
  const rulesList = h('ul', { class: 'pw-rules', role: 'list', 'aria-label': 'Password requirements' });
  const strength = h('div', { class: 'pw-strength', role: 'status', 'aria-live': 'polite' });
  const match = confirm
    ? h('div', { class: 'pw-match', role: 'status', 'aria-live': 'polite' })
    : null;
  const segments = [0, 1, 2].map(() => h('span', { class: 'pw-strength__seg' }));

  function render() {
    const value = newPassword.value;
    rulesList.replaceChildren(...passwordRuleChecks(value).map(ruleRow));

    if (!value) {
      strength.className = 'pw-strength';
      strength.replaceChildren(h('span', { class: 'muted' }, 'Set a password that meets the requirements.'));
      return;
    }
    const tier = passwordStrength(value);
    const label = tier[0].toUpperCase() + tier.slice(1);
    strength.className = `pw-strength pw-strength--${tier}`;
    segments.forEach((seg, i) => {
      seg.className = `pw-strength__seg${i + 1 <= (tier === 'strong' ? 3 : tier === 'fair' ? 2 : 1) ? ' pw-strength__seg--on' : ''}`;
    });
    strength.replaceChildren(
      h('span', {}, 'Strength:'),
      h('strong', {}, label),
      h('span', { class: 'pw-strength__bar', 'aria-hidden': 'true' }, segments),
    );

    if (match) {
      const filled = confirm.value.length > 0;
      const ok = filled && confirmMatches(newPassword.value, confirm.value);
      match.className = `pw-match${ok ? ' pw-match--ok' : filled ? ' pw-match--err' : ''}`;
      match.replaceChildren(
        filled ? icon(ok ? 'check' : 'x', { size: 14 }) : h('span', { class: 'muted' }, '·'),
        h('span', {}, filled ? (ok ? 'Passwords match' : 'Passwords do not match') : 'Confirm your new password'),
      );
    }
  }

  newPassword.addEventListener('input', render);
  if (confirm) confirm.addEventListener('input', render);
  render();
  return h('div', { class: 'pw-aids' }, rulesList, strength, match);
}

export function LoginPage(app) {
  if (auth.isAuthenticated()) {
    navigate('/dashboard');
    return null;
  }
  let challengeContext = null;

  const emailInput = h('input', { id: 'email', type: 'email', required: true, autocomplete: 'username', placeholder: 'you@business.com' });
  const pass = passwordField('password', 'Password', { autocomplete: 'current-password' });
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
              const result = await auth.signIn(emailInput.value.trim(), pass.input.value);
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
          pass.field,
          submit,
        ),
        h('div', { class: 'auth-links' },
          h('button', { class: 'link-btn', type: 'button', onclick: () => showForgot() }, 'Forgot password?'),
          h('a', { href: '/signup', 'data-link': true }, 'Create a business account'),
        ),
      ),
    );
  }

  function showNewPassword(email) {
    const np = passwordField('np', 'New password', { autocomplete: 'new-password' });
    const aids = createPasswordAids({ newPassword: np.input });
    const submit = h('button', { class: 'btn btn--primary btn--lg btn--block', type: 'submit', disabled: true }, 'Save & continue');
    function setSubmit() { submit.disabled = !passwordMeetsPolicy(np.input.value); }
    np.input.addEventListener('input', setSubmit);
    setSubmit();

    app.replaceChildren(
      formCard('Set a new password', 'Your account requires a new password on first sign-in.',
        h('form', {
          onsubmit: async (e) => {
            e.preventDefault();
            if (submit.disabled) return;
            submit.disabled = true;
            submit.textContent = 'Saving…';
            try {
              await auth.respondToNewPassword(email, challengeContext, np.input.value);
              navigate('/dashboard');
            } catch (err) {
              submit.disabled = false;
              submit.textContent = 'Save & continue';
              toast(describeCognitoError(err), 'error');
            }
          },
        },
          np.field,
          aids,
          submit,
        ),
      ),
    );
  }

  function showForgot() {
    const RESEND_COOLDOWN_MS = 30000;
    let email = '';

    function step1() {
      const fe = h('input', { id: 'fe', type: 'email', required: true, autocomplete: 'username', placeholder: 'you@business.com' });
      const alert = h('p', { class: 'form-alert', role: 'alert', hidden: true });
      const btn = h('button', { class: 'btn btn--primary btn--lg btn--block', type: 'submit' }, 'Send code');

      app.replaceChildren(
        formCard('Reset password', 'Enter your email and we will send a verification code.',
          h('form', {
            onsubmit: async (e) => {
              e.preventDefault();
              if (!fe.value.trim() || !fe.checkValidity() || btn.disabled) return;
              btn.disabled = true;
              btn.textContent = 'Sending…';
              alert.hidden = true;
              try {
                await auth.forgotPassword(fe.value.trim());
                email = fe.value.trim();
                step2();
              } catch (err) {
                btn.disabled = false;
                btn.textContent = 'Send code';
                setAlert(alert, describeCognitoError(err));
              }
            },
          },
            h('div', { class: 'field' },
              h('label', { for: 'fe' }, 'Email'),
              fe,
              h('p', { class: 'form-note muted' }, 'We will email you a verification code.'),
            ),
            alert,
            btn,
          ),
          h('div', { class: 'auth-links' },
            h('button', { class: 'link-btn', type: 'button', onclick: () => renderLogin() }, 'Back to sign in'),
          ),
        ),
      );
    }

    function step2() {
      const fc = h('input', {
        id: 'fc', type: 'text', inputmode: 'numeric', autocomplete: 'one-time-code',
        required: true, placeholder: '6-digit code',
      });
      const np = passwordField('fp', 'New password', { autocomplete: 'new-password' });
      const cp = passwordField('cf', 'Confirm new password', { autocomplete: 'new-password' });
      const aids = createPasswordAids({ newPassword: np.input, confirm: cp.input });
      const alert = h('p', { class: 'form-alert', role: 'alert', hidden: true });
      const submit = h('button', { class: 'btn btn--primary btn--lg btn--block', type: 'submit', disabled: true }, 'Reset password');
      const resend = h('button', { class: 'link-btn', type: 'button', disabled: true }, 'Resend code');

      let canResend = true;
      let cooldownTimer = null;

      function setSubmitEnabled() {
        submit.disabled = !(
          fc.value.trim().length > 0
          && passwordMeetsPolicy(np.input.value)
          && confirmMatches(np.input.value, cp.input.value)
        );
      }
      fc.addEventListener('input', setSubmitEnabled);
      np.input.addEventListener('input', setSubmitEnabled);
      cp.input.addEventListener('input', setSubmitEnabled);
      setSubmitEnabled();

      function startCooldown() {
        canResend = false;
        resend.disabled = true;
        clearTimeout(cooldownTimer);
        let remaining = RESEND_COOLDOWN_MS / 1000;
        const tick = () => {
          if (!app.isConnected) return;
          if (remaining <= 0) {
            resend.disabled = false;
            resend.textContent = 'Resend code';
            canResend = true;
            return;
          }
          resend.textContent = `Resend code in ${remaining}s`;
          remaining -= 1;
          cooldownTimer = setTimeout(tick, 1000);
        };
        tick();
      }

      async function requestCode() {
        if (!canResend) return;
        resend.disabled = true;
        alert.hidden = true;
        try {
          await auth.forgotPassword(email);
          toast('Verification code sent. Check your email.', 'success');
          startCooldown();
        } catch (err) {
          canResend = true;
          resend.disabled = false;
          setAlert(alert, describeCognitoError(err));
        }
      }
      resend.addEventListener('click', requestCode);

      const form = h('form', {
        onsubmit: async (e) => {
          e.preventDefault();
          if (submit.disabled) return;
          submit.disabled = true;
          submit.textContent = 'Resetting…';
          alert.hidden = true;
          try {
            await auth.confirmForgotPassword(email, fc.value.trim(), np.input.value);
            toast('Password updated. Sign in with your new password.', 'success');
            renderLogin();
          } catch (err) {
            submit.disabled = false;
            submit.textContent = 'Reset password';
            setSubmitEnabled();
            setAlert(alert, describeCognitoError(err));
          }
        },
      },
        h('div', { class: 'field' },
          h('label', { for: 'fc' }, 'Verification code'),
          fc,
          h('p', { class: 'form-note muted', id: 'fc-help' }, `We emailed a 6-digit code to ${email}.`),
        ),
        np.field,
        cp.field,
        aids,
        alert,
        submit,
        h('p', { class: 'form-note' }, 'Code not arrived? ', resend, ' or check your spam folder.'),
      );

      app.replaceChildren(
        formCard('Reset password', 'Enter the code and choose a new password.', form,
          h('div', { class: 'auth-links' },
            h('button', { class: 'link-btn', type: 'button', onclick: () => step1() }, 'Use a different email'),
          ),
        ),
      );
      fc.focus();
    }

    step1();
  }

  renderLogin();
  return null;
}

export { formCard, passwordField };
