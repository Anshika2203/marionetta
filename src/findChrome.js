import fs from 'node:fs';

// Standard install locations for Chrome / Chromium on each platform.
const CHROME_PATHS = {
  darwin: [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
  ],
  win32: [
    `${process.env['PROGRAMFILES']}\\Google\\Chrome\\Application\\chrome.exe`,
    `${process.env['PROGRAMFILES(X86)']}\\Google\\Chrome\\Application\\chrome.exe`,
    `${process.env['LOCALAPPDATA']}\\Google\\Chrome\\Application\\chrome.exe`,
  ],
  linux: [
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
  ],
};

export function findChrome() {
  const fromEnv = process.env['CHROME_PATH'];
  if (fromEnv && fs.existsSync(fromEnv)) {
    return fromEnv;
  }
  const candidates = CHROME_PATHS[process.platform] || [];
  for (const candidate of candidates) {
    if (candidate && fs.existsSync(candidate)) {
      return candidate;
    }
  }
  throw new Error(
    `Marionetta could not find Chrome on this system (platform: ${process.platform}).\n` +
      `Fix it one of these ways:\n` +
      `  • Install Google Chrome, or\n` +
      `  • launch({ executablePath: '/full/path/to/chrome' }), or\n` +
      `  • set the CHROME_PATH environment variable.`,
  );
}
