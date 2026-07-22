import {spawn} from 'child_process';
import type {ChildProcessWithoutNullStreams} from 'child_process';

import type {NliGitMetadata} from '../../typings/nli';

const MAX_OUTPUT_CHARS = 4096;

export interface NliMetadataProcessFactory {
  spawn(executable: string, args: readonly string[], options: {cwd: string}): ChildProcessWithoutNullStreams;
}

const systemProcessFactory: NliMetadataProcessFactory = {
  spawn: (executable, args, options) =>
    spawn(executable, [...args], {
      cwd: options.cwd,
      shell: false,
      windowsHide: true,
      stdio: 'pipe'
    })
};

interface CommandResult {
  readonly exitCode: number | null;
  readonly output: string;
  readonly hasOutput: boolean;
}

const run = (
  factory: NliMetadataProcessFactory,
  executable: string,
  args: readonly string[],
  cwd: string,
  signal: AbortSignal,
  captureOutput = true
) =>
  new Promise<CommandResult>((resolve) => {
    if (signal.aborted) {
      resolve({exitCode: null, output: '', hasOutput: false});
      return;
    }
    let child: ChildProcessWithoutNullStreams;
    try {
      child = factory.spawn(executable, args, {cwd});
    } catch (_error) {
      resolve({exitCode: null, output: '', hasOutput: false});
      return;
    }
    let output = '';
    let hasOutput = false;
    let settled = false;
    const finish = (exitCode: number | null) => {
      if (settled) return;
      settled = true;
      signal.removeEventListener('abort', abort);
      resolve({exitCode, output, hasOutput});
    };
    const abort = () => {
      child.kill();
      finish(null);
    };
    signal.addEventListener('abort', abort, {once: true});
    child.stdin.end();
    child.stderr.resume();
    if (captureOutput) child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk: string | Buffer) => {
      hasOutput ||= chunk.length > 0;
      if (captureOutput && output.length < MAX_OUTPUT_CHARS) {
        const text = typeof chunk === 'string' ? chunk : chunk.toString('utf8');
        output += text.slice(0, MAX_OUTPUT_CHARS - output.length);
      }
    });
    child.once('error', () => finish(null));
    child.once('close', (code) => finish(code));
  });

export const collectNliGitMetadata = async (
  workingDirectory: string,
  signal: AbortSignal,
  factory: NliMetadataProcessFactory = systemProcessFactory
): Promise<NliGitMetadata> => {
  const inside = await run(factory, 'git', ['rev-parse', '--is-inside-work-tree'], workingDirectory, signal);
  const isRepository = inside.exitCode === 0 && inside.output.trim() === 'true';
  if (!isRepository || signal.aborted) {
    return Object.freeze({
      isRepository: false,
      hasStaged: false,
      hasUnstaged: false,
      hasUntracked: false,
      hasRemote: false,
      ghAvailable: false
    });
  }

  const [branch, staged, unstaged, untracked, remotes, gh] = await Promise.all([
    run(factory, 'git', ['branch', '--show-current'], workingDirectory, signal),
    run(factory, 'git', ['diff', '--cached', '--quiet', '--exit-code'], workingDirectory, signal),
    run(factory, 'git', ['diff', '--quiet', '--exit-code'], workingDirectory, signal),
    run(factory, 'git', ['ls-files', '--others', '--exclude-standard'], workingDirectory, signal, false),
    run(factory, 'git', ['remote'], workingDirectory, signal, false),
    run(factory, 'gh', ['--version'], workingDirectory, signal, false)
  ]);

  const branchName = branch.exitCode === 0 ? branch.output.trim().slice(0, 255) : '';
  return Object.freeze({
    isRepository: true,
    ...(branchName ? {branch: branchName} : {}),
    hasStaged: staged.exitCode === 1,
    hasUnstaged: unstaged.exitCode === 1,
    hasUntracked: untracked.exitCode === 0 && untracked.hasOutput,
    hasRemote: remotes.exitCode === 0 && remotes.hasOutput,
    ghAvailable: gh.exitCode === 0
  });
};
