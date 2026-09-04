// Guided onboarding: organization → branch → service → queue.

import { h, toast } from '../dom.js';
import { api, ApiError } from '../api.js';
import { navigate } from '../router.js';

export function OnboardingPage(app) {
  const step1 = buildStep(
    'Create your organization',
    'This is your tenant — staff, branches and queues live inside it.',
    [
      input('ob-org', 'Organization name', 'text', 'e.g. Northside Dental', { required: true, maxlength: 100 }),
      input('ob-loc', 'Location (optional)', 'text', 'e.g. Austin, TX', { required: false, maxlength: 120 }),
    ],
    async (values, next) => {
      const org = await api.post('/organizations', { name: values['ob-org'] });
      try {
        await api.post(`/organizations/${org.orgId}/publish`, { publish: true, location: values['ob-loc'] || undefined });
      } catch {
        // Publishing is optional; organization creation remains successful.
      }
      next({ org });
    },
  );

  const step2 = buildStep(
    'Add a branch',
    'A physical location where customers wait.',
    [
      input('ob-branch', 'Branch name', 'text', 'e.g. Main Street', { required: true, maxlength: 100 }),
      input('ob-addr', 'Address (optional)', 'text', '123 Main St', { required: false, maxlength: 160 }),
    ],
    async (values, next, carry) => {
      const branch = await api.post(`/organizations/${carry.org.orgId}/branches`, {
        name: values['ob-branch'],
        address: values['ob-addr'] || undefined,
      });
      next({ branch });
    },
  );

  const step3 = buildStep(
    'Define a service',
    'What customers line up for, and roughly how long it takes.',
    [
      input('ob-svc', 'Service name', 'text', 'e.g. Check-up', { required: true, maxlength: 100 }),
      input('ob-mins', 'Typical minutes', 'number', '5', { required: true, min: 1, max: 480 }),
    ],
    async (values, next, carry) => {
      const service = await api.post(`/organizations/${carry.org.orgId}/services`, {
        name: values['ob-svc'],
        defaultServiceMinutes: Number(values['ob-mins'] || 5),
      });
      next({ service });
    },
  );

  const step4 = h('div', { class: 'page page--narrow' },
    h('div', { class: 'card form-card' },
      h('p', { class: 'eyebrow' }, 'Final step'),
      h('h1', {}, 'Create your queue'),
      h('p', { class: 'muted' }, 'Set the ticket format and number of serving counters. You can manage the queue after setup.'),
      buildQueueForm(),
    ),
  );

  let carry = {};

  function buildQueueForm() {
    const name = input('ob-q', 'Queue name', 'text', 'e.g. Morning walk-ins', { required: true, maxlength: 100 });
    const prefix = input('ob-prefix', 'Ticket prefix', 'text', 'A', { required: false, maxlength: 8 });
    const pad = input('ob-pad', 'Number padding', 'number', '3', { required: true, min: 1, max: 8 });
    const staff = input('ob-staff', 'Serving counters', 'number', '1', { required: true, min: 1, max: 100 });
    const submit = h('button', { class: 'btn btn--primary btn--lg btn--block', type: 'submit' }, 'Create queue');
    return h('form', {
      onsubmit: async (e) => {
        e.preventDefault();
        submit.disabled = true;
        submit.textContent = 'Creating…';
        try {
          const queue = await api.post(
            `/organizations/${encodeURIComponent(carry.org.orgId)}/queues`,
            {
              name: name.value.trim(),
              branchId: carry.branch.branchId,
              serviceId: carry.service.serviceId,
              prefix: prefix.value.trim() || undefined,
              padWidth: Number(pad.value || 3),
              staffCount: Number(staff.value || 1),
            },
          );
          toast('Queue created. Share the QR to take customers.', 'success');
          navigate(`/dashboard/queue/${queue.queueId}`);
        } catch (err) {
          submit.disabled = false;
          submit.textContent = 'Create queue';
          toast(err instanceof ApiError ? err.message : 'Creation failed', 'error');
        }
      },
    },
      wrapField('ob-q', 'Queue name', name),
      wrapField('ob-prefix', 'Ticket prefix', prefix),
      wrapField('ob-pad', 'Number padding', pad),
      wrapField('ob-staff', 'Serving counters', staff),
      submit,
    );
  }

  function input(id, label, type, placeholder, options = {}) {
    return h('input', {
      id,
      name: id,
      type,
      placeholder,
      autocomplete: type === 'email' ? 'email' : 'off',
      required: Boolean(options.required),
      ...(options.maxlength ? { maxlength: String(options.maxlength) } : {}),
      ...(options.min !== undefined ? { min: String(options.min) } : {}),
      ...(options.max !== undefined ? { max: String(options.max) } : {}),
    });
  }

  function wrapField(_id, label, el) {
    return h('div', { class: 'field' }, h('label', { for: el.id }, label), el);
  }

  function buildStep(title, sub, fields, onSubmit) {
    const els = fields;
    const submit = h('button', { class: 'btn btn--primary btn--lg btn--block', type: 'submit' }, 'Continue');
    return h('div', { class: 'page page--narrow' },
      h('div', { class: 'card form-card' },
        h('p', { class: 'eyebrow' }, 'Setup'),
        h('h1', {}, title),
        h('p', { class: 'muted' }, sub),
        h('form', {
          onsubmit: async (e) => {
            e.preventDefault();
            submit.disabled = true;
            submit.textContent = 'Saving…';
            const values = {};
            els.forEach((el) => { values[el.id] = el.value.trim(); });
            try {
              await onSubmit(values, (extra) => { carry = { ...carry, ...extra }; advance(); }, carry);
            } catch (err) {
              submit.disabled = false;
              submit.textContent = 'Continue';
              toast(err instanceof ApiError ? err.message : 'Something went wrong', 'error');
            }
          },
        },
          els.map((el) => h('div', { class: 'field' }, h('label', { for: el.id }, labelFor(el.id)), el)),
          submit,
        ),
      ),
    );
  }

  const LABELS = {
    'ob-org': 'Organization name',
    'ob-loc': 'Location (optional)',
    'ob-branch': 'Branch name',
    'ob-addr': 'Address (optional)',
    'ob-svc': 'Service name',
    'ob-mins': 'Typical minutes',
  };
  const labelFor = (id) => LABELS[id] ?? id;

  const steps = [step1, step2, step3, step4];
  let index = 0;

  function advance() {
    index += 1;
    renderStep();
  }

  function renderStep() {
    app.replaceChildren(steps[index]);
  }

  renderStep();
  return null;
}
