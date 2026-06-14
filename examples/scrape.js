// A tiny scraping demo. Run with:  npm run scrape
import {launch} from '../src/index.js';

const browser = await launch();
const page = await browser.newPage();

await page.goto('https://example.com');

// Everything inside evaluate() runs *inside the page*, like the browser console.
const data = await page.evaluate(() => {
  return {
    heading: document.querySelector('h1')?.innerText,
    paragraph: document.querySelector('p')?.innerText,
    links: [...document.querySelectorAll('a')].map(a => a.href),
  };
});

console.log(JSON.stringify(data, null, 2));

await browser.close();
