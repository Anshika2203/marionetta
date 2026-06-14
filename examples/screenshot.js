// Run with:  npm run example
import {launch} from '../src/index.js';

const browser = await launch(); // headless Chrome
const page = await browser.newPage();

await page.goto('https://example.com');
console.log('Title:', await page.title());

await page.screenshot({path: 'example.png', fullPage: true});
console.log('Saved screenshot to example.png');

await browser.close();
