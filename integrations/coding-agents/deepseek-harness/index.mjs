// Niu-owned adapter. Host contracts: DeepSeek Harness 0.2.1-rc.5.
import * as McpClient from '@deepseek-ai/dsh-mcp-client';
import * as FilesystemSkills from '@deepseek-ai/dsh-skill-filesystem';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';
import { join } from 'node:path';

export const name = 'niu';
export async function apply(ctx) {
  const credentialFile = process.env.NIU_CREDENTIAL_FILE || join(homedir(), '.config', 'niu', 'deepseek-harness', 'credential.json');
  // Cordis owns both child plugins and disposes their tools, processes and
  // providers on unload. Do not replace existing host services or inference.
  const mcp = ctx.plugin(McpClient, {
    serverName: 'niu', transport: 'stdio', command: process.execPath,
    args: [fileURLToPath(new URL('./runtime/mcp/bin/niu-mcp.mjs', import.meta.url))],
    env: { NIU_CREDENTIAL_FILE: credentialFile, NIU_API_KEY: '', NIU_BASE_URL: '', NIU_LOG_PAYLOADS: 'false' },
    failOnStartupError: true,
  });
  const skills = ctx.plugin(FilesystemSkills, {
    providerName: 'niu-bundled', includeDefaultRoots: false, watch: false,
    customSkillDirs: [fileURLToPath(new URL('./skills/', import.meta.url))],
  });
  await Promise.all([mcp, skills]);
}
