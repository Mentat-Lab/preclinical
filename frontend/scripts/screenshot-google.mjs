#!/usr/bin/env node
import { chromium } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(__dirname, '..', '..', 'output', 'playwright');

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
await page.goto('https://google.com', { waitUntil: 'domcontentloaded', timeout: 15000 });
const screenshotPath = path.join(outDir, 'google.png');
await page.screenshot({ path: screenshotPath });
await browser.close();
console.log(screenshotPath);
