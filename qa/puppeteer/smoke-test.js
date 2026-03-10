import puppeteer from "puppeteer";

const targetUrl = process.env.TARGET_URL || "http://localhost:8080";

const browser = await puppeteer.launch({
  headless: true,
  args: ["--no-sandbox", "--disable-setuid-sandbox"],
});

try {
  const page = await browser.newPage();
  await page.goto(targetUrl, { waitUntil: "networkidle2", timeout: 60000 });

  await page.waitForSelector("button.primary-button", { timeout: 10000 });
  await page.click("button.primary-button");

  // Wait for metrics area to appear after simulation response.
  await page.waitForSelector("h2", { timeout: 20000 });

  await page.screenshot({ path: "/tmp/supplychain-smoke.png", fullPage: true });
  console.log("Smoke test passed. Screenshot saved to /tmp/supplychain-smoke.png");
} catch (error) {
  console.error("Smoke test failed:", error);
  process.exitCode = 1;
} finally {
  await browser.close();
}
