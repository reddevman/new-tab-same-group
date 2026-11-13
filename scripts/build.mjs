import { cp, mkdir, readFile, rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outputDirectory = resolve(projectRoot, "dist/chrome");

const runtimeFiles = [
  "manifest.json",
  "icons/icon-16.png",
  "icons/icon-32.png",
  "icons/icon-48.png",
  "icons/icon-128.png",
  "src/background.js",
  "src/background-controller.js",
  "src/grouping-policy.js",
  "src/tab-history.js",
  "src/popup.html",
  "src/popup.css"
];

await rm(outputDirectory, { recursive: true, force: true });

for (const relativePath of runtimeFiles) {
  const destination = resolve(outputDirectory, relativePath);

  await mkdir(dirname(destination), { recursive: true });
  await cp(resolve(projectRoot, relativePath), destination);
}

const manifest = JSON.parse(await readFile(resolve(projectRoot, "manifest.json"), "utf8"));

console.log(`Built ${manifest.name} ${manifest.version} in dist/chrome`);
