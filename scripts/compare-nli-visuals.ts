import {readFile} from 'fs/promises';
import {join} from 'path';
import {pathToFileURL} from 'url';

import React from 'react';

import {chromium} from 'playwright';
import {PNG} from 'pngjs';
import {renderToStaticMarkup} from 'react-dom/server';

import NliPanel, {type NliPanelProps} from '../lib/components/nli-panel';

type Pixelmatch = (
  imageA: Uint8Array,
  imageB: Uint8Array,
  output: Uint8Array,
  width: number,
  height: number,
  options?: {threshold?: number; includeAA?: boolean}
) => number;

// ts-node emits CommonJS here; preserve a native dynamic import for pixelmatch's ESM-only package.
// eslint-disable-next-line @typescript-eslint/no-implied-eval
const importEsm = new Function('specifier', 'return import(specifier)') as (
  specifier: string
) => Promise<{default: Pixelmatch}>;

const root = join(__dirname, '..');
const outputDirectory = join(root, 'dist', 'tmp', 'nli-visuals');
const referenceUrl = pathToFileURL(join(root, 'docs', 'mockups', 'nli-shell-first.html'));
const fixtureDirectory = join(root, 'test', 'fixtures', 'nli-visual');

const captures = [
  {
    name: 'desktop-disabled-setup',
    state: 'disabled-setup',
    stateFixture: 'disabled-setup.json',
    viewport: {width: 900, height: 720},
    fixture: 'desktop'
  },
  {
    name: 'narrow-single-proposal',
    state: 'single-proposal',
    stateFixture: 'single-proposal.json',
    viewport: {width: 320, height: 720},
    fixture: 'narrow'
  }
] as const;

const callbacks: Pick<
  NliPanelProps,
  | 'onDismiss'
  | 'onOpenConfig'
  | 'onCheckStatus'
  | 'onPrivacy'
  | 'onResetPrivacy'
  | 'onLogin'
  | 'onLogout'
  | 'onCancel'
  | 'onRetry'
  | 'onClarify'
  | 'onSelectOption'
  | 'onBeginEdit'
  | 'onUpdateEdit'
  | 'onSaveEdit'
  | 'onCancelEdit'
  | 'onApprove'
  | 'onReject'
  | 'onRestoreTerminalFocus'
> = {
  onDismiss() {},
  onOpenConfig() {},
  onCheckStatus() {},
  onPrivacy() {},
  onResetPrivacy() {},
  onLogin() {},
  onLogout() {},
  onCancel() {},
  onRetry() {},
  onClarify() {},
  onSelectOption() {},
  onBeginEdit() {},
  onUpdateEdit() {},
  onSaveEdit() {},
  onCancelEdit() {},
  onApprove() {},
  onReject() {},
  onRestoreTerminalFocus() {}
};

const capturePage = async (
  page: import('playwright').Page,
  path: string,
  state: (typeof captures)[number]['state'],
  fixture: (typeof captures)[number]['fixture'],
  markup?: string
) => {
  const url = new URL(referenceUrl.href);
  url.search = `?state=${state}&fixture=${fixture}`;
  await page.goto(url.href, {waitUntil: 'load'});
  await page.waitForFunction(() => document.documentElement.dataset.ready === 'true');
  await page.evaluate(() => {
    const toolbar = document.querySelector<HTMLElement>('.reference-toolbar');
    if (toolbar) toolbar.style.display = 'none';
    window.scrollTo(0, 0);
  });
  if (markup) {
    await page.evaluate((rendered) => {
      const current = document.getElementById('nli-panel');
      const holder = document.createElement('div');
      holder.innerHTML = rendered;
      const panel = holder.firstElementChild;
      if (!current || !panel) throw new Error('Built NLI panel fixture could not be mounted');
      current.replaceWith(panel);
      panel.scrollTop = 0;
      window.scrollTo(0, 0);
    }, markup);
  }
  await page.screenshot({path, fullPage: false, animations: 'disabled'});
};

const run = async () => {
  const {default: pixelmatch} = await importEsm('pixelmatch');
  const {mkdir, writeFile} = await import('fs/promises');
  await mkdir(outputDirectory, {recursive: true});
  const browser = await chromium.launch({headless: true});

  try {
    for (const capture of captures) {
      const fixture = JSON.parse(await readFile(join(fixtureDirectory, capture.stateFixture), 'utf8')) as Omit<
        NliPanelProps,
        keyof typeof callbacks
      >;
      const markup = renderToStaticMarkup(React.createElement(NliPanel, {...fixture, ...callbacks}));
      const context = await browser.newContext({
        viewport: capture.viewport,
        deviceScaleFactor: 1,
        colorScheme: 'dark',
        reducedMotion: 'reduce'
      });
      const referencePath = join(outputDirectory, `${capture.name}-mockup.png`);
      const builtPath = join(outputDirectory, `${capture.name}-built.png`);
      const page = await context.newPage();
      await capturePage(page, referencePath, capture.state, capture.fixture);
      await capturePage(page, builtPath, capture.state, capture.fixture, markup);

      const [reference, built] = await Promise.all([
        readFile(referencePath).then((buffer) => PNG.sync.read(buffer)),
        readFile(builtPath).then((buffer) => PNG.sync.read(buffer))
      ]);
      if (reference.width !== built.width || reference.height !== built.height) {
        throw new Error(`${capture.name} screenshots have different dimensions`);
      }
      const diff = new PNG({width: reference.width, height: reference.height});
      const differingPixels = pixelmatch(reference.data, built.data, diff.data, reference.width, reference.height, {
        threshold: 0.1,
        includeAA: false
      });
      const ratio = differingPixels / (reference.width * reference.height);
      await writeFile(join(outputDirectory, `${capture.name}-diff.png`), PNG.sync.write(diff));
      if (ratio > 0.02) {
        throw new Error(`${capture.name} differs from the approved mockup by ${(ratio * 100).toFixed(2)}% (limit 2%)`);
      }
      process.stdout.write(`${capture.name}: ${(ratio * 100).toFixed(2)}% differing pixels\n`);
      await context.close();
    }
  } finally {
    await browser.close();
  }
};

void run();
