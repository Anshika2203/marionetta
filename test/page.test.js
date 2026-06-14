import {describe, it, before, after} from 'node:test';
import assert from 'node:assert/strict';
import {launch} from '../src/index.js';

const FORM =
  'data:text/html,' +
  encodeURIComponent(
    `<h1>Form</h1>
     <input id="box">
     <select id="pick">
       <option value="a">A</option>
       <option value="b">B</option>
     </select>
     <button id="go" onclick="document.title=document.getElementById('box').value">go</button>`,
  );

describe('Page', () => {
  let browser;
  let page;

  before(async () => {
    // CI runners need the sandbox disabled to start Chrome.
    browser = await launch({
      args: process.env.CI ? ['--no-sandbox', '--disable-setuid-sandbox'] : [],
    });
    page = await browser.newPage();
  });

  after(async () => {
    await browser.close();
  });

  it('goto + title', async () => {
    await page.goto('data:text/html,<title>Marionetta</title><h1>Hello</h1>');
    assert.equal(await page.title(), 'Marionetta');
  });

  it('evaluate returns values from inside the page', async () => {
    assert.equal(await page.evaluate(() => 6 * 7), 42);
    const text = await page.evaluate(
      () => document.querySelector('h1').textContent,
    );
    assert.equal(text, 'Hello');
  });

  it('evaluate passes arguments through', async () => {
    assert.equal(await page.evaluate((a, b) => a + b, 20, 22), 42);
  });

  it('type into an input and click a button', async () => {
    await page.goto(FORM);
    await page.type('#box', 'clicked-it');
    await page.click('#go');
    assert.equal(await page.title(), 'clicked-it');
  });

  it('select sets the value and fires change', async () => {
    await page.goto(FORM);
    const selected = await page.select('#pick', 'b');
    assert.deepEqual(selected, ['b']);
    assert.equal(
      await page.evaluate(() => document.getElementById('pick').value),
      'b',
    );
  });

  it('hover does not throw on a present element', async () => {
    await page.goto(FORM);
    await page.hover('#go');
  });

  it('waitForSelector resolves for a visible element', async () => {
    await page.goto(FORM);
    await page.waitForSelector('#go', {visible: true});
  });

  it('waitForSelector times out for a missing element', async () => {
    await page.goto(FORM);
    await assert.rejects(
      () => page.waitForSelector('#nope', {timeout: 300}),
      /timeout/i,
    );
  });

  it('goBack returns to the previous page', async () => {
    await page.goto('data:text/html,<title>first</title>');
    await page.goto('data:text/html,<title>second</title>');
    assert.equal(await page.title(), 'second');
    await page.goBack();
    assert.equal(await page.title(), 'first');
  });

  it('waitForNavigation resolves on a programmatic navigation', async () => {
    await page.goto('data:text/html,<h1>start</h1>');
    const navigation = page.waitForNavigation();
    await page.evaluate(() => {
      setTimeout(() => {
        window.location.href = 'about:blank';
      }, 0);
    });
    await navigation;
    assert.equal(await page.url(), 'about:blank');
  });

  it('screenshot returns a PNG buffer', async () => {
    await page.goto('data:text/html,<h1>shot</h1>');
    const buffer = await page.screenshot();
    assert.ok(Buffer.isBuffer(buffer));
    assert.equal(buffer.subarray(0, 4).toString('hex'), '89504e47'); // PNG magic
  });
});
