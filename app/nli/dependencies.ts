import {spawn} from 'child_process';
import {randomBytes} from 'crypto';

import type {NliChildProcessFactory, NliClock, NliDependencies, NliNonceSource, NliProvider} from '../../typings/nli';

export const systemClock: NliClock = {
  now: () => Date.now(),
  setTimeout: (callback, delayMs) => setTimeout(callback, delayMs),
  clearTimeout: (handle) => clearTimeout(handle as NodeJS.Timeout)
};

export const nodeChildProcessFactory: NliChildProcessFactory = {
  spawn: (executable, args, options) => spawn(executable, [...args], options)
};

export const cryptoNonceSource: NliNonceSource = {
  create: (bytes = 32) => randomBytes(bytes).toString('hex')
};

export const createNliDependencies = (providerFactory: () => NliProvider): NliDependencies => ({
  clock: systemClock,
  childProcessFactory: nodeChildProcessFactory,
  nonceSource: cryptoNonceSource,
  providerFactory
});
