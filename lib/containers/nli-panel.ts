import {connect} from 'react-redux';

import type {HyperDispatch, HyperState} from '../../typings/hyper';
import type {NliPrivacyPreferences, OptionId, SessionUid} from '../../typings/nli';
import * as nliActions from '../actions/nli';
import NliPanel from '../components/nli-panel';
import {getNliSession, isNliShellSupported} from '../selectors';

export interface NliPanelOwnProps {
  readonly sessionUid: SessionUid;
  readonly shell: string | null;
  readonly active: boolean;
}

const mapStateToProps = (state: HyperState, ownProps: NliPanelOwnProps) => ({
  enabled: state.nli.enabled,
  supportedShell: isNliShellSupported(ownProps.shell),
  session: getNliSession(state, ownProps.sessionUid),
  backgroundColor: state.ui.backgroundColor,
  foregroundColor: state.ui.foregroundColor,
  borderColor: state.ui.borderColor,
  uiFontFamily: state.ui.uiFontFamily
});

const mapDispatchToProps = (dispatch: HyperDispatch, ownProps: NliPanelOwnProps) => ({
  onDismiss: () => dispatch(nliActions.dismissNli(ownProps.sessionUid)),
  onOpenConfig: nliActions.openNliConfig,
  onCheckStatus: () => nliActions.checkNliStatus(ownProps.sessionUid),
  onPrivacy: (preferences: Omit<NliPrivacyPreferences, 'privacyNoticeVersion'>) =>
    nliActions.saveNliPrivacy(ownProps.sessionUid, preferences),
  onResetPrivacy: () => nliActions.resetNliPrivacy(ownProps.sessionUid),
  onLogin: () => dispatch(nliActions.loginNli(ownProps.sessionUid)),
  onLogout: () => nliActions.logoutNli(ownProps.sessionUid),
  onCancel: () => dispatch(nliActions.dismissNli(ownProps.sessionUid)),
  onRetry: () => dispatch(nliActions.retryNli(ownProps.sessionUid)),
  onClarify: (optionId: OptionId) => dispatch(nliActions.clarifyNli(ownProps.sessionUid, optionId)),
  onSelectOption: (optionId: OptionId) => dispatch(nliActions.selectNliOption(ownProps.sessionUid, optionId)),
  onBeginEdit: () => dispatch(nliActions.beginNliEdit(ownProps.sessionUid)),
  onUpdateEdit: (value: string) => dispatch(nliActions.updateNliEdit(ownProps.sessionUid, value)),
  onSaveEdit: () => dispatch(nliActions.saveNliEdit(ownProps.sessionUid)),
  onCancelEdit: () => dispatch(nliActions.cancelNliEdit(ownProps.sessionUid)),
  onApprove: () => dispatch(nliActions.approveNli(ownProps.sessionUid)),
  onReject: () => dispatch(nliActions.rejectNli(ownProps.sessionUid)),
  onRestoreTerminalFocus: () => window.focusActiveTerm(ownProps.sessionUid)
});

export default connect(mapStateToProps, mapDispatchToProps)(NliPanel);
