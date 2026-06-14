# Marionetta

[![CI](https://github.com/Anshika2203/marionetta/actions/workflows/ci.yml/badge.svg)](https://github.com/Anshika2203/marionetta/actions/workflows/ci.yml)

A lightweight library to control Chrome from Node.js — your own browser
automation toolkit. Launch Chrome, open pages, click, type, evaluate JavaScript,
take screenshots, and render PDFs, all by talking to Chrome over the
[Chrome DevTools Protocol](https://chromedevtools.github.io/devtools-protocol/).

Think of it as a remote control for Chrome, driven by code.

## Install

```sh
npm install marionetta
```

Marionetta uses a copy of Chrome that is **already installed** on the machine
(it auto-detects Chrome / Chromium). If Chrome lives somewhere unusual, point to
it with `executablePath` or the `CHROME_PATH` environment variable.

> Requires Node.js 18+.

## Quick start

```js
import {launch} from 'marionetta';

const browser = await launch();          // headless Chrome
const page = await browser.newPage();

await page.goto('https://example.com');
console.log(await page.title());

await page.screenshot({path: 'example.png', fullPage: true});
await browser.close();
```

Run an example straight from the repo:

```sh
npm run example   # takes a screenshot
npm run scrape    # extracts text + links
```

## API

### `launch(options?) → Promise<Browser>`

| Option           | Type      | Default              | Description                              |
| ---------------- | --------- | -------------------- | ---------------------------------------- |
| `headless`       | boolean   | `true`               | Run with no visible window.              |
| `executablePath` | string    | auto-detected        | Path to the Chrome binary.               |
| `args`           | string[]  | `[]`                 | Extra command-line flags for Chrome.     |
| `dumpio`         | boolean   | `false`              | Pipe Chrome's stdout/stderr to console.  |
| `defaultViewport`| object    | `{width:1280,height:800}` | Initial viewport size.              |

### `Browser`

- `browser.newPage()` → `Promise<Page>` — open a new tab.
- `browser.close()` → `Promise<void>` — close Chrome and clean up.
- `browser.process()` — the underlying child process.

### `Page`

- `page.goto(url, {waitUntil, timeout})` — navigate and wait for load.
- `page.waitForNavigation({waitUntil, timeout})` — wait for the next navigation (set up before triggering it).
- `page.goBack({waitUntil, timeout})` / `page.goForward(...)` — move through history.
- `page.evaluate(fn, ...args)` — run a function **inside the page**, return its result.
- `page.click(selector, {timeout})` — real mouse click on an element.
- `page.hover(selector, {timeout})` — move the mouse over an element.
- `page.type(selector, text, {delay})` — focus an input and type into it.
- `page.select(selector, ...values)` — choose option(s) in a `<select>`; returns the selected values.
- `page.waitForSelector(selector, {visible, timeout})` — wait for an element.
- `page.screenshot({path, type, fullPage})` → `Buffer`.
- `page.pdf({path, printBackground, landscape})` → `Buffer` (headless only).
- `page.content()` / `page.title()` / `page.url()`.
- `page.setViewport({width, height, deviceScaleFactor})`.
- `page.close()`.

Ships with TypeScript declarations (`types/index.d.ts`), so editors give you
autocomplete out of the box.

## Tests

```sh
npm test   # launches headless Chrome and exercises the API
```

## How it works

1. `launch()` finds Chrome and starts it with `--remote-debugging-port=0`.
2. Chrome prints a WebSocket URL; Marionetta connects to it.
3. Every API call becomes a DevTools Protocol command sent over that socket.
   Replies are matched back to their command by id; events are routed per page.

That's the same mechanism the big automation libraries use, kept small enough to
read in one sitting — see [`src/Connection.js`](src/Connection.js).

## License

MIT
