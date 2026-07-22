module.exports = {
  files: ['test/unit/*'],
  extensions: ['ts'],
  require: ['ts-node/register/transpile-only'],
  // AVA workers contend on a shared ts-node cache file in Windows worktrees.
  concurrency: process.platform === 'win32' ? 1 : 0
};
