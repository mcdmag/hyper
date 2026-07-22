import {mkdir} from 'fs/promises';
import {join} from 'path';
import {pathToFileURL} from 'url';

import {chromium} from 'playwright';

const root = join(__dirname, '..');
const mockupUrl = pathToFileURL(join(root, 'docs', 'mockups', 'nli-shell-first.html'));
const outputDirectory = join(root, 'dist', 'tmp', 'nli-mockups');

const fixtures = [
  {
    name: 'desktop-disabled-setup',
    query: '?state=disabled-setup&fixture=desktop',
    viewport: {width: 900, height: 720}
  },
  {
    name: 'narrow-alternatives',
    query: '?state=alternatives&fixture=narrow',
    viewport: {width: 320, height: 720}
  }
] as const;

const capture = async () => {
  await mkdir(outputDirectory, {recursive: true});
  const browser = await chromium.launch({headless: true});

  try {
    for (const fixture of fixtures) {
      const page = await browser.newPage({
        viewport: fixture.viewport,
        deviceScaleFactor: 1,
        colorScheme: 'dark',
        reducedMotion: 'reduce'
      });
      const url = new URL(mockupUrl.href);
      url.search = fixture.query;
      await page.goto(url.href, {waitUntil: 'load'});
      await page.waitForFunction(() => document.documentElement.dataset.ready === 'true');
      await page.screenshot({
        path: join(outputDirectory, `${fixture.name}.png`),
        fullPage: false,
        animations: 'disabled'
      });
      await page.keyboard.press('Escape');
      const escapeRestoredTerminal = await page.evaluate(() => {
        const panel = document.getElementById('nli-panel');
        return (
          panel?.hidden === true && panel.childElementCount === 0 && document.activeElement?.id === 'terminal-focus'
        );
      });
      if (!escapeRestoredTerminal) {
        throw new Error(`Escape did not dismiss the ${fixture.name} panel and restore terminal focus`);
      }
      await page.close();
    }
  } finally {
    await browser.close();
  }
};

void capture();
