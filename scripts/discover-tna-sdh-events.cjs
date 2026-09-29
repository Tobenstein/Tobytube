const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

const outputPath = path.resolve(__dirname, "../cache/sdh-tna-events/index.json");
const baseUrl = "https://www.thesmackdownhotel.com/events-results/ppv-special/tna/";

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe" });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await page.goto(`${baseUrl}#sort=attr.ct22.frontend_value&sortdir=desc`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(3500);
  const events = new Map();
  let emptyPages = 0;
  for (let pageNumber = 1; pageNumber <= 12 && emptyPages < 2; pageNumber += 1) {
    const pageEvents = await page.locator("a[href*='/events-results/ppv-special/']").evaluateAll((anchors) => anchors
      .map((anchor) => ({ url: anchor.href.split("#")[0], text: anchor.textContent.replace(/\s+/g, " ").trim() }))
      .filter((item) => /\/events-results\/ppv-special\/(?:tna|impact|nwa-tna)-/i.test(item.url)));
    const before = events.size;
    pageEvents.forEach((event) => events.set(event.url, event));
    emptyPages = events.size === before ? emptyPages + 1 : 0;
    const next = page.locator("a.page.action.next").first();
    if (!(await next.count())) break;
    const disabled = await next.evaluate((node) => node.classList.contains("disabled") || node.getAttribute("aria-disabled") === "true");
    if (disabled) break;
    await next.evaluate((node) => node.click());
    await page.waitForTimeout(1600);
  }
  await browser.close();
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify({ generatedAt: new Date().toISOString(), source: baseUrl, events: [...events.values()] }, null, 2));
  console.log(`Discovered ${events.size} TNA event pages.`);
})().catch((error) => { console.error(error); process.exit(1); });
