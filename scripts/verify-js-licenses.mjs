import { spawnSync } from "node:child_process";
import { appendFileSync, writeFileSync } from "node:fs";

const result = spawnSync("pnpm", ["licenses", "list", "--json"], {
  encoding: "utf8",
  maxBuffer: 16 * 1024 * 1024,
});
if (result.status !== 0) {
  process.stderr.write(result.stderr || "pnpm license inventory failed\n");
  process.exit(result.status || 1);
}

let groups;
try {
  groups = JSON.parse(result.stdout);
} catch (error) {
  console.error("pnpm returned invalid license inventory JSON", error);
  process.exit(1);
}

const commonLicenses = new Set([
  "0BSD",
  "Apache-2.0",
  "BlueOak-1.0.0",
  "BSD-2-Clause",
  "BSD-3-Clause",
  "CC0-1.0",
  "ISC",
  "MIT",
  "MIT-0",
  "OFL-1.1",
  "Python-2.0",
]);

// These exact build-only packages are not copied into the runtime image, which
// contains only compiled static files.
const scopedExceptions = new Map([
  ["@img/sharp-libvips-darwin-arm64@1.3.3", "LGPL-3.0-or-later"],
  ["@img/sharp-libvips-darwin-x64@1.3.3", "LGPL-3.0-or-later"],
  ["@img/sharp-libvips-linux-arm64@1.3.3", "LGPL-3.0-or-later"],
  ["@img/sharp-libvips-linux-arm@1.3.3", "LGPL-3.0-or-later"],
  ["@img/sharp-libvips-linux-ppc64@1.3.3", "LGPL-3.0-or-later"],
  ["@img/sharp-libvips-linux-riscv64@1.3.3", "LGPL-3.0-or-later"],
  ["@img/sharp-libvips-linux-s390x@1.3.3", "LGPL-3.0-or-later"],
  ["@img/sharp-libvips-linux-x64@1.3.3", "LGPL-3.0-or-later"],
  ["@img/sharp-libvips-linuxmusl-arm64@1.3.3", "LGPL-3.0-or-later"],
  ["@img/sharp-libvips-linuxmusl-x64@1.3.3", "LGPL-3.0-or-later"],
  ["lightningcss@1.32.0", "MPL-2.0"],
  ["lightningcss@1.33.0", "MPL-2.0"],
  ["lightningcss-darwin-arm64@1.32.0", "MPL-2.0"],
  ["lightningcss-darwin-arm64@1.33.0", "MPL-2.0"],
  ["lightningcss-darwin-x64@1.32.0", "MPL-2.0"],
  ["lightningcss-darwin-x64@1.33.0", "MPL-2.0"],
  ["lightningcss-linux-arm-gnueabihf@1.32.0", "MPL-2.0"],
  ["lightningcss-linux-arm-gnueabihf@1.33.0", "MPL-2.0"],
  ["lightningcss-linux-arm64-gnu@1.32.0", "MPL-2.0"],
  ["lightningcss-linux-arm64-gnu@1.33.0", "MPL-2.0"],
  ["lightningcss-linux-arm64-musl@1.32.0", "MPL-2.0"],
  ["lightningcss-linux-arm64-musl@1.33.0", "MPL-2.0"],
  ["lightningcss-linux-x64-gnu@1.32.0", "MPL-2.0"],
  ["lightningcss-linux-x64-gnu@1.33.0", "MPL-2.0"],
  ["lightningcss-linux-x64-musl@1.32.0", "MPL-2.0"],
  ["lightningcss-linux-x64-musl@1.33.0", "MPL-2.0"],
]);

const packages = [];
const errors = [];
for (const [groupLicense, entries] of Object.entries(groups)) {
  for (const entry of entries) {
    const license = entry.license || groupLicense;
    if (!entry.name || !Array.isArray(entry.versions) || entry.versions.length === 0) {
      errors.push(`incomplete metadata in ${groupLicense} group`);
      continue;
    }
    for (const version of entry.versions) {
      const identity = `${entry.name}@${version}`;
      const exception = scopedExceptions.get(identity);
      if (
        !commonLicenses.has(license) &&
        exception !== license
      ) {
        errors.push(`${identity} declares unreviewed license ${license}`);
      }
      if (["UNKNOWN", "UNLICENSED", "NOASSERTION"].includes(license.toUpperCase())) {
        errors.push(`${identity} has no usable license declaration`);
      }
      packages.push({ name: entry.name, version, license });
    }
  }
}

packages.sort((a, b) =>
  `${a.license}:${a.name}:${a.version}`.localeCompare(
    `${b.license}:${b.name}:${b.version}`,
  ),
);
if (process.env.NIU_JS_LICENSE_REPORT) {
  writeFileSync(
    process.env.NIU_JS_LICENSE_REPORT,
    `${JSON.stringify(packages, null, 2)}\n`,
    "utf8",
  );
}

if (errors.length > 0) {
  console.error("JavaScript dependency license review failed:");
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

const counts = new Map();
for (const item of packages) counts.set(item.license, (counts.get(item.license) || 0) + 1);

const summary = [
  "### JavaScript dependency license inventory",
  "",
  "| License | Installed package versions |",
  "| --- | ---: |",
  ...[...counts].sort(([a], [b]) => a.localeCompare(b)).map(([license, count]) => `| ${license} | ${count} |`),
  "",
  `Total package versions checked: ${packages.length}.`,
  "",
  "The inventory includes Geist fonts under OFL-1.1. Scoped exceptions cover pinned optional sharp libvips platform packages (LGPL-3.0-or-later) and Lightning CSS build packages (MPL-2.0). The runtime image receives generated console assets, not Node dependencies.",
  "",
].join("\n");

console.log(summary);
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary);
