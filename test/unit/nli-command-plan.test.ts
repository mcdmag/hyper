import test from 'ava';

import {
  ImmutableCommandPlan,
  NliCommandPlanError,
  classifyCommandRisk,
  screenSecretLookingInput,
  validateCommandPlan
} from '../../app/nli/command-plan';
import type {
  AttemptId,
  CommandPlan,
  NliApprovalRequest,
  NliEditRequest,
  OptionId,
  PlanId,
  SessionUid
} from '../../typings/nli';

const sessionUid = 'session-1' as SessionUid;
const attemptId = 'attempt-1' as AttemptId;
const planId = 'plan-1' as PlanId;
const optionId = 'option-1' as OptionId;

const rawPlan = (overrides: Record<string, unknown> = {}) => ({
  version: 1,
  kind: 'plan',
  planId,
  summary: 'Create a commit and pull request.',
  options: [
    {
      optionId,
      label: 'Use GitHub CLI',
      rationale: 'This uses the repository and authenticated GitHub CLI.',
      assumptions: ['The intended files are already staged.'],
      purpose: 'Commit, push, and open a pull request.',
      shellText: 'git commit -m "Update"; git push; gh pr create'
    }
  ],
  ...overrides
});

const validatedPlan = () => validateCommandPlan(rawPlan()) as CommandPlan;

const binding = Object.freeze({
  sessionUid,
  attemptId,
  shellIdentity: 'c:\\program files\\powershell\\7\\pwsh.exe',
  cwdFingerprint: 'cwd-fingerprint',
  submittedLine: 'commit the changes and create a pr',
  approvalIdentity: Object.freeze({windowId: 10, rendererId: 20})
});

const approval = (overrides: Partial<NliApprovalRequest> = {}): NliApprovalRequest => ({
  sessionUid,
  attemptId,
  planId,
  optionId,
  editRevision: 0,
  highRiskConfirmation: true,
  ...overrides
});

test('validates and deeply freezes the strict versioned plan and clarification union', (t) => {
  const plan = validateCommandPlan(rawPlan());
  t.deepEqual(plan, rawPlan());
  t.true(Object.isFrozen(plan));
  if (plan.kind !== 'plan') return;
  t.true(Object.isFrozen(plan.options));
  t.true(Object.isFrozen(plan.options[0]));
  t.true(Object.isFrozen(plan.options[0].assumptions));

  const clarification = validateCommandPlan({
    version: 1,
    kind: 'clarification',
    planId: 'clarification-1',
    question: 'Which remote should receive the branch?',
    choices: [
      {optionId: 'origin', label: 'origin'},
      {optionId: 'upstream', label: 'upstream'}
    ]
  });
  t.is(clarification.kind, 'clarification');
  t.true(Object.isFrozen(clarification));
});

test('rejects prose, additional properties, wrong versions, duplicate IDs, bounds, and controls', (t) => {
  const invalid: unknown[] = [
    'Here is your command: git status',
    {...rawPlan(), version: 2},
    {...rawPlan(), extra: true},
    rawPlan({summary: ''}),
    rawPlan({summary: ' '.repeat(5)}),
    rawPlan({summary: 'x'.repeat(501)}),
    rawPlan({options: []}),
    rawPlan({options: [...rawPlan().options, ...rawPlan().options, ...rawPlan().options]}),
    rawPlan({
      options: [rawPlan().options[0], {...rawPlan().options[0]}]
    }),
    rawPlan({options: [{...rawPlan().options[0], shellText: 'git status\nRemove-Item -Recurse .'}]}),
    rawPlan({options: [{...rawPlan().options[0], shellText: 'git status\u0000'}]}),
    rawPlan({options: [{...rawPlan().options[0], label: 'unsafe\u0007'}]}),
    rawPlan({options: [{...rawPlan().options[0], assumptions: ['x'.repeat(241)]}]}),
    rawPlan({options: [{...rawPlan().options[0], unexpected: 'field'}]}),
    {
      version: 1,
      kind: 'clarification',
      planId: 'clarification',
      question: 'Choose?',
      choices: [{optionId: 'only', label: 'Only one'}]
    }
  ];
  for (const value of invalid) {
    const error = t.throws(() => validateCommandPlan(value, 2));
    t.true(error instanceof NliCommandPlanError);
    t.is((error as NliCommandPlanError).code, 'NLI_VALIDATION_FAILED');
  }
});

test('screens common credential shapes locally without returning credential bytes', (t) => {
  const fixtures = [
    'OPENAI_API_KEY=sk-abcdefghijklmnopqrstuvwxyz',
    'Authorization: Bearer abcdefghijklmnopqrstuvwxyz',
    'token=abcdefghijklmnopqrstuvwxyz',
    '-----BEGIN PRIVATE KEY-----',
    'AWS key AKIAABCDEFGHIJKLMNOP',
    'ghp_abcdefghijklmnopqrstuvwxyz123456',
    'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.signaturepart'
  ];
  for (const input of fixtures) {
    const result = screenSecretLookingInput(input);
    t.true(result.sensitive, input);
    t.true(result.reasons.length > 0);
    t.false(JSON.stringify(result).includes(input));
  }
  t.deepEqual(screenSecretLookingInput('commit the changes and create a pr'), {
    sensitive: false,
    reasons: []
  });
});

test('risk classification is deterministic across every required command category', (t) => {
  const fixtures = [
    ['Remove-Item -Recurse .\\build', 'high', 'Deletes'],
    ['rm .\\secret.txt', 'high', 'Deletes'],
    ['git rm -- cached.txt', 'high', 'Deletes'],
    ['git add -A', 'medium', 'Stages'],
    ['git add *', 'medium', 'Stages'],
    ['Start-Process pwsh -Verb RunAs', 'high', 'elevated'],
    ['git push origin HEAD', 'medium', 'remote'],
    ['git fetch origin', 'medium', 'remote'],
    ['ssh example.test', 'medium', 'remote'],
    ['pnpm install', 'medium', 'remote'],
    ['Get-Content a.txt > b.txt', 'medium', 'redirects'],
    ['pwsh -EncodedCommand ZQBjAGgAbwA=', 'high', 'encoded'],
    ['Invoke-Expression $command', 'high', 'dynamically'],
    ['Get-Process | Where-Object CPU', 'medium', 'pipeline'],
    ['git status; git log -1', 'medium', 'multiple'],
    ['& (`g`c`m Get-Process)', 'high', 'obfuscation']
  ] as const;
  for (const [command, level, reason] of fixtures) {
    const first = classifyCommandRisk(command);
    t.is(first.level, level, command);
    t.true(
      first.reasons.some((candidate) => candidate.includes(reason)),
      command
    );
    t.deepEqual(classifyCommandRisk(command), first);
    t.is(first.requiresSecondConfirmation, level === 'high');
  }
  t.deepEqual(classifyCommandRisk('git status'), {
    level: 'low',
    reasons: [],
    requiresSecondConfirmation: false
  });
});

test('vault digests the full context and authorizes one exact immutable payload', (t) => {
  const vault = new ImmutableCommandPlan(binding, validatedPlan());
  const authorized = vault.authorize(approval(), {windowId: 10, rendererId: 20});
  t.is(authorized.status, 'authorized');
  if (authorized.status !== 'authorized') return;
  t.is(authorized.shellText, rawPlan().options[0].shellText);
  t.regex(authorized.digest, /^[a-f0-9]{64}$/);
  t.true(Object.isFrozen(authorized));
  t.deepEqual(vault.authorize(approval(), {windowId: 10, rendererId: 20}), {status: 'rejected'});

  const differentContext = new ImmutableCommandPlan({...binding, cwdFingerprint: 'other-cwd'}, validatedPlan());
  const second = differentContext.authorize(approval(), {windowId: 10, rendererId: 20});
  t.is(second.status, 'authorized');
  if (second.status === 'authorized') t.not(second.digest, authorized.digest);
});

test('edits change the digest and revision while invalidating prior approvals', (t) => {
  const original = new ImmutableCommandPlan(binding, validatedPlan());
  const originalDecision = original.authorize(approval(), {windowId: 10, rendererId: 20});
  t.is(originalDecision.status, 'authorized');

  const vault = new ImmutableCommandPlan(binding, validatedPlan());
  const edit: NliEditRequest = {
    sessionUid,
    attemptId,
    planId,
    optionId,
    editRevision: 0,
    shellText: 'git status'
  };
  t.true(vault.edit(edit));
  t.is(vault.revision, 1);
  t.false(vault.edit(edit));
  t.deepEqual(vault.authorize(approval(), {windowId: 10, rendererId: 20}), {status: 'rejected'});
  const edited = vault.authorize(approval({editRevision: 1}), {windowId: 10, rendererId: 20});
  t.is(edited.status, 'authorized');
  if (edited.status === 'authorized' && originalDecision.status === 'authorized') {
    t.is(edited.shellText, 'git status');
    t.not(edited.digest, originalDecision.digest);
  }
});

test('opaque identity, context IDs, rejection, and high-risk confirmation fail closed', (t) => {
  const mismatches: [Partial<NliApprovalRequest>, {windowId: number; rendererId: number}][] = [
    [{sessionUid: 'other' as SessionUid}, {windowId: 10, rendererId: 20}],
    [{attemptId: 'other' as AttemptId}, {windowId: 10, rendererId: 20}],
    [{planId: 'other' as PlanId}, {windowId: 10, rendererId: 20}],
    [{optionId: 'other' as OptionId}, {windowId: 10, rendererId: 20}],
    [{}, {windowId: 99, rendererId: 20}],
    [{}, {windowId: 10, rendererId: 99}]
  ];
  for (const [requestOverrides, identity] of mismatches) {
    const vault = new ImmutableCommandPlan(binding, validatedPlan());
    t.deepEqual(vault.authorize(approval(requestOverrides), identity), {status: 'rejected'});
  }

  const highRiskPlan = validateCommandPlan(
    rawPlan({options: [{...rawPlan().options[0], shellText: 'Remove-Item -Recurse .\\build'}]})
  ) as CommandPlan;
  const highRisk = new ImmutableCommandPlan(binding, highRiskPlan);
  const confirmation = highRisk.authorize(approval({highRiskConfirmation: true}), {
    windowId: 10,
    rendererId: 20
  });
  t.is(confirmation.status, 'confirmation-required');
  t.is(
    highRisk.authorize(approval({highRiskConfirmation: false}), {windowId: 10, rendererId: 20}).status,
    'confirmation-required'
  );
  t.is(highRisk.authorize(approval(), {windowId: 10, rendererId: 20}).status, 'authorized');

  const rejected = new ImmutableCommandPlan(binding, validatedPlan());
  t.true(rejected.reject(sessionUid, attemptId, planId));
  t.false(rejected.reject(sessionUid, attemptId, planId));
  t.deepEqual(rejected.authorize(approval(), {windowId: 10, rendererId: 20}), {status: 'rejected'});
});

test('competing approvals atomically consume exactly one payload', async (t) => {
  const vault = new ImmutableCommandPlan(binding, validatedPlan());
  const decisions = await Promise.all(
    Array.from({length: 16}, () =>
      Promise.resolve().then(() => vault.authorize(approval(), {windowId: 10, rendererId: 20}))
    )
  );
  t.is(decisions.filter((decision) => decision.status === 'authorized').length, 1);
  t.is(decisions.filter((decision) => decision.status === 'rejected').length, 15);
});

test('changing high-risk options starts a fresh main-owned confirmation', (t) => {
  const firstOption = rawPlan().options[0];
  const plan = validateCommandPlan(
    rawPlan({
      options: [
        {...firstOption, shellText: 'Remove-Item .\\first.txt'},
        {...firstOption, optionId: 'option-2', label: 'Delete second', shellText: 'Remove-Item .\\second.txt'}
      ]
    })
  ) as CommandPlan;
  const vault = new ImmutableCommandPlan(binding, plan);
  t.is(vault.authorize(approval(), {windowId: 10, rendererId: 20}).status, 'confirmation-required');
  const secondApproval = approval({optionId: 'option-2' as OptionId});
  t.is(vault.authorize(secondApproval, {windowId: 10, rendererId: 20}).status, 'confirmation-required');
  t.is(vault.authorize(secondApproval, {windowId: 10, rendererId: 20}).status, 'authorized');
});
