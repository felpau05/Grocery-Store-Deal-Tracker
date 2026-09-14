import { chromium } from "playwright";

/* Viewports chosen to cover each side of every breakpoint this site has,
   not just "a phone and a laptop":

     phone            390x844   — below everything; must not change
     tablet-portrait  820x1180  — past sidebar:'s 768 floor but UPRIGHT,
                                  so sidebar: (landscape half) and wide:
                                  (4/3 gate) both correctly fail
     laptop          1280x720   — sidebar: on, wide: on at exactly 1280
     desk            1440x900   — the common case
     ultra           2560x1440  — ultra: on; 5 cards across
     portrait-desk   1440x2560  — THE regression test for the aspect
                                  gate: 1440px wide passes any min-width
                                  test and must still be one column */
const VIEWPORTS = [
  ["phone", 390, 844],
  ["tablet-portrait", 820, 1180],
  ["laptop", 1280, 720],
  ["desk", 1440, 900],
  ["ultra", 2560, 1440],
  ["portrait-desk", 1440, 2560],
];

const ROUTES = [
  ["home", "/"],
  ["deals", "/deals"],
  ["list", "/list"],
  ["settings", "/settings"],
];

const out = process.argv[2];
const only = process.argv[3]; // optional: one viewport name
const browser = await chromium.launch({
  args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader"],
});

for (const [name, w, h] of VIEWPORTS) {
  if (only && name !== only) continue;
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  page.on("pageerror", (e) => console.log(name, "pageerror", e.message));
  for (const [route, path] of ROUTES) {
    await page.goto(`http://localhost:3000${path}`, { waitUntil: "networkidle" });
    // The melon hero's WebGL needs a beat under swiftshader; everything
    // else just needs its fetches to land.
    await page.waitForTimeout(route === "home" ? 6000 : 1500);
    await page.screenshot({ path: `${out}/${route}-${name}.png`, fullPage: route !== "home" });
  }
  await page.close();
}
await browser.close();
console.log("done");
