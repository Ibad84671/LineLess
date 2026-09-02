// Business account creation: Cognito sign-up + email verification.

import { h, toast } from '../dom.js';
import { auth } from '../auth.js';
import { navigate } from '../router.js';
import { formCard } from './login.js';

export function SignupPage(app) {
  const nameInput = h('input', { id: 'su-name', type: 'text', required: true, autocomplete: 'name', placeholder: 'Your name' });
  const emailInput = h('input', { id: 'su-email', type: 'email', required: true, autocomplete: 'username', placeholder: 'you@business.com' });
  const passInput = h('input', { id: 'su-pass', type: 'password', required: true, autocomplete: 'new-password', minlength: '8' });
  const codeInput = h('input', { id: 'su-code', type: 'text', inputmode: 'numeric' });
  const codeWrap = h('div', { class: 'field', hidden: true },
    h('label', { for: 'su-code' }, 'Verification code (check your email)'), codeInput);
  const submit = h('button', { class: 'btn btn--primary btn--lg btn--block', type: 'submit' }, 'Create account');
  let emailConfirmed = false;

  app.replaceChildren(
    formCard('Create a business account', 'Set up organizations, branches, queues and staff.',
      h('form', {
        onsubmit: async (e) => {
          e.preventDefault();
          submit.disabled = true;
          submit.textContent = emailConfirmed ? 'Verifying…' : 'Creating account…';
          try {
            if (!emailConfirmed) {
              await auth.signUp(emailInput.value.trim(), passInput.value, nameInput.value.trim());
              emailConfirmed = true;
              codeWrap.hidden = false;
              codeInput.required = true;
              passInput.closest('.field').hidden = true;
              nameInput.closest('.field').hidden = true;
              submit.disabled = false;
              submit.textContent = 'Verify & continue';
              toast('Account created. Enter the emailed code.', 'success');
              return;
            }
            await auth.confirmSignUp(emailInput.value.trim(), codeInput.value.trim());
            await auth.signIn(emailInput.value.trim(), passInput.value).catch(() => null);
            toast('Welcome to LineLess.', 'success');
            navigate('/onboarding');
          } catch (err) {
            submit.disabled = false;
            submit.textContent = emailConfirmed ? 'Verify & continue' : 'Create account';
            toast(err.message ?? 'Sign up failed', 'error');
          }
        },
      },
        h('div', { class: 'field' }, h('label', { for: 'su-name' }, 'Name'), nameInput),
        h('div', { class: 'field' }, h('label', { for: 'su-email' }, 'Work email'), emailInput),
        h('div', { class: 'field' }, h('label', { for: 'su-pass' }, 'Password (min 8 chars)'), passInput),
        codeWrap,
        submit,
      ),
      h('div', { class: 'auth-links' },
        h('a', { href: '/login', 'data-link': true }, 'Already have an account? Sign in'),
      ),
    ),
  );
  return null;
}
