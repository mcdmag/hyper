import type {NliAuthState, NliDisplayState, OptionId, SessionUid} from '../nli';

export const NLI_OPEN_SETUP = 'NLI_OPEN_SETUP';
export const NLI_DISMISS = 'NLI_DISMISS';
export const NLI_RECEIVE_STATE = 'NLI_RECEIVE_STATE';
export const NLI_RECEIVE_AUTH = 'NLI_RECEIVE_AUTH';
export const NLI_SELECT_OPTION = 'NLI_SELECT_OPTION';
export const NLI_BEGIN_EDIT = 'NLI_BEGIN_EDIT';
export const NLI_UPDATE_EDIT = 'NLI_UPDATE_EDIT';
export const NLI_END_EDIT = 'NLI_END_EDIT';
export const NLI_ARM_HIGH_RISK = 'NLI_ARM_HIGH_RISK';
export const NLI_LOGIN_STARTED = 'NLI_LOGIN_STARTED';

export interface NliOpenSetupAction {
  readonly type: typeof NLI_OPEN_SETUP;
  readonly sessionUid: SessionUid;
}

export interface NliDismissAction {
  readonly type: typeof NLI_DISMISS;
  readonly sessionUid: SessionUid;
}

export interface NliReceiveStateAction {
  readonly type: typeof NLI_RECEIVE_STATE;
  readonly state: NliDisplayState;
}

export interface NliReceiveAuthAction {
  readonly type: typeof NLI_RECEIVE_AUTH;
  readonly sessionUid: SessionUid;
  readonly auth: NliAuthState;
}

export interface NliSelectOptionAction {
  readonly type: typeof NLI_SELECT_OPTION;
  readonly sessionUid: SessionUid;
  readonly optionId: OptionId;
}

export interface NliBeginEditAction {
  readonly type: typeof NLI_BEGIN_EDIT;
  readonly sessionUid: SessionUid;
}

export interface NliUpdateEditAction {
  readonly type: typeof NLI_UPDATE_EDIT;
  readonly sessionUid: SessionUid;
  readonly value: string;
}

export interface NliEndEditAction {
  readonly type: typeof NLI_END_EDIT;
  readonly sessionUid: SessionUid;
}

export interface NliArmHighRiskAction {
  readonly type: typeof NLI_ARM_HIGH_RISK;
  readonly sessionUid: SessionUid;
}

export interface NliLoginStartedAction {
  readonly type: typeof NLI_LOGIN_STARTED;
  readonly sessionUid: SessionUid;
}

export type NliActions =
  | NliOpenSetupAction
  | NliDismissAction
  | NliReceiveStateAction
  | NliReceiveAuthAction
  | NliSelectOptionAction
  | NliBeginEditAction
  | NliUpdateEditAction
  | NliEndEditAction
  | NliArmHighRiskAction
  | NliLoginStartedAction;
