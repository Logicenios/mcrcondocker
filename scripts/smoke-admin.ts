import assert from "node:assert/strict";
import type { APIRequestContext, Page, Request } from "playwright-core";

export async function smokeAdmin(
  page: Page,
  api: APIRequestContext,
  base: string,
  screenshot: (name: string) => Promise<void>,
) {
  try {
    await page.goto(`${base}/#/world/management`);
    await page.getByRole("heading", { name: "Operations and maintenance", exact: true }).waitFor();
    await page.getByLabel("Reason", { exact: true }).fill("Smoke maintenance hold");
    await page.getByRole("button", { name: "Add maintenance hold", exact: true }).click();
    await page.locator(".row").filter({ hasText: "Smoke maintenance hold" }).waitFor();
    await page.locator(".row").filter({ hasText: "Smoke maintenance hold" }).getByRole("button", { name: "Release", exact: true }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Run", exact: true }).click();
    await page.locator(".row").filter({ hasText: "Smoke maintenance hold" }).waitFor({ state: "detached" });
    assert.equal(await page.getByRole("button", { name: /^(Start|Stop|Restart)$/ }).count(), 0);
    await page.goto(`${base}/#/world`);
    await page
      .getByRole("heading", { name: "Game rules", exact: true })
      .waitFor();
    await page
      .getByRole("switch", { name: "Keep inventory", exact: true })
      .waitFor();
    await page
      .getByRole("searchbox", { name: "Search game rules" })
      .fill("Keep inventory");
    assert.equal(
      await page
        .getByRole("switch", { name: "Keep inventory", exact: true })
        .count(),
      1,
    );
    await page.getByRole("searchbox", { name: "Search game rules" }).fill("");
    await screenshot("world-desktop");
    await page.getByRole("tab", { name: "Messages", exact: true }).click();
    await page
      .getByRole("textbox", { name: "Chat message", exact: true })
      .waitFor();
    await page
      .getByRole("textbox", { name: "Chat message", exact: true })
      .fill("UI smoke message");
    const say = page.waitForResponse(
      (response) =>
        response.url().endsWith("/api/action") &&
        response.request().method() === "POST",
    );
    await page
      .locator("form")
      .filter({
        has: page.getByRole("textbox", { name: "Chat message", exact: true }),
      })
      .getByRole("button", { name: "Send", exact: true })
      .click();
    assert.equal((await say).status(), 200);
    await page.getByRole("tab", { name: "Bans", exact: true }).click();
    await page
      .getByRole("heading", { name: "Active bans", exact: true })
      .waitFor();
    await page.getByRole("tab", { name: "Log", exact: true }).click();
    await page
      .getByRole("searchbox", { name: "Search log", exact: true })
      .fill("UI smoke message");
    await page
      .locator(".line")
      .filter({ hasText: "UI smoke message" })
      .waitFor();

    await page.goto(`${base}/#/users`);
    await page
      .getByRole("heading", { name: "Accounts", exact: true })
      .waitFor();
    const creation = page.locator(".create-form");
    await creation.getByLabel("Username", { exact: true }).fill("ui-reviewer");
    await creation
      .getByLabel("Password", { exact: true })
      .fill("ui-review-password");
    await creation
      .getByRole("button", { name: "Create user", exact: true })
      .click();
    const account = page.locator('[data-username="ui-reviewer"]');
    await account.waitFor();
    await account.getByLabel("Role", { exact: true }).selectOption("operator");
    await account.getByRole("button", { name: "Save", exact: true }).click();
    await account
      .locator(".identity")
      .getByText("Operator", { exact: true })
      .waitFor();
    await account
      .getByRole("switch", { name: "Enabled", exact: true })
      .uncheck();
    await account.getByRole("button", { name: "Save", exact: true }).click();
    await account.getByText("Disabled", { exact: true }).waitFor();
    const users = await api
      .get(`${base}/api/users`)
      .then((response) => response.json());
    assert(
      users.some(
        (user: { username: string; role: string; enabled: boolean }) =>
          user.username === "ui-reviewer" &&
          user.role === "operator" &&
          !user.enabled,
      ),
    );
    await page
      .getByRole("searchbox", { name: "Search users", exact: true })
      .fill("nonexistent");
    await page.getByText("No matching users.", { exact: true }).waitFor();
    await page
      .getByRole("searchbox", { name: "Search users", exact: true })
      .fill("");
    await screenshot("users-desktop");

    await page.goto(`${base}/#/debug`);
    const catalog = page.getByTestId("catalog-language");
    await catalog.getByText("en_us", { exact: true }).waitFor();
    assert(
      !(await catalog.innerText()).includes("de_de"),
      "English diagnostics show the backend German catalog",
    );
    await page.getByLabel("Language").selectOption("de");
    await catalog.getByText("de_de", { exact: true }).waitFor();
    const exportLink = page.getByRole("link", {
      name: "Als JSON herunterladen",
      exact: true,
    });
    assert((await exportLink.getAttribute("href"))?.endsWith("?lang=de"));
    const exported = await api
      .get(`${base}/api/debug/export?lang=de`)
      .then((response) => response.json());
    assert.equal(exported.assets.language, "de_de");
    assert(Object.keys(exported.raw).length > 0);
    await page.getByLabel("Sprache").selectOption("en");
    await catalog.getByText("en_us", { exact: true }).waitFor();
    await page
      .getByRole("switch", { name: "refresh automatically", exact: true })
      .uncheck();
    await page.locator(".raw pre").first().waitFor();
    await screenshot("debug-desktop");

    await page.goto(`${base}/#/console`);
    const command = page.getByRole("combobox", {
      name: "Command",
      exact: true,
    });
    await command.waitFor();
    let sent = 0;
    const observe = (request: Request) => {
      if (
        new URL(request.url()).pathname === "/api/console" &&
        request.method() === "POST"
      )
        sent++;
    };
    page.on("request", observe);
    try {
      await command.fill("gam");
      await page.getByRole("option", { name: /^gamemode/ }).waitFor();
      await command.press("Tab");
      assert.equal(await command.inputValue(), "gamemode ");
      await command.fill("gamemode cr");
      await command.press("ArrowDown");
      await command.press("Enter");
      assert.equal(await command.inputValue(), "gamemode creative ");
      await command.fill("gamemode creative Al");
      await page.getByRole("option", { name: /^Alex/ }).waitFor();
      await command.press("Tab");
      assert.equal(
        await command.inputValue(),
        "gamemode creative 36532b5e-c442-3dbb-a24c-c7e55d0f979a ",
      );
      await command.fill("give @a diamond_sw");
      await page
        .getByRole("option", { name: /^minecraft:diamond_sword/ })
        .waitFor();
      await command.press("Tab");
      assert.equal(
        await command.inputValue(),
        "give @a minecraft:diamond_sword ",
      );
      await command.fill("gam");
      await command.press("Escape");
      assert.equal(await command.getAttribute("aria-expanded"), "false");
      await command.press("Tab");
      assert.equal(await command.inputValue(), "gam");
      assert.equal(sent, 0, "Completion executed an RCON command");

      await command.fill("tps");
      await command.press("Enter");
      const tps = page.locator(".entry").filter({
        has: page.locator(".entry-header code", { hasText: /^tps$/ }),
      });
      await tps.locator(".res span[style]").first().waitFor();
      assert.equal(
        await tps
          .locator(".res span[style]")
          .first()
          .evaluate((element) => getComputedStyle(element).color),
        "rgb(255, 170, 0)",
      );
      const plain = await tps.locator(".res").innerText();
      await page
        .getByRole("checkbox", { name: "Colors", exact: true })
        .uncheck();
      assert.equal(await tps.locator(".res span[style]").count(), 0);
      assert.equal(await tps.locator(".res").innerText(), plain);
      await page.getByRole("checkbox", { name: "Colors", exact: true }).check();
      await page.route("**/api/console", async (route) => {
        if (
          route.request().method() !== "POST" ||
          route.request().postDataJSON().command !== "ui-color-fixture"
        )
          return route.continue();
        await route.fulfill({
          json: {
            id: 900001,
            at: Date.now(),
            command: "ui-color-fixture",
            output:
              "\x1b[38;2;18;52;86mRGB\x1b[0m <img src=x onerror=alert(1)>",
            ok: true,
            durationMs: 1,
          },
        });
      });
      await command.fill("ui-color-fixture");
      await command.press("Enter");
      const colored = page
        .locator(".entry")
        .filter({ hasText: "ui-color-fixture" })
        .locator(".res");
      await colored.getByText("RGB", { exact: true }).waitFor();
      assert.equal(
        await colored
          .getByText("RGB", { exact: true })
          .evaluate((element) => getComputedStyle(element).color),
        "rgb(18, 52, 86)",
      );
      assert.equal(await colored.locator("img").count(), 0);
      assert(
        (await colored.innerText()).includes("<img src=x onerror=alert(1)>"),
      );
      await page.unroute("**/api/console");
      await command.fill("");
      await command.press("ArrowUp");
      assert.equal(await command.inputValue(), "ui-color-fixture");
      await command.press("ArrowDown");
      assert.equal(await command.inputValue(), "");
      await page.getByRole("button", { name: "History", exact: true }).click();
      await page.getByRole("option", { name: /^tps/ }).click();
      assert.equal(await command.inputValue(), "tps");
      await page
        .getByRole("searchbox", { name: "Search output", exact: true })
        .fill("RGB");
      assert.equal(await page.locator(".entry").count(), 1);
      await page
        .getByRole("searchbox", { name: "Search output", exact: true })
        .fill("");
      await screenshot("console-desktop");
    } finally {
      page.off("request", observe);
    }

    await page.getByLabel("Language").selectOption("de");
    const pages = [
      ["world", "Spielregeln"],
      ["world/management", "Betrieb und Wartung"],
      ["world/nachrichten", "Private Nachricht"],
      ["world/banns", "Aktive Sperren"],
      ["world/protokoll", "Aktionsprotokoll"],
      ["users", "Konten"],
      ["debug", "Datenquellen"],
      ["console", "Konsole"],
      ["sessions", "Spieleraktivität"],
      ["map", "Karte"],
    ];
    for (const width of [320, 375]) {
      await page.setViewportSize({ width, height: 900 });
      for (const [route, heading] of pages) {
        await page.goto(`${base}/#/${route}`);
        await page
          .getByRole("heading", { name: heading, exact: true })
          .waitFor();
        if (route === "world")
          await page
            .getByRole("switch", { name: "Inventar behalten", exact: true })
            .waitFor();
        if (route === "users")
          await page.locator('[data-username="admin"]').waitFor();
        if (route === "debug")
          await page
            .getByTestId("catalog-language")
            .getByText("de_de", { exact: true })
            .waitFor();
        const fits = await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        );
        if (!fits)
          console.log(
            await page.evaluate(() =>
              [...document.querySelectorAll("main *")]
                .filter(
                  (node) => node.getBoundingClientRect().right > innerWidth + 1,
                )
                .slice(0, 12)
                .map((node) => ({
                  tag: node.tagName,
                  class: node.className,
                  width: node.getBoundingClientRect().width,
                })),
            ),
          );
        assert(fits, `German ${route} overflows at ${width}px`);
        if (
          width === 375 &&
          ["world", "users", "debug", "console", "sessions", "map"].includes(
            route!,
          )
        )
          await screenshot(`${route}-mobile-de`);
      }
    }
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.getByLabel("Sprache").selectOption("en");
  } catch (error) {
    await screenshot("admin-failure");
    throw error;
  }
}
