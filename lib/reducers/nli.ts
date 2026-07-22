import Immutable from 'seamless-immutable';

import type {INliReducer, Mutable, nliState} from '../../typings/hyper';
import type {NliDisplayState, NliRendererSessionState, SessionUid} from '../../typings/nli';
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
} from '../constants/nli';

const initialState: nliState = Immutable<Mutable<nliState>>({enabled: false, sessions: {}});

const createSessionState = (): NliRendererSessionState =>
  Immutable({
    setupOpen: false,
    unsupportedDismissed: false,
    editText: '',
    editing: false,
    highRiskArmed: false,
    signingIn: false,
    auth: {status: 'unknown'}
  });

const ensureSession = (state: nliState, sessionUid: SessionUid): nliState =>
  state.sessions[sessionUid] ? state : state.setIn(['sessions', sessionUid], createSessionState());

const reviewSelection = (display: Extract<NliDisplayState, {status: 'review'}>, prior?: NliRendererSessionState) => {
  const selected = display.options.find((option) => option.optionId === prior?.selectedOptionId) || display.options[0];
  return {selectedOptionId: selected?.optionId, editText: selected?.commandPreview || ''};
};

const reducer: INliReducer = (state = initialState, action) => {
  switch (action.type) {
    case 'CONFIG_LOAD':
    case 'CONFIG_RELOAD':
      return state.set('enabled', action.config.naturalLanguageInterface.enabled === true);
    case NLI_OPEN_SETUP: {
      const next = ensureSession(state, action.sessionUid);
      return next.setIn(['sessions', action.sessionUid, 'setupOpen'], true);
    }
    case NLI_DISMISS: {
      const next = ensureSession(state, action.sessionUid);
      return next.setIn(
        ['sessions', action.sessionUid],
        next.sessions[action.sessionUid].merge({
          setupOpen: false,
          unsupportedDismissed: true,
          display: undefined,
          editing: false,
          highRiskArmed: false,
          signingIn: false
        })
      );
    }
    case NLI_RECEIVE_STATE: {
      const {sessionUid} = action.state;
      const next = ensureSession(state, sessionUid);
      const prior = next.sessions[sessionUid];
      const selection = action.state.status === 'review' ? reviewSelection(action.state, prior) : {};
      return next.setIn(
        ['sessions', sessionUid],
        prior.merge({
          display: action.state.status === 'idle' ? undefined : action.state,
          setupOpen: false,
          editing: false,
          highRiskArmed: false,
          signingIn: false,
          ...selection
        })
      );
    }
    case NLI_RECEIVE_AUTH: {
      const next = ensureSession(state, action.sessionUid);
      return next.setIn(
        ['sessions', action.sessionUid],
        next.sessions[action.sessionUid].merge({auth: action.auth, signingIn: action.auth.status === 'signing-in'})
      );
    }
    case NLI_SELECT_OPTION: {
      const next = ensureSession(state, action.sessionUid);
      const current = next.sessions[action.sessionUid];
      const option =
        current.display?.status === 'review'
          ? current.display.options.find((candidate) => candidate.optionId === action.optionId)
          : undefined;
      if (!option) return state;
      return next.setIn(
        ['sessions', action.sessionUid],
        current.merge({
          selectedOptionId: option.optionId,
          editText: option.commandPreview,
          editing: false,
          highRiskArmed: false
        })
      );
    }
    case NLI_BEGIN_EDIT: {
      const next = ensureSession(state, action.sessionUid);
      return next.setIn(['sessions', action.sessionUid, 'editing'], true);
    }
    case NLI_UPDATE_EDIT: {
      const next = ensureSession(state, action.sessionUid);
      return next.setIn(['sessions', action.sessionUid, 'editText'], action.value);
    }
    case NLI_END_EDIT: {
      const next = ensureSession(state, action.sessionUid);
      return next.setIn(['sessions', action.sessionUid], next.sessions[action.sessionUid].merge({editing: false}));
    }
    case NLI_ARM_HIGH_RISK: {
      const next = ensureSession(state, action.sessionUid);
      return next.setIn(['sessions', action.sessionUid, 'highRiskArmed'], true);
    }
    case NLI_LOGIN_STARTED: {
      const next = ensureSession(state, action.sessionUid);
      return next.setIn(['sessions', action.sessionUid, 'signingIn'], true);
    }
    case 'SESSION_PTY_EXIT':
    case 'SESSION_USER_EXIT':
      if (!state.sessions[action.uid]) return state;
      return state.updateIn(['sessions'], (sessions: nliState['sessions']) => {
        const mutable = sessions.asMutable();
        delete mutable[action.uid];
        return mutable;
      });
    default:
      return state;
  }
};

export default reducer;
