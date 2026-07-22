import {readFileSync, realpathSync} from 'fs';
import {extname, sep} from 'path';

import type {
  NliAuthState,
  NliErrorCode,
  NliInterpretationContext,
  NliProvider,
  NliProviderResult
} from '../../typings/nli';

const MAX_FIXTURE_BYTES = 1024 * 1024;
const MAX_RESPONSES_PER_INPUT = 8;
const FIXTURE_ERRORS = new Set<NliErrorCode>([
  'NLI_CODEX_CRASHED',
  'NLI_OFFLINE',
  'NLI_PROVIDER_FAILED',
  'NLI_RATE_LIMIT',
  'NLI_TIMEOUT',
  'NLI_VALIDATION_FAILED'
]);

interface FixtureObject {
  readonly [key: string]: unknown;
}

type FixtureResponse = Readonly<{result: unknown; delayMs: number} | {errorCode: NliErrorCode; delayMs: number}>;

interface FixtureEntry {
  readonly submittedLine: string;
  readonly responses: readonly FixtureResponse[];
}

export class NliE2eFixtureError extends Error {
  readonly code: NliErrorCode;

  constructor(code: NliErrorCode) {
    super('Natural-language E2E fixture failed');
    this.name = 'NliE2eFixtureError';
    this.code = code;
  }
}

const fixtureError = (code: NliErrorCode = 'NLI_VALIDATION_FAILED') => new NliE2eFixtureError(code);
const isObject = (value: unknown): value is FixtureObject =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const hasExactKeys = (value: FixtureObject, expected: readonly string[]) => {
  const actual = Object.keys(value).sort();
  const sortedExpected = [...expected].sort();
  return actual.length === sortedExpected.length && actual.every((key, index) => key === sortedExpected[index]);
};

const readDelay = (value: unknown) => {
  if (value === undefined) return 0;
  if (!Number.isInteger(value) || (value as number) < 0 || (value as number) > 10_000) throw fixtureError();
  return value as number;
};

const parseResponse = (value: unknown): FixtureResponse => {
  if (!isObject(value)) throw fixtureError();
  if (hasExactKeys(value, ['result']) || hasExactKeys(value, ['result', 'delayMs'])) {
    return Object.freeze({result: value.result, delayMs: readDelay(value.delayMs)});
  }
  if (hasExactKeys(value, ['errorCode']) || hasExactKeys(value, ['errorCode', 'delayMs'])) {
    if (!FIXTURE_ERRORS.has(value.errorCode as NliErrorCode)) throw fixtureError();
    return Object.freeze({errorCode: value.errorCode as NliErrorCode, delayMs: readDelay(value.delayMs)});
  }
  throw fixtureError();
};

const parseEntry = (value: unknown): FixtureEntry => {
  if (
    !isObject(value) ||
    !hasExactKeys(value, ['version', 'submittedLine', 'responses']) ||
    value.version !== 1 ||
    typeof value.submittedLine !== 'string' ||
    value.submittedLine.trim().length === 0 ||
    value.submittedLine.length > 4096 ||
    !Array.isArray(value.responses) ||
    value.responses.length === 0 ||
    value.responses.length > MAX_RESPONSES_PER_INPUT
  ) {
    throw fixtureError();
  }
  return Object.freeze({
    submittedLine: value.submittedLine,
    responses: Object.freeze(value.responses.map(parseResponse))
  });
};

const readFixture = (fixturePath: string) => {
  const resolved = realpathSync(fixturePath);
  const fixtureSegment = `${sep}test${sep}fixtures${sep}nli${sep}`.toLocaleLowerCase('en-US');
  if (
    extname(resolved).toLocaleLowerCase('en-US') !== '.jsonl' ||
    !resolved.toLocaleLowerCase('en-US').includes(fixtureSegment)
  ) {
    throw fixtureError();
  }
  const contents = readFileSync(resolved, 'utf8');
  if (!contents || Buffer.byteLength(contents, 'utf8') > MAX_FIXTURE_BYTES) throw fixtureError();
  const entries = contents
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0)
    .map((line) => {
      try {
        return parseEntry(JSON.parse(line));
      } catch (error) {
        if (error instanceof NliE2eFixtureError) throw error;
        throw fixtureError();
      }
    });
  if (entries.length === 0 || new Set(entries.map((entry) => entry.submittedLine)).size !== entries.length) {
    throw fixtureError();
  }
  return new Map(entries.map((entry) => [entry.submittedLine, entry] as const));
};

const waitForFixture = (delayMs: number, signal: AbortSignal) => {
  if (signal.aborted) return Promise.reject(fixtureError('NLI_CANCELLED'));
  if (delayMs === 0) return Promise.resolve();
  return new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      signal.removeEventListener('abort', abort);
      resolve();
    }, delayMs);
    const abort = () => {
      clearTimeout(timeout);
      signal.removeEventListener('abort', abort);
      reject(fixtureError('NLI_CANCELLED'));
    };
    signal.addEventListener('abort', abort, {once: true});
  });
};

/** Test-only proposal provider. It is unreachable unless the explicit environment variable names a committed fixture. */
export class NliE2eFixtureProvider implements NliProvider {
  private readonly entries: ReadonlyMap<string, FixtureEntry>;
  private readonly calls = new Map<string, number>();
  private signedIn = false;

  constructor(fixturePath: string) {
    this.entries = readFixture(fixturePath);
  }

  getAuthStatus(signal?: AbortSignal): Promise<NliAuthState> {
    if (signal?.aborted) return Promise.reject(fixtureError('NLI_CANCELLED'));
    return Promise.resolve(
      this.signedIn ? {status: 'signed-in', accountLabel: 'Deterministic E2E fixture'} : {status: 'signed-out'}
    );
  }

  login(signal?: AbortSignal): Promise<NliAuthState> {
    if (signal?.aborted) return Promise.reject(fixtureError('NLI_CANCELLED'));
    this.signedIn = true;
    return this.getAuthStatus(signal);
  }

  cancelLogin(): Promise<void> {
    this.signedIn = false;
    return Promise.resolve();
  }

  logout(): Promise<void> {
    this.signedIn = false;
    return Promise.resolve();
  }

  async interpret(context: NliInterpretationContext, signal: AbortSignal): Promise<NliProviderResult> {
    if (!this.signedIn) throw fixtureError('NLI_AUTH_REQUIRED');
    const entry = this.entries.get(context.submittedLine);
    if (!entry) throw fixtureError('NLI_PROVIDER_FAILED');
    const call = this.calls.get(context.submittedLine) || 0;
    this.calls.set(context.submittedLine, call + 1);
    const response = entry.responses[Math.min(call, entry.responses.length - 1)];
    await waitForFixture(response.delayMs, signal);
    if ('errorCode' in response) throw fixtureError(response.errorCode);
    return response.result as NliProviderResult;
  }

  dispose(): Promise<void> {
    this.calls.clear();
    this.signedIn = false;
    return Promise.resolve();
  }
}
