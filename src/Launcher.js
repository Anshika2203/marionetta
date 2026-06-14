import {spawn} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {findChrome} from './findChrome.js';
import {Connection} from './Connection.js';
import {Browser} from './Browser.js';

// A pragmatic subset of the flags Chrome is normally launched with for
// automation: quiet, deterministic, and friendly to headless/CI environments.
const DEFAULT_ARGS = [
  '--disable-background-networking',
  '--disable-background-timer-throttling',
  '--disable-backgrounding-occluded-windows',
  '--disable-breakpad',
  '--disable-client-side-phishing-detection',
  '--disable-default-apps',
  '--disable-dev-shm-usage',
  '--disable-extensions',
  '--disable-hang-monitor',
  '--disable-popup-blocking',
  '--disable-prompt-on-repost',
  '--disable-renderer-backgrounding',
  '--disable-sync',
  '--metrics-recording-only',
  '--no-first-run',
  '--no-default-browser-check',
  '--enable-automation',
  '--password-store=basic',
  '--use-mock-keychain',
  '--mute-audio',
];

/**
 * Launch Chrome and connect to it.
 *
 * @param {object} [options]
 * @param {boolean} [options.headless=true]  Run without a visible window.
 * @param {string}  [options.executablePath] Path to Chrome (auto-detected if omitted).
 * @param {string[]}[options.args]           Extra command-line flags for Chrome.
 * @param {boolean} [options.dumpio=false]   Pipe Chrome's stdout/stderr to the console.
 * @param {{width:number,height:number}} [options.defaultViewport]
 * @returns {Promise<Browser>}
 */
export async function launch(options = {}) {
  const {
    headless = true,
    executablePath = findChrome(),
    args = [],
    dumpio = false,
    defaultViewport = {width: 1280, height: 800},
  } = options;

  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'marionetta-'));

  const chromeArgs = [
    ...DEFAULT_ARGS,
    `--user-data-dir=${userDataDir}`,
    '--remote-debugging-port=0',
    ...(headless ? ['--headless=new', '--hide-scrollbars'] : []),
    `--window-size=${defaultViewport.width},${defaultViewport.height}`,
    ...args,
    'about:blank',
  ];

  const chromeProcess = spawn(executablePath, chromeArgs, {
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  if (dumpio) {
    chromeProcess.stdout.pipe(process.stdout);
    chromeProcess.stderr.pipe(process.stderr);
  }

  let connection;
  try {
    const browserWSEndpoint = await waitForWSEndpoint(chromeProcess, 30000);
    connection = await Connection.create(browserWSEndpoint);
  } catch (error) {
    chromeProcess.kill('SIGKILL');
    fs.rmSync(userDataDir, {recursive: true, force: true});
    throw error;
  }

  return Browser._create(connection, chromeProcess, userDataDir, defaultViewport);
}

// Chrome prints "DevTools listening on ws://127.0.0.1:<port>/devtools/browser/<id>"
// to stderr once the remote-debugging endpoint is ready. We grab that URL.
function waitForWSEndpoint(chromeProcess, timeout) {
  return new Promise((resolve, reject) => {
    let stderr = '';

    const timer = setTimeout(() => {
      cleanup();
      reject(
        new Error(
          `Timed out after ${timeout}ms waiting for Chrome to start.\n${stderr}`,
        ),
      );
    }, timeout);

    const onData = data => {
      stderr += data.toString();
      const match = stderr.match(/DevTools listening on (ws:\/\/.*)/);
      if (match) {
        cleanup();
        resolve(match[1].trim());
      }
    };

    const onExit = code => {
      cleanup();
      reject(
        new Error(`Chrome exited (code ${code}) before becoming ready.\n${stderr}`),
      );
    };

    function cleanup() {
      clearTimeout(timer);
      chromeProcess.stderr.off('data', onData);
      chromeProcess.off('exit', onExit);
    }

    chromeProcess.stderr.on('data', onData);
    chromeProcess.once('exit', onExit);
  });
}
