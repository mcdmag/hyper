import {readFileSync} from 'fs';
import {resolve} from 'path';

import test from 'ava';

import {createNliWindowCoordinator} from '../../app/nli/window-coordinator';
import type {NliAuthState} from '../../typings/nli';

const makeRegistration = () => {
  const auth: NliAuthState[] = [];
  let logoutCalls = 0;
  let resetCalls = 0;
  return {
    auth,
    get logoutCalls() {
      return logoutCalls;
    },
    get resetCalls() {
      return resetCalls;
    },
    registration: {
      service: {
        logout() {
          logoutCalls++;
          return Promise.resolve();
        },
        resetPrivacyPreferences() {
          resetCalls++;
          return Promise.resolve();
        }
      },
      broadcastAuth(state: NliAuthState) {
        auth.push(state);
      }
    }
  };
};

test('privacy reset and logout fan out across every registered Hyper window', async (t) => {
  const coordinator = createNliWindowCoordinator();
  const first = makeRegistration();
  const second = makeRegistration();
  coordinator.register(first.registration);
  coordinator.register(second.registration);

  await coordinator.resetPrivacy();
  await coordinator.logout();

  for (const registration of [first, second]) {
    t.is(registration.resetCalls, 1);
    t.is(registration.logoutCalls, 1);
    t.deepEqual(registration.auth, [{status: 'unknown'}, {status: 'signed-out'}]);
  }
});

test('unregistered windows cannot receive later privacy or authentication updates', async (t) => {
  const coordinator = createNliWindowCoordinator();
  const closed = makeRegistration();
  const open = makeRegistration();
  const unregister = coordinator.register(closed.registration);
  coordinator.register(open.registration);

  unregister();
  unregister();
  await coordinator.resetPrivacy();
  await coordinator.logout();

  t.is(closed.resetCalls, 0);
  t.is(closed.logoutCalls, 0);
  t.deepEqual(closed.auth, []);
  t.is(open.resetCalls, 1);
  t.is(open.logoutCalls, 1);
});

test('window RPC routes shared preference reset and logout through the coordinator', (t) => {
  const source = readFileSync(resolve(__dirname, '../../app/ui/window.ts'), 'utf8');
  t.regex(source, /rpc\.on\(NLI_RPC_EVENTS\.resetPrivacy,[\s\S]*?nliWindowCoordinator\.resetPrivacy\(\)/);
  t.regex(source, /rpc\.on\(NLI_RPC_EVENTS\.logout,[\s\S]*?nliWindowCoordinator\.logout\(\)/);
  t.regex(source, /window\.clean = \(\) => \{[\s\S]*?unregisterNliWindow\(\)/);
});
