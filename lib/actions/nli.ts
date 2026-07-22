import type {HyperDispatch, HyperState} from '../../typings/hyper';
import type {NliAuthState, NliDisplayState, NliPrivacyPreferences, OptionId, SessionUid} from '../../typings/nli';
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
import rpc from '../rpc';

const currentSession = (state: HyperState, sessionUid: SessionUid) => state.nli.sessions[sessionUid];

export const receiveNliState = (state: NliDisplayState) => ({type: NLI_RECEIVE_STATE, state}) as const;

export const receiveNliAuth = (sessionUid: SessionUid, auth: NliAuthState) =>
  ({type: NLI_RECEIVE_AUTH, sessionUid, auth}) as const;

export const checkNliStatus = (sessionUid: SessionUid) => {
  rpc.emit('nli status', {sessionUid});
};

export const openNliSetup = (sessionUid?: SessionUid) => (dispatch: HyperDispatch, getState: () => HyperState) => {
  const target = sessionUid || (getState().sessions.activeUid as SessionUid | null);
  if (!target) return;
  dispatch({type: NLI_OPEN_SETUP, sessionUid: target});
  checkNliStatus(target);
};

export const dismissNli = (sessionUid: SessionUid) => (dispatch: HyperDispatch, getState: () => HyperState) => {
  const current = currentSession(getState(), sessionUid);
  const display = current?.display;
  if (current?.setupOpen && current.signingIn) rpc.emit('nli cancel login', {sessionUid});
  if (display && 'attemptId' in display && display.attemptId) {
    rpc.emit('nli cancel', {sessionUid, attemptId: display.attemptId});
  }
  dispatch({type: NLI_DISMISS, sessionUid});
};

export const selectNliOption = (sessionUid: SessionUid, optionId: OptionId) =>
  ({type: NLI_SELECT_OPTION, sessionUid, optionId}) as const;

export const beginNliEdit = (sessionUid: SessionUid) => ({type: NLI_BEGIN_EDIT, sessionUid}) as const;

export const updateNliEdit = (sessionUid: SessionUid, value: string) =>
  ({type: NLI_UPDATE_EDIT, sessionUid, value}) as const;

export const cancelNliEdit = (sessionUid: SessionUid) => ({type: NLI_END_EDIT, sessionUid}) as const;

export const saveNliEdit = (sessionUid: SessionUid) => (dispatch: HyperDispatch, getState: () => HyperState) => {
  const current = currentSession(getState(), sessionUid);
  if (current?.display?.status !== 'review' || !current.selectedOptionId) return;
  rpc.emit('nli edit', {
    sessionUid,
    attemptId: current.display.attemptId,
    planId: current.display.planId,
    optionId: current.selectedOptionId,
    editRevision: current.display.editRevision,
    shellText: current.editText
  });
  dispatch({type: NLI_END_EDIT, sessionUid});
};

export const approveNli = (sessionUid: SessionUid) => (dispatch: HyperDispatch, getState: () => HyperState) => {
  const current = currentSession(getState(), sessionUid);
  if (current?.display?.status !== 'review' || !current.selectedOptionId) return;
  const option = current.display.options.find((candidate) => candidate.optionId === current.selectedOptionId);
  if (!option) return;
  const highRisk = option.risk.requiresSecondConfirmation;
  rpc.emit('nli approve', {
    sessionUid,
    attemptId: current.display.attemptId,
    planId: current.display.planId,
    optionId: current.selectedOptionId,
    editRevision: current.display.editRevision,
    highRiskConfirmation: highRisk && current.highRiskArmed
  });
  if (highRisk && !current.highRiskArmed) dispatch({type: NLI_ARM_HIGH_RISK, sessionUid});
};

export const rejectNli = (sessionUid: SessionUid) => (_dispatch: HyperDispatch, getState: () => HyperState) => {
  const display = currentSession(getState(), sessionUid)?.display;
  if (display?.status !== 'review' && display?.status !== 'clarification') return;
  rpc.emit('nli reject', {sessionUid, attemptId: display.attemptId, planId: display.planId});
};

export const clarifyNli =
  (sessionUid: SessionUid, optionId: OptionId) => (_dispatch: HyperDispatch, getState: () => HyperState) => {
    const display = currentSession(getState(), sessionUid)?.display;
    if (display?.status !== 'clarification') return;
    rpc.emit('nli clarify', {sessionUid, attemptId: display.attemptId, planId: display.planId, optionId});
  };

export const retryNli = (sessionUid: SessionUid) => (_dispatch: HyperDispatch, getState: () => HyperState) => {
  const display = currentSession(getState(), sessionUid)?.display;
  if (!display || !('attemptId' in display) || !display.attemptId) return;
  rpc.emit('nli retry', {sessionUid, attemptId: display.attemptId});
};

export const loginNli = (sessionUid: SessionUid) => (dispatch: HyperDispatch) => {
  dispatch({type: NLI_LOGIN_STARTED, sessionUid});
  rpc.emit('nli login', {sessionUid});
};

export const logoutNli = (sessionUid: SessionUid) => {
  rpc.emit('nli logout', {sessionUid});
};

export const saveNliPrivacy = (
  sessionUid: SessionUid,
  preferences: Omit<NliPrivacyPreferences, 'privacyNoticeVersion'>
) => {
  rpc.emit('nli privacy', {sessionUid, preferences});
};

export const resetNliPrivacy = (sessionUid: SessionUid) => {
  rpc.emit('nli reset privacy', {sessionUid});
};

export const openNliConfig = () => {
  rpc.emit('command', 'window:preferences');
};
