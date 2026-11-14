import { readFile, mkdir, writeFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const check = process.argv.includes('--check');

await mkdir(new URL('src/content/docs/agents/', root), { recursive: true });
await mkdir(new URL('public/agents/', root), { recursive: true });

async function syncFile(targetPath, expected) {
  const target = new URL(targetPath, root);
  if (check) {
    let actual;
    try {
      actual = await readFile(target, 'utf8');
    } catch {
      throw new Error(`Missing generated AgentDoc file: ${targetPath}`);
    }
    if (actual !== expected) {
      throw new Error(`Regenerate AgentDoc: ${targetPath}`);
    }
  } else {
    await writeFile(target, expected);
  }
}

for (const name of ['install', 'capabilities', 'inference', 'pools', 'evaluations', 'events']) {
  const file = name === 'capabilities' ? 'agents' : name;
  const source = await readFile(new URL(`public/${file}.md`, root), 'utf8');
  const title = source.match(/^# (.+)$/m)?.[1] ?? name;
  const expected = `---\ntitle: ${JSON.stringify(title)}\n---\n\n${source.replace(/^# .+\r?\n/, '')}`;
  await syncFile(`src/content/docs/agents/${name}.md`, expected);
  await syncFile(`public/agents/${name}.md`, source);
}

const poolsSource = await readFile(new URL('public/pools.md', root), 'utf8');
await syncFile('public/routing.md', poolsSource);
await syncFile('public/agents/routing.md', poolsSource);
