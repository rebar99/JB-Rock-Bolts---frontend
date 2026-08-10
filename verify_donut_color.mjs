import { chromium } from "playwright";

const SCRATCH = "C:\\Users\\deepi\\AppData\\Local\\Temp\\claude\\d--rebar-jbrocks\\533d8564-80e1-4b76-9c53-e672280136ac\\scratchpad";

const browser = await chromium.launch();
const page = await browser.newPage();

await page.goto("http://localhost:8081/login");
await page.fill('input[type="email"]', "admin@jbrockbolts.com");
await page.fill('input[type="password"]', "admin@123");
await page.click('button[type="submit"]');
await page.waitForTimeout(2000);

await page.goto("http://localhost:8081/dashboard");
await page.waitForTimeout(2000);

const card = page.locator('text=Sales By Products').locator('..').locator('..');
await card.screenshot({ path: `${SCRATCH}\\donut_colored.png` });

await browser.close();
