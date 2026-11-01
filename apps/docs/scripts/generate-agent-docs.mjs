import { readFile, mkdir, writeFile } from 'node:fs/promises';
const root = new URL('../', import.meta.url);
await mkdir(new URL('src/content/docs/agents/', root), { recursive: true });
for (const name of ['install', 'capabilities', 'pools', 'evaluations', 'events']) {
  const file = name === 'capabilities' ? 'agents' : name;
  const source = await readFile(new URL(`public/${file}.md`, root), 'utf8');
  const title = source.match(/^# (.+)$/m)?.[1] ?? name;
  const target = new URL(`src/content/docs/agents/${name}.md`, root);
  const expected = `---\ntitle: ${JSON.stringify(title)}\n---\n\n${source.replace(/^# .+\r?\n/, '')}`;
  if (process.argv.includes('--check')) {
    if (await readFile(target, 'utf8') !== expected) throw new Error(`Regenerate AgentDoc: ${name}`);
  } else await writeFile(target, expected);
}
