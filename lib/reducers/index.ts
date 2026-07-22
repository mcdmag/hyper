import {combineReducers} from 'redux';
import type {Reducer} from 'redux';

import type {HyperActions, HyperState} from '../../typings/hyper';

import nli from './nli';
import sessions from './sessions';
import termGroups from './term-groups';
import ui from './ui';

export default combineReducers({
  ui,
  sessions,
  termGroups,
  nli
}) as Reducer<HyperState, HyperActions>;
