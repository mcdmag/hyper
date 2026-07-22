import {promises as fs} from 'fs';
import {dirname, join} from 'path';

import type {NliPrivacyPreferences} from '../../typings/nli';

export const NLI_PRIVACY_NOTICE_VERSION = 1 as const;
export const NLI_PREFERENCES_RELATIVE_PATH = join('nli', 'preferences.json');

export const DEFAULT_NLI_PRIVACY_PREFERENCES: Readonly<NliPrivacyPreferences> = Object.freeze({
  privacyNoticeVersion: NLI_PRIVACY_NOTICE_VERSION,
  includeWorkingDirectory: false,
  includeGitMetadata: false
});

export interface NliPreferencesFileSystem {
  readFile(path: string, encoding: BufferEncoding): Promise<string>;
  writeFile(path: string, data: string, encoding: BufferEncoding): Promise<void>;
  mkdir(path: string, options: {recursive: true}): Promise<unknown>;
  rename(oldPath: string, newPath: string): Promise<void>;
  rm(path: string, options: {force: true}): Promise<void>;
}

export interface NliPreferencesStore {
  readonly path: string;
  load(): Promise<NliPrivacyPreferences | null>;
  save(preferences: Omit<NliPrivacyPreferences, 'privacyNoticeVersion'>): Promise<NliPrivacyPreferences>;
  reset(): Promise<void>;
}

const isPreferences = (value: unknown): value is NliPrivacyPreferences => {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const preferences = value as Partial<NliPrivacyPreferences>;
  return (
    preferences.privacyNoticeVersion === NLI_PRIVACY_NOTICE_VERSION &&
    typeof preferences.includeWorkingDirectory === 'boolean' &&
    typeof preferences.includeGitMetadata === 'boolean'
  );
};

export const getNliPreferencesPath = (userDataPath: string) => join(userDataPath, NLI_PREFERENCES_RELATIVE_PATH);

export const createNliPreferencesStore = (
  userDataPath: string,
  fileSystem: NliPreferencesFileSystem = fs
): NliPreferencesStore => {
  const path = getNliPreferencesPath(userDataPath);

  return {
    path,
    async load() {
      try {
        const parsed: unknown = JSON.parse(await fileSystem.readFile(path, 'utf8'));
        return isPreferences(parsed) ? Object.freeze({...parsed}) : null;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
          return null;
        }
        return null;
      }
    },
    async save(preferences) {
      const normalized: NliPrivacyPreferences = Object.freeze({
        privacyNoticeVersion: NLI_PRIVACY_NOTICE_VERSION,
        includeWorkingDirectory: preferences.includeWorkingDirectory,
        includeGitMetadata: preferences.includeGitMetadata
      });
      const temporaryPath = `${path}.tmp`;
      await fileSystem.mkdir(dirname(path), {recursive: true});
      await fileSystem.writeFile(temporaryPath, `${JSON.stringify(normalized, null, 2)}\n`, 'utf8');
      await fileSystem.rename(temporaryPath, path);
      return normalized;
    },
    async reset() {
      await fileSystem.rm(path, {force: true});
    }
  };
};
