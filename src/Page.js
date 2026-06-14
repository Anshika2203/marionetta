import fs from 'node:fs';

/** A single tab. This is the object you'll use most. */
export class Page {
  #session;
  #targetId;
  #viewport;

  static async _create(session, targetId, viewport) {
    const page = new Page();
    page.#session = session;
    page.#targetId = targetId;
    page.#viewport = viewport;
    await page.#init();
    return page;
  }

  async #init() {
    await Promise.all([
      this.#session.send('Page.enable'),
      this.#session.send('Runtime.enable'),
      this.#session.send('DOM.enable'),
    ]);
    if (this.#viewport) {
      await this.setViewport(this.#viewport);
    }
  }

  async setViewport({width, height, deviceScaleFactor = 1}) {
    await this.#session.send('Emulation.setDeviceMetricsOverride', {
      width,
      height,
      deviceScaleFactor,
      mobile: false,
    });
  }

  /** Navigate to a URL and wait for the page to load. */
  async goto(url, options = {}) {
    const navigation = this.waitForNavigation(options);
    const result = await this.#session.send('Page.navigate', {url});
    if (result.errorText) {
      navigation.catch(() => {}); // avoid an unhandled rejection on timeout
      throw new Error(`Navigation to ${url} failed: ${result.errorText}`);
    }
    await navigation;
  }

  /**
   * Wait for the next navigation to finish. Call this *before* the action that
   * triggers navigation, then await the returned promise afterwards:
   *
   *   const nav = page.waitForNavigation();
   *   await page.click('a#next');
   *   await nav;
   */
  waitForNavigation(options = {}) {
    const {timeout = 30000, waitUntil = 'load'} = options;
    const eventName =
      waitUntil === 'domcontentloaded'
        ? 'Page.domContentEventFired'
        : 'Page.loadEventFired';
    return this.#waitForEvent(eventName, timeout);
  }

  /** Go back one entry in session history. Returns the entry, or null. */
  async goBack(options = {}) {
    return this.#navigateHistory(-1, options);
  }

  /** Go forward one entry in session history. Returns the entry, or null. */
  async goForward(options = {}) {
    return this.#navigateHistory(1, options);
  }

  /**
   * Run a function (or expression string) inside the page and return the result.
   * The function is serialized and executed in the browser, not in Node.
   */
  async evaluate(fn, ...args) {
    const expression =
      typeof fn === 'function'
        ? `(${fn.toString()})(${args.map(a => JSON.stringify(a)).join(',')})`
        : fn;
    const {result, exceptionDetails} = await this.#session.send(
      'Runtime.evaluate',
      {
        expression,
        returnByValue: true,
        awaitPromise: true,
        userGesture: true,
      },
    );
    if (exceptionDetails) {
      throw new Error(
        `Evaluation failed: ${
          exceptionDetails.exception?.description || exceptionDetails.text
        }`,
      );
    }
    return result.value;
  }

  title() {
    return this.evaluate(() => document.title);
  }

  content() {
    return this.evaluate(() => document.documentElement.outerHTML);
  }

  url() {
    return this.evaluate(() => window.location.href);
  }

  /** Resolve once `selector` exists (and optionally is visible) or time out. */
  async waitForSelector(selector, options = {}) {
    const {timeout = 30000, visible = false} = options;
    const start = Date.now();
    while (Date.now() - start < timeout) {
      const found = await this.evaluate(
        (sel, mustBeVisible) => {
          const el = document.querySelector(sel);
          if (!el) {
            return false;
          }
          if (!mustBeVisible) {
            return true;
          }
          const style = window.getComputedStyle(el);
          const rect = el.getBoundingClientRect();
          return (
            style.visibility !== 'hidden' &&
            style.display !== 'none' &&
            rect.width > 0 &&
            rect.height > 0
          );
        },
        selector,
        visible,
      );
      if (found) {
        return;
      }
      await delay(50);
    }
    throw new Error(
      `waitForSelector: timeout ${timeout}ms exceeded for "${selector}"`,
    );
  }

  /** Click the first element matching `selector` with a real mouse event. */
  async click(selector, options = {}) {
    const timeout = options.timeout ?? 30000;
    await this.waitForSelector(selector, {visible: true, timeout});
    const point = await this.#centerPoint(selector);
    await this.#session.send('Input.dispatchMouseEvent', {
      type: 'mouseMoved',
      x: point.x,
      y: point.y,
    });
    await this.#session.send('Input.dispatchMouseEvent', {
      type: 'mousePressed',
      x: point.x,
      y: point.y,
      button: 'left',
      clickCount: 1,
    });
    await this.#session.send('Input.dispatchMouseEvent', {
      type: 'mouseReleased',
      x: point.x,
      y: point.y,
      button: 'left',
      clickCount: 1,
    });
  }

  /** Move the mouse over the first element matching `selector`. */
  async hover(selector, options = {}) {
    const timeout = options.timeout ?? 30000;
    await this.waitForSelector(selector, {visible: true, timeout});
    const point = await this.#centerPoint(selector);
    await this.#session.send('Input.dispatchMouseEvent', {
      type: 'mouseMoved',
      x: point.x,
      y: point.y,
    });
  }

  /**
   * Set the value(s) of a `<select>` element and fire input/change events.
   * Returns the values that ended up selected.
   */
  async select(selector, ...values) {
    await this.waitForSelector(selector, {timeout: 30000});
    return this.evaluate(
      (sel, wantedValues) => {
        const el = document.querySelector(sel);
        if (!el) {
          throw new Error(`No element matches selector: ${sel}`);
        }
        if (el.nodeName.toLowerCase() !== 'select') {
          throw new Error('select() requires a <select> element');
        }
        const wanted = new Set(wantedValues);
        for (const option of el.options) {
          option.selected = wanted.has(option.value);
        }
        el.dispatchEvent(new Event('input', {bubbles: true}));
        el.dispatchEvent(new Event('change', {bubbles: true}));
        // Read final state: a single <select> only keeps one selection, which
        // is only settled after every option has been assigned above.
        return [...el.options]
          .filter(option => option.selected)
          .map(option => option.value);
      },
      selector,
      values,
    );
  }

  /** Focus an input matching `selector` and type `text` into it. */
  async type(selector, text, options = {}) {
    const timeout = options.timeout ?? 30000;
    await this.waitForSelector(selector, {visible: true, timeout});
    await this.evaluate(sel => {
      document.querySelector(sel).focus();
    }, selector);
    const charDelay = options.delay ?? 0;
    if (charDelay > 0) {
      for (const ch of text) {
        await this.#session.send('Input.insertText', {text: ch});
        await delay(charDelay);
      }
    } else {
      await this.#session.send('Input.insertText', {text});
    }
  }

  /**
   * Capture a screenshot.
   * @param {object} [options]
   * @param {string}  [options.path]      Write the image to this file.
   * @param {'png'|'jpeg'|'webp'} [options.type='png']
   * @param {boolean} [options.fullPage=false]
   * @returns {Promise<Buffer>}
   */
  async screenshot(options = {}) {
    const {path: filePath, type = 'png', fullPage = false} = options;
    let extra = {};
    if (fullPage) {
      const metrics = await this.#session.send('Page.getLayoutMetrics');
      const size = metrics.cssContentSize || metrics.contentSize;
      extra = {
        captureBeyondViewport: true,
        clip: {x: 0, y: 0, width: size.width, height: size.height, scale: 1},
      };
    }
    const {data} = await this.#session.send('Page.captureScreenshot', {
      format: type,
      ...extra,
    });
    const buffer = Buffer.from(data, 'base64');
    if (filePath) {
      fs.writeFileSync(filePath, buffer);
    }
    return buffer;
  }

  /** Render the page to a PDF (headless only). */
  async pdf(options = {}) {
    const {path: filePath, printBackground = true, landscape = false} = options;
    const {data} = await this.#session.send('Page.printToPDF', {
      printBackground,
      landscape,
    });
    const buffer = Buffer.from(data, 'base64');
    if (filePath) {
      fs.writeFileSync(filePath, buffer);
    }
    return buffer;
  }

  async close() {
    await this.#session.send('Page.close').catch(() => {});
  }

  async #centerPoint(selector) {
    return this.evaluate(sel => {
      const el = document.querySelector(sel);
      if (!el) {
        throw new Error(`No element matches selector: ${sel}`);
      }
      el.scrollIntoView({block: 'center', inline: 'center'});
      const rect = el.getBoundingClientRect();
      return {x: rect.x + rect.width / 2, y: rect.y + rect.height / 2};
    }, selector);
  }

  async #navigateHistory(delta, options) {
    const {timeout = 30000, waitUntil = 'load'} = options;
    const history = await this.#session.send('Page.getNavigationHistory');
    const entry = history.entries[history.currentIndex + delta];
    if (!entry) {
      return null;
    }
    const navigation = this.waitForNavigation({timeout, waitUntil});
    await this.#session.send('Page.navigateToHistoryEntry', {entryId: entry.id});
    await navigation;
    return entry;
  }

  #waitForEvent(eventName, timeout) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.#session.off(eventName, onEvent);
        reject(
          new Error(`Timeout ${timeout}ms exceeded waiting for ${eventName}`),
        );
      }, timeout);
      const onEvent = params => {
        clearTimeout(timer);
        resolve(params);
      };
      this.#session.once(eventName, onEvent);
    });
  }
}

function delay(ms) {
  return new Promise(resolve => {
    setTimeout(resolve, ms);
  });
}
