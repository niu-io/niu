import { copyFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const siteRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repositoryRoot = path.resolve(siteRoot, "../..");
const publicRoot = path.join(siteRoot, "public");
const siteAssetsRoot = path.join(publicRoot, "catalog-assets");
const brandRoot = path.join(siteAssetsRoot, "brand");

await mkdir(brandRoot, { recursive: true });

for (const asset of ["niu-mark.png", "niu-logo-dark.png", "favicon.ico"]) {
  await copyFile(
    path.join(repositoryRoot, "branding", "assets", asset),
    path.join(brandRoot, asset),
  );
}

await copyFile(
  path.join(repositoryRoot, "branding", "reference", "SOURCE-LICENSE.txt"),
  path.join(brandRoot, "SOURCE-LICENSE.txt"),
);

await copyFile(path.join(brandRoot, "favicon.ico"), path.join(publicRoot, "favicon.ico"));
