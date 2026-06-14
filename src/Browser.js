import fs from 'node:fs';
import {Page} from './Page.js';

/** Represents a running Chrome instance you control. */
export class Browser {
  #connection;
  #process;
  #userDataDir;
  #defaultViewport;

  static _create(connection, process, userDataDir, defaultViewport) {
    const browser = new Browser();
    browser.#connection = connection;
    browser.#process = process;
    browser.#userDataDir = userDataDir;
    browser.#defaultViewport = defaultViewport;
    return browser;
  }

  /** Open a new tab and return a Page to drive it. */
  async newPage() {
    const {targetId} = await this.#connection.send('Target.createTarget', {
      url: 'about:blank',
    });
    const {sessionId} = await this.#connection.send('Target.attachToTarget', {
      targetId,
      flatten: true,
    });
    const session = this.#connection.session(sessionId);
    return Page._create(session, targetId, this.#defaultViewport);
  }

  /** The underlying child process, if you need it. */
  process() {
    return this.#process;
  }

  /** Close Chrome and clean up the temporary profile. */
  async close() {
    try {
      await this.#connection.send('Browser.close');
    } catch {
      // Browser may already be gone; fall through to hard kill.
    }
    this.#connection.close();
    if (this.#process && !this.#process.killed) {
      this.#process.kill('SIGKILL');
    }
    try {
      fs.rmSync(this.#userDataDir, {recursive: true, force: true});
    } catch {
      // Best-effort cleanup.
    }
  }
}
