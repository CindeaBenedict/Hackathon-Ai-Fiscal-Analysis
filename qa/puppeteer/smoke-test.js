import puppeteer from "puppeteer";

const TARGET = process.env.TARGET_URL || "http://localhost:8080";
const BACKEND = process.env.BACKEND_URL || TARGET.replace(":8080", ":8000");

const log = (msg) => console.log(`[smoke] ${msg}`);
const fail = (msg, err) => { console.error(`[FAIL] ${msg}`, err?.message ?? ""); process.exitCode = 1; };

const browser = await puppeteer.launch({
  headless: true,
  args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
});

let passed = 0;
let failed = 0;

async function assert(name, fn) {
  try {
    await fn();
    log(`✓ ${name}`);
    passed++;
  } catch (err) {
    fail(`✗ ${name}`, err);
    failed++;
  }
}

try {
  // ── 1. Backend health ──────────────────────────────────────────────────────
  await assert("Backend /health returns 200", async () => {
    const res = await fetch(`${BACKEND}/health`).catch(() => null);
    if (!res || !res.ok) throw new Error(`Status ${res?.status ?? "no response"}`);
    const json = await res.json();
    if (json.status !== "ok") throw new Error(`Unexpected: ${JSON.stringify(json)}`);
  });

  // ── 2. Guest auth endpoint ─────────────────────────────────────────────────
  await assert("POST /auth/guest returns token", async () => {
    const res = await fetch(`${BACKEND}/auth/guest`, { method: "POST" }).catch(() => null);
    if (!res || !res.ok) throw new Error(`Status ${res?.status}`);
    const json = await res.json();
    if (!json.token) throw new Error("No token returned");
  });

  // ── 3. Ollama status ───────────────────────────────────────────────────────
  await assert("GET /ai/status reports Ollama", async () => {
    const res = await fetch(`${BACKEND}/ai/status`).catch(() => null);
    if (!res || !res.ok) throw new Error(`Status ${res?.status}`);
    const json = await res.json();
    log(`   Ollama: ${json.ollama}, models: ${(json.models || []).join(", ") || "none"}`);
    // Not a hard failure if Ollama is offline — just report it
    if (json.ollama !== "online") {
      log("   ⚠ Ollama is offline — AI features will not work");
    }
  });

  // ── 4. Frontend loads and gets past splash ─────────────────────────────────
  const page = await browser.newPage();
  page.on("console", (msg) => {
    if (msg.type() === "error") log(`  browser console error: ${msg.text()}`);
  });

  await assert("Frontend page loads", async () => {
    await page.goto(TARGET, { waitUntil: "networkidle2", timeout: 60_000 });
  });

  await assert("App renders past splash screen (Run Simulation visible)", async () => {
    // The app bootstraps a guest session automatically; wait for the dashboard button
    await page.waitForSelector("button.primary-button", { timeout: 20_000 });
  });

  // ── 5. Run a simulation ────────────────────────────────────────────────────
  await assert("Clicking Run Simulation triggers results", async () => {
    await page.click("button.primary-button");
    // Wait for the metrics grid (Key Metrics section)
    await page.waitForFunction(
      () => document.querySelector(".metrics-grid") !== null,
      { timeout: 60_000 }
    );
  });

  // ── 6. Screenshot ─────────────────────────────────────────────────────────
  await page.screenshot({ path: "/tmp/smoke-dashboard.png", fullPage: false });
  log("Screenshot saved → /tmp/smoke-dashboard.png");

  // ── 7. Navigate to Logs page ───────────────────────────────────────────────
  await assert("Logs tab is accessible", async () => {
    const tabBtn = await page.$x?.("//button[contains(text(),'AI Logs')]") ??
      await page.$$("nav.nav-tabs button");
    const tabs = await page.$$("nav.nav-tabs button");
    const logsTab = tabs[1]; // second tab = AI Logs
    if (!logsTab) throw new Error("Logs tab not found");
    await logsTab.click();
    await page.waitForFunction(
      () => document.querySelector("h2") !== null,
      { timeout: 5_000 }
    );
  });

  await page.screenshot({ path: "/tmp/smoke-logs.png", fullPage: false });
  log("Screenshot saved → /tmp/smoke-logs.png");

} finally {
  await browser.close();
  log(`\nResults: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exitCode = 1;
}
