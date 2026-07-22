import {createHash} from 'crypto';
import {posix, win32} from 'path';

import type {NliClock, ShellSemanticEvent} from '../../typings/nli';

const OSC_PREFIX = '\u001b]1337;HyperNLI;1;';
const OSC_TERMINATOR = '\u0007';
const MAX_PATH_CHARS = 32768;
const MAX_TRACKED_EVENTS = 512;

interface PowerShellMarkerV1 {
  readonly v: 1;
  readonly windowUid: string;
  readonly sessionUid: string;
  readonly callbackId: string;
  readonly reason: 'command-not-found';
  readonly submittedLine: string;
  readonly shellVersion: string;
  readonly historyId?: string;
  readonly providerName: string;
  readonly providerPath: string;
}

export interface OscEventParserOptions {
  readonly windowUid: string;
  readonly sessionUid: string;
  readonly nonce: string;
  readonly maxInputChars: number;
  readonly includeWorkingDirectory: boolean;
  readonly now?: () => number;
  readonly platform?: NodeJS.Platform;
}

export type OscParseToken =
  | {readonly kind: 'visible'; readonly data: string}
  | {readonly kind: 'semantic'; readonly event: ShellSemanticEvent};

export interface OscParseResult {
  readonly visible: string;
  readonly events: readonly ShellSemanticEvent[];
}

const longestPrefixSuffix = (value: string, prefix: string) => {
  const max = Math.min(value.length, prefix.length - 1);
  for (let length = max; length > 0; length--) {
    if (value.endsWith(prefix.slice(0, length))) {
      return length;
    }
  }
  return 0;
};

const isBoundedString = (value: unknown, max: number): value is string =>
  typeof value === 'string' && value.length > 0 && value.length <= max;

const hasExactKeys = (value: Record<string, unknown>) => {
  const allowed = new Set([
    'v',
    'windowUid',
    'sessionUid',
    'callbackId',
    'reason',
    'submittedLine',
    'shellVersion',
    'historyId',
    'providerName',
    'providerPath'
  ]);
  return Object.keys(value).every((key) => allowed.has(key));
};

export const fingerprintWorkingDirectory = (
  providerPath: string,
  providerName = 'FileSystem',
  platform: NodeJS.Platform = process.platform
) => {
  const normalizedPath =
    platform === 'win32'
      ? win32
          .normalize(providerPath)
          .replace(/[\\/]+$/, '')
          .toLocaleLowerCase('en-US')
      : posix.normalize(providerPath).replace(/\/+$/, '');
  return createHash('sha256').update(`${providerName}\u0000${normalizedPath}`, 'utf8').digest('hex');
};

export class OscEventParser {
  private readonly options: OscEventParserOptions;
  private readonly maxFrameChars: number;
  private readonly now: () => number;
  private buffer = '';
  private transparentUntilTerminator = false;
  private readonly callbacks = new Map<string, number>();
  private readonly attempts = new Map<string, number>();

  constructor(options: OscEventParserOptions) {
    this.options = Object.freeze({...options});
    this.maxFrameChars = Math.max(4096, Math.min(options.maxInputChars * 8 + 65536, 524288));
    this.now = options.now || Date.now;
  }

  push(chunk: string): OscParseResult {
    const tokens = this.pushTokens(chunk);
    return Object.freeze({
      visible: tokens
        .filter((token): token is Extract<OscParseToken, {kind: 'visible'}> => token.kind === 'visible')
        .map((token) => token.data)
        .join(''),
      events: Object.freeze(
        tokens
          .filter((token): token is Extract<OscParseToken, {kind: 'semantic'}> => token.kind === 'semantic')
          .map((token) => token.event)
      )
    });
  }

  pushTokens(chunk: string): readonly OscParseToken[] {
    const original = this.buffer + chunk;
    try {
      return this.parse(chunk);
    } catch (_error) {
      this.buffer = '';
      this.transparentUntilTerminator = false;
      return original ? [{kind: 'visible', data: original}] : [];
    }
  }

  finish(): readonly OscParseToken[] {
    const visible = this.buffer;
    this.buffer = '';
    this.transparentUntilTerminator = false;
    return visible ? [{kind: 'visible', data: visible}] : [];
  }

  reset() {
    this.buffer = '';
    this.transparentUntilTerminator = false;
    this.callbacks.clear();
    this.attempts.clear();
  }

  private parse(chunk: string): readonly OscParseToken[] {
    this.buffer += chunk;
    const tokens: OscParseToken[] = [];
    const emitVisible = (data: string) => {
      if (!data) return;
      const prior = tokens[tokens.length - 1];
      if (prior?.kind === 'visible') {
        tokens[tokens.length - 1] = {
          kind: 'visible',
          data: prior.data + data
        };
      } else {
        tokens.push({kind: 'visible', data});
      }
    };

    while (this.buffer) {
      if (this.transparentUntilTerminator) {
        const belIndex = this.buffer.indexOf(OSC_TERMINATOR);
        const stIndex = this.buffer.indexOf('\u001b\\');
        const terminatorIndex = belIndex === -1 ? stIndex : stIndex === -1 ? belIndex : Math.min(belIndex, stIndex);
        if (terminatorIndex === -1) {
          const retainEscape = this.buffer.endsWith('\u001b') ? 1 : 0;
          emitVisible(this.buffer.slice(0, this.buffer.length - retainEscape));
          this.buffer = this.buffer.slice(this.buffer.length - retainEscape);
          break;
        }
        const terminatorLength = terminatorIndex === stIndex ? 2 : 1;
        emitVisible(this.buffer.slice(0, terminatorIndex + terminatorLength));
        this.buffer = this.buffer.slice(terminatorIndex + terminatorLength);
        this.transparentUntilTerminator = false;
        continue;
      }

      const markerIndex = this.buffer.indexOf(OSC_PREFIX);
      if (markerIndex === -1) {
        const retainedLength = longestPrefixSuffix(this.buffer, OSC_PREFIX);
        emitVisible(this.buffer.slice(0, this.buffer.length - retainedLength));
        this.buffer = this.buffer.slice(this.buffer.length - retainedLength);
        break;
      }

      emitVisible(this.buffer.slice(0, markerIndex));
      this.buffer = this.buffer.slice(markerIndex);
      const belIndex = this.buffer.indexOf(OSC_TERMINATOR, OSC_PREFIX.length);
      const stIndex = this.buffer.indexOf('\u001b\\', OSC_PREFIX.length);
      const terminatorIndex = belIndex === -1 ? stIndex : stIndex === -1 ? belIndex : Math.min(belIndex, stIndex);
      if (terminatorIndex === -1) {
        if (this.buffer.length > this.maxFrameChars) {
          emitVisible(this.buffer);
          this.buffer = '';
          this.transparentUntilTerminator = true;
        }
        break;
      }

      const terminatorLength = terminatorIndex === stIndex ? 2 : 1;
      const completeFrame = this.buffer.slice(0, terminatorIndex + terminatorLength);
      const body = this.buffer.slice(OSC_PREFIX.length, terminatorIndex);
      this.buffer = this.buffer.slice(terminatorIndex + terminatorLength);
      const event = this.decode(body);
      if (event) {
        if (this.accept(event)) {
          tokens.push({kind: 'semantic', event});
        }
      } else {
        emitVisible(completeFrame);
      }
    }

    return tokens;
  }

  private decode(body: string): ShellSemanticEvent | null {
    const separatorIndex = body.indexOf(';');
    if (separatorIndex <= 0 || body.indexOf(';', separatorIndex + 1) !== -1) {
      return null;
    }
    const nonce = body.slice(0, separatorIndex);
    const encoded = body.slice(separatorIndex + 1);
    if (
      nonce !== this.options.nonce ||
      !encoded ||
      encoded.length > this.maxFrameChars ||
      !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)
    ) {
      return null;
    }

    const decoded = Buffer.from(encoded, 'base64');
    if (decoded.toString('base64') !== encoded) {
      return null;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(new TextDecoder('utf-8', {fatal: true}).decode(decoded));
    } catch (_error) {
      return null;
    }
    if (
      !parsed ||
      typeof parsed !== 'object' ||
      Array.isArray(parsed) ||
      !hasExactKeys(parsed as Record<string, unknown>)
    ) {
      return null;
    }

    const marker = parsed as Partial<PowerShellMarkerV1>;
    if (
      marker.v !== 1 ||
      marker.windowUid !== this.options.windowUid ||
      marker.sessionUid !== this.options.sessionUid ||
      marker.reason !== 'command-not-found' ||
      typeof marker.callbackId !== 'string' ||
      !/^[a-fA-F0-9]{32}$/.test(marker.callbackId) ||
      !isBoundedString(marker.submittedLine, this.options.maxInputChars) ||
      !isBoundedString(marker.shellVersion, 128) ||
      !isBoundedString(marker.providerName, 128) ||
      !isBoundedString(marker.providerPath, MAX_PATH_CHARS) ||
      (marker.historyId !== undefined && !isBoundedString(marker.historyId, 128))
    ) {
      return null;
    }

    const event: ShellSemanticEvent = {
      windowUid: marker.windowUid,
      sessionUid: marker.sessionUid as ShellSemanticEvent['sessionUid'],
      callbackId: marker.callbackId as ShellSemanticEvent['callbackId'],
      reason: marker.reason,
      submittedLine: marker.submittedLine,
      shellFamily: 'powershell',
      shellVersion: marker.shellVersion,
      historyId: marker.historyId,
      providerName: marker.providerName,
      cwdFingerprint: fingerprintWorkingDirectory(marker.providerPath, marker.providerName, this.options.platform)
    };
    if (this.options.includeWorkingDirectory) {
      return Object.freeze({...event, workingDirectory: marker.providerPath});
    }
    return Object.freeze(event);
  }

  private accept(event: ShellSemanticEvent) {
    const now = this.now();
    if (this.callbacks.has(event.callbackId)) {
      return false;
    }
    this.callbacks.set(event.callbackId, now);

    const identity = event.historyId
      ? `${event.windowUid}\u0000${event.sessionUid}\u0000history:${event.historyId}\u0000${event.submittedLine}`
      : `${event.windowUid}\u0000${event.sessionUid}\u0000line:${event.submittedLine}`;
    const prior = this.attempts.get(identity);
    const duplicate = prior !== undefined && (event.historyId !== undefined || now - prior <= 100);
    this.attempts.set(identity, now);
    this.prune(now);
    return !duplicate;
  }

  private prune(now: number) {
    for (const [key, timestamp] of this.callbacks) {
      if (this.callbacks.size <= MAX_TRACKED_EVENTS && now - timestamp <= 60000) break;
      this.callbacks.delete(key);
    }
    for (const [key, timestamp] of this.attempts) {
      if (this.attempts.size <= MAX_TRACKED_EVENTS && now - timestamp <= 60000) break;
      this.attempts.delete(key);
    }
  }
}

export interface ShellSemanticEventGateOptions {
  readonly clock: NliClock;
  readonly emit: (event: ShellSemanticEvent) => void;
  readonly timeoutMs?: number;
}

export class ShellSemanticEventGate {
  private readonly options: ShellSemanticEventGateOptions;
  private readonly pending = new Map<string, {event: ShellSemanticEvent; timer: unknown}>();

  constructor(options: ShellSemanticEventGateOptions) {
    this.options = options;
  }

  queue(events: readonly ShellSemanticEvent[]) {
    for (const event of events) {
      const existing = this.pending.get(event.callbackId);
      if (existing) {
        this.options.clock.clearTimeout(existing.timer);
      }
      const timer = this.options.clock.setTimeout(() => this.cancel(event.callbackId), this.options.timeoutMs || 250);
      this.pending.set(event.callbackId, {event, timer});
    }
  }

  afterVisibleOutput(flushVisibleNow: () => void) {
    if (!this.pending.size) {
      return;
    }
    flushVisibleNow();
    const queued = [...this.pending.values()];
    this.pending.clear();
    for (const {event, timer} of queued) {
      this.options.clock.clearTimeout(timer);
      this.options.emit(event);
    }
  }

  dispose() {
    for (const {timer} of this.pending.values()) {
      this.options.clock.clearTimeout(timer);
    }
    this.pending.clear();
  }

  private cancel(callbackId: string) {
    const pending = this.pending.get(callbackId);
    if (pending) {
      this.options.clock.clearTimeout(pending.timer);
      this.pending.delete(callbackId);
    }
  }
}
