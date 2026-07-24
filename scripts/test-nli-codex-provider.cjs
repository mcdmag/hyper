const {mkdtemp, rm} = require('fs/promises');
const {tmpdir} = require('os');
const path = require('path');

async function main() {
  if (process.argv.length !== 3 || !process.argv[2]) {
    process.exitCode = 2;
    return;
  }

  let provider;
  let userDataPath;
  try {
    const {CodexAppServerProvider} = require(path.join(__dirname, '..', 'target', 'nli', 'codex-app-server.js'));
    const {nodeChildProcessFactory} = require(path.join(__dirname, '..', 'target', 'nli', 'dependencies.js'));
    userDataPath = await mkdtemp(path.join(tmpdir(), 'hyper-nli-provider-smoke-'));
    provider = new CodexAppServerProvider({
      executable: process.argv[2],
      userDataPath,
      requestTimeoutMs: 30000,
      maxOptions: 3,
      childProcessFactory: nodeChildProcessFactory,
      openExternal: () => Promise.reject(new Error('Browser login is disabled in the provider smoke'))
    });
    const state = await provider.getAuthStatus();
    if (state.status !== 'signed-out' && state.status !== 'signed-in') {
      process.exitCode = 1;
      return;
    }
    process.stdout.write(`${state.status}\n`);
  } catch (_error) {
    process.exitCode = 1;
  } finally {
    if (provider) await provider.dispose().catch(() => undefined);
    if (userDataPath) await rm(userDataPath, {recursive: true, force: true}).catch(() => undefined);
  }
}

void main();
