import {createSelector} from 'reselect';

import type {HyperState} from '../typings/hyper';
import type {SessionUid} from '../typings/nli';

const getTermGroups = ({termGroups}: Pick<HyperState, 'termGroups'>) => termGroups.termGroups;
export const getRootGroups = createSelector(getTermGroups, (termGroups) =>
  Object.keys(termGroups)
    .map((uid) => termGroups[uid])
    .filter(({parentUid}) => !parentUid)
);

export const getNliSession = (state: HyperState, sessionUid: SessionUid) => state.nli.sessions[sessionUid];

export const isNliShellSupported = (shell: string | null) =>
  typeof shell === 'string' && /(?:^|[\\/])(?:powershell|pwsh)(?:\.exe)?$/i.test(shell);
