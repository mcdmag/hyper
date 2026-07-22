import {readFileSync} from 'fs';
import {join} from 'path';

import React from 'react';

import test from 'ava';
import {renderToStaticMarkup} from 'react-dom/server';

import NliPanel, {NLI_CONFIG_BLOCK, type NliPanelProps} from '../../lib/components/nli-panel';
import {
  NLI_ARM_HIGH_RISK,
  NLI_BEGIN_EDIT,
  NLI_DISMISS,
  NLI_END_EDIT,
  NLI_LOGIN_STARTED,
  NLI_OPEN_SETUP,
  NLI_RECEIVE_AUTH,
  NLI_RECEIVE_STATE,
  NLI_SELECT_OPTION,
  NLI_UPDATE_EDIT
} from '../../lib/constants/nli';
import nliReducer from '../../lib/reducers/nli';
import type {NliDisplayState, NliRendererSessionState, OptionId, PlanId, SessionUid} from '../../typings/nli';

const sessionUid = 'session-renderer' as SessionUid;
const attemptId = 'attempt-renderer' as Extract<NliDisplayState, {status: 'review'}>['attemptId'];
const planId = 'plan-renderer' as PlanId;
const firstOptionId = 'option-first' as OptionId;
const secondOptionId = 'option-second' as OptionId;

const reviewState = (): Extract<NliDisplayState, {status: 'review'}> => ({
  status: 'review',
  sessionUid,
  attemptId,
  planId,
  summary: 'Create a pull request <script>alert(1)</script>',
  editRevision: 0,
  options: [
    {
      optionId: firstOptionId,
      label: 'Commit staged files',
      rationale: 'Keeps unstaged work local.',
      assumptions: ['GitHub CLI is authenticated.'],
      purpose: 'Create a pull request.',
      commandPreview: 'git commit; git push; gh pr create',
      risk: {level: 'medium', reasons: ['Publishes a branch.'], requiresSecondConfirmation: false}
    },
    {
      optionId: secondOptionId,
      label: 'Delete generated output',
      rationale: 'Clears generated output first.',
      assumptions: [],
      purpose: 'Rebuild before publishing.',
      commandPreview: 'Remove-Item -Recurse .\\dist',
      risk: {level: 'high', reasons: ['Deletes data.'], requiresSecondConfirmation: true}
    }
  ]
});

const action = (state: NliDisplayState) => ({type: NLI_RECEIVE_STATE, state}) as const;

test('renderer state is disabled by default and setup remains available per pane', (t) => {
  let state = nliReducer(undefined, {type: '@@init'} as never);
  t.false(state.enabled);
  state = nliReducer(state, {type: NLI_OPEN_SETUP, sessionUid});
  t.true(state.sessions[sessionUid].setupOpen);
  state = nliReducer(state, {
    type: 'CONFIG_LOAD',
    config: {naturalLanguageInterface: {enabled: true}}
  } as never);
  t.true(state.enabled);
  state = nliReducer(state, {type: NLI_DISMISS, sessionUid});
  t.false(state.sessions[sessionUid].setupOpen);
  t.true(state.sessions[sessionUid].unsupportedDismissed);
});

test('review selection, edit, risk confirmation, and fresh plan state are deterministic', (t) => {
  let state = nliReducer(undefined, action(reviewState()));
  t.is(state.sessions[sessionUid].selectedOptionId, firstOptionId);
  t.is(state.sessions[sessionUid].editText, reviewState().options[0].commandPreview);

  state = nliReducer(state, {type: NLI_SELECT_OPTION, sessionUid, optionId: secondOptionId});
  t.is(state.sessions[sessionUid].editText, reviewState().options[1].commandPreview);
  state = nliReducer(state, {type: NLI_BEGIN_EDIT, sessionUid});
  state = nliReducer(state, {type: NLI_UPDATE_EDIT, sessionUid, value: 'Remove-Item .\\one.txt'});
  state = nliReducer(state, {type: NLI_ARM_HIGH_RISK, sessionUid});
  t.true(state.sessions[sessionUid].editing);
  t.true(state.sessions[sessionUid].highRiskArmed);

  const revised = {...reviewState(), editRevision: 1} as const;
  state = nliReducer(state, action(revised));
  t.false(state.sessions[sessionUid].editing);
  t.false(state.sessions[sessionUid].highRiskArmed);
  t.is(state.sessions[sessionUid].selectedOptionId, secondOptionId);
  t.is(state.sessions[sessionUid].editText, revised.options[1].commandPreview);

  state = nliReducer(state, {type: NLI_BEGIN_EDIT, sessionUid});
  state = nliReducer(state, {type: NLI_END_EDIT, sessionUid});
  t.false(state.sessions[sessionUid].editing);
});

test('every display state can transition without leaking into another pane', (t) => {
  const secondUid = 'session-two' as SessionUid;
  const displays: NliDisplayState[] = [
    {status: 'idle', sessionUid},
    {status: 'unsupported', sessionUid, message: 'PowerShell required.'},
    {status: 'privacy-required', sessionUid, attemptId},
    {status: 'auth-required', sessionUid, attemptId},
    {status: 'interpreting', sessionUid, attemptId},
    {
      status: 'clarification',
      sessionUid,
      attemptId,
      planId,
      question: 'Which remote?',
      choices: [
        {optionId: firstOptionId, label: 'origin'},
        {optionId: secondOptionId, label: 'upstream'}
      ]
    },
    reviewState(),
    {status: 'sent', sessionUid, attemptId},
    {
      status: 'cancelled',
      sessionUid,
      attemptId,
      code: 'NLI_CANCELLED',
      correlationId: 'cancel-id',
      message: 'Cancelled.'
    },
    {
      status: 'error',
      sessionUid,
      attemptId,
      code: 'NLI_OFFLINE',
      correlationId: 'offline-id',
      message: 'Offline.'
    },
    {
      status: 'stale',
      sessionUid,
      attemptId,
      code: 'NLI_STALE',
      correlationId: 'stale-id',
      message: 'Stale.'
    }
  ];
  let state = nliReducer(undefined, {type: NLI_OPEN_SETUP, sessionUid: secondUid});
  for (const display of displays) {
    state = nliReducer(state, action(display));
    t.is(state.sessions[sessionUid].display?.status, display.status === 'idle' ? undefined : display.status);
    t.true(state.sessions[secondUid].setupOpen);
  }
  state = nliReducer(state, {type: NLI_LOGIN_STARTED, sessionUid});
  t.true(state.sessions[sessionUid].signingIn);
  state = nliReducer(state, {
    type: NLI_RECEIVE_AUTH,
    sessionUid,
    auth: {status: 'error', code: 'NLI_KEYRING_UNAVAILABLE', correlationId: 'auth-id'}
  });
  t.is(state.sessions[sessionUid].auth.status, 'error');
  t.false(state.sessions[sessionUid].signingIn);
  t.true(state.sessions[secondUid].setupOpen);
  state = nliReducer(state, {type: 'SESSION_PTY_EXIT', uid: sessionUid} as never);
  t.false(Boolean(state.sessions[sessionUid]));
  t.true(state.sessions[secondUid].setupOpen);
});

const panelProps = (session: NliRendererSessionState): NliPanelProps => ({
  sessionUid,
  shell: 'pwsh.exe',
  enabled: true,
  supportedShell: true,
  active: true,
  session,
  backgroundColor: '#000',
  foregroundColor: '#fff',
  borderColor: '#333',
  uiFontFamily: 'system-ui',
  onDismiss() {},
  onOpenConfig() {},
  onCheckStatus() {},
  onPrivacy() {},
  onResetPrivacy() {},
  onLogin() {},
  onLogout() {},
  onCancel() {},
  onRetry() {},
  onClarify() {},
  onSelectOption() {},
  onBeginEdit() {},
  onUpdateEdit() {},
  onSaveEdit() {},
  onCancelEdit() {},
  onApprove() {},
  onReject() {},
  onRestoreTerminalFocus() {}
});

test('component renders model text as escaped text with native accessible controls', (t) => {
  const session: NliRendererSessionState = {
    setupOpen: false,
    unsupportedDismissed: false,
    display: reviewState(),
    selectedOptionId: firstOptionId,
    editText: reviewState().options[0].commandPreview,
    editing: false,
    highRiskArmed: false,
    signingIn: false,
    auth: {status: 'signed-in'}
  };
  const html = renderToStaticMarkup(React.createElement(NliPanel, panelProps(session)));
  t.true(html.includes('role="dialog"'));
  t.true(html.includes('aria-modal="false"'));
  t.true(html.includes('type="radio"'));
  t.true(html.includes('type="button"'));
  t.true(html.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));
  t.false(html.includes('<script>alert(1)</script>'));
});

test('component exposes consent, clarification, retry, setup errors, edit, and risk states accessibly', (t) => {
  const baseSession: NliRendererSessionState = {
    setupOpen: false,
    unsupportedDismissed: false,
    editText: '',
    editing: false,
    highRiskArmed: false,
    signingIn: false,
    auth: {status: 'signed-out'}
  };
  const render = (session: NliRendererSessionState, overrides: Partial<NliPanelProps> = {}) =>
    renderToStaticMarkup(React.createElement(NliPanel, {...panelProps(session), ...overrides}));

  const consent = render({...baseSession, display: {status: 'privacy-required', sessionUid, attemptId}});
  t.is((consent.match(/type="checkbox"/g) || []).length, 3);
  t.true(consent.includes('Screening is local and heuristic'));
  t.true(consent.includes('Accept and sign in with ChatGPT'));

  const clarification = render({
    ...baseSession,
    display: {
      status: 'clarification',
      sessionUid,
      attemptId,
      planId,
      question: 'Which remote should Hyper use?',
      choices: [
        {optionId: firstOptionId, label: 'origin'},
        {optionId: secondOptionId, label: 'upstream'}
      ]
    }
  });
  t.is((clarification.match(/type="radio"/g) || []).length, 2);
  t.true(clarification.includes('Which remote should Hyper use?'));

  for (const code of ['NLI_KEYRING_UNAVAILABLE', 'NLI_USERDATA_UNWRITABLE'] as const) {
    const setupError = render({
      ...baseSession,
      setupOpen: true,
      auth: {status: 'error', code, correlationId: 'renderer-error'}
    });
    t.true(setupError.includes('role="alert"'));
    t.true(setupError.includes(code === 'NLI_KEYRING_UNAVAILABLE' ? 'keyring is unavailable' : 'data directory'));
  }

  const retry = render({
    ...baseSession,
    display: {
      status: 'error',
      sessionUid,
      attemptId,
      code: 'NLI_OFFLINE',
      correlationId: 'offline',
      message: 'offline'
    }
  });
  t.true(retry.includes('No suggestion was created'));
  t.true(retry.includes('Try again'));

  const editable = render({...baseSession, display: reviewState(), editing: true, editText: 'git status'});
  t.true(editable.includes('<textarea'));
  t.true(editable.includes('git status'));

  const highRisk = render({
    ...baseSession,
    display: reviewState(),
    selectedOptionId: secondOptionId,
    editText: reviewState().options[1].commandPreview,
    highRiskArmed: true
  });
  t.true(highRisk.includes('I reviewed the exact command and target'));
  t.true(highRisk.includes('Confirm and send once'));

  const unsupported = render(baseSession, {enabled: true, supportedShell: false, shell: 'cmd.exe'});
  t.true(unsupported.includes('cmd.exe'));
  t.true(unsupported.includes('PowerShell is required'));
});

test('component source preserves safe focus, keyboard, narrow, and reduced-motion behavior', (t) => {
  const source = readFileSync(join(__dirname, '..', '..', 'lib', 'components', 'nli-panel.tsx'), 'utf8');
  t.regex(source, /props\.active.*headingRef\.current\?\.focus/s);
  t.regex(source, /event\.key !== 'Escape'/);
  t.regex(source, /onRestoreTerminalFocus/);
  t.regex(source, /@media \(max-width: 480px\)/);
  t.regex(source, /@media \(prefers-reduced-motion: reduce\)/);
  t.regex(source, /user-select: text/);
  t.false(source.includes('dangerouslySetInnerHTML'));
  t.false(source.includes('type="submit"'));
  t.regex(NLI_CONFIG_BLOCK, /enabled: true/);
  t.regex(NLI_CONFIG_BLOCK, /includeWorkingDirectory: false/);
  t.regex(NLI_CONFIG_BLOCK, /includeGitMetadata: false/);
});
