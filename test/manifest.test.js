import test from "node:test";
import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const manifest = JSON.parse(await readFile(resolve(projectRoot, "manifest.json"), "utf8"));
const packageJson = JSON.parse(await readFile(resolve(projectRoot, "package.json"), "utf8"));

test("keeps manifest permissions and privacy scope minimal", () => {
  assert.deepEqual(manifest.permissions, ["storage", "tabs"]);
  assert.equal(manifest.host_permissions, undefined);
  assert.equal(manifest.content_scripts, undefined);
  assert.equal(manifest.incognito, "not_allowed");
});

test("keeps package and extension versions aligned", () => {
  assert.equal(packageJson.version, manifest.version);
});

test("references only existing runtime files", async () => {
  const referencedFiles = [
    manifest.background.service_worker,
    manifest.action.default_popup,
    ...Object.values(manifest.icons),
    ...Object.values(manifest.action.default_icon)
  ];

  await Promise.all(referencedFiles.map((path) => access(resolve(projectRoot, path))));
});

test("keeps the popup static and free of executable scripts", async () => {
  const popup = await readFile(resolve(projectRoot, manifest.action.default_popup), "utf8");

  assert.doesNotMatch(popup, /<script\b/i);
});
