#!/usr/bin/env python3
"""Build a standalone dual-host Niu plugin; never installs or publishes it."""
import argparse,json,shutil,subprocess
from pathlib import Path
root=Path(__file__).resolve().parents[1]
parser=argparse.ArgumentParser();parser.add_argument('--output',type=Path,required=True)
parser.add_argument('--credential-file',type=Path,help='Explicit private credential path for hosts that filter inherited environment')
args=parser.parse_args()
if args.credential_file and not args.credential_file.is_absolute():raise SystemExit('--credential-file must be absolute')
mcp_env={'NIU_LOG_PAYLOADS':'false'}
if args.credential_file:mcp_env['NIU_CREDENTIAL_FILE']=str(args.credential_file)
out=args.output.resolve()
if out.exists():raise SystemExit('Choose a new output directory; existing files are never replaced')
subprocess.run([str(root/'sdks/mcp/node_modules/.bin/tsc'),'-p',str(root/'sdks/mcp/tsconfig.json')],check=True)
out.mkdir(parents=True)
version=(root/'VERSION').read_text().strip()
metadata={'name':'niu','version':version,'description':'Connect your coding agent to Niu model information, resource management, comparisons and execution evidence.','author':{'name':'Niu'},'homepage':'https://niu.io/docs/install.md','repository':'https://github.com/niu-io/niu','license':'MIT'}
def write(path,value):
 target=out/path;target.parent.mkdir(parents=True,exist_ok=True);target.write_text(json.dumps(value,indent=2)+'\n')
write('plugin.json',{'$schema':'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json',**metadata,'extensions':{'com.openai':{'onboardingSkill':'./skills/niu-connect/SKILL.md'}}})
write('.claude-plugin/plugin.json',metadata)
write('mcp.json',{'$schema':'https://agent-plugins.org/schemas/1.0.0/mcp.schema.json','mcpServers':{'niu':{'type':'stdio','command':'./runtime/mcp/bin/niu-mcp.mjs','env':mcp_env}}})
write('.mcp.json',{'mcpServers':{'niu':{'command':'node','args':['${CLAUDE_PLUGIN_ROOT}/runtime/mcp/bin/niu-mcp.mjs'],'env':mcp_env}}})
shutil.copytree(root/'integrations/coding-agents/skills',out/'skills')
reference=out/'skills/niu/references';reference.mkdir();shutil.copyfile(root/'apps/docs/public/agents.md',reference/'capabilities.md')
shutil.copyfile(root/'apps/docs/public/pools.md',reference/'pools.md')
shutil.copyfile(root/'apps/docs/public/events.md',reference/'events.md')
shutil.copyfile(root/'apps/docs/public/evaluations.md',reference/'evaluations.md')
for directory in ['bin','dist','hosted']:
 shutil.copytree(root/'sdks/mcp'/directory,out/'runtime/mcp'/directory,ignore=shutil.ignore_patterns('*.map','*.d.ts'))
shutil.copytree(root/'sdks/agent-connect/src/auth',out/'runtime/connect/src/auth')
(out/'runtime/connect/bin').mkdir(parents=True)
shutil.copyfile(root/'sdks/agent-connect/bin/niu-login.mjs',out/'runtime/connect/bin/niu-login.mjs')
(out/'runtime/mcp/package.json').write_text('{"type":"module"}\n')
shutil.copyfile(root/'branding/assets/niu-mark.png',out/'.claude-plugin/icon.png')
shutil.copyfile(root/'LICENSE',out/'LICENSE')
shutil.copyfile(root/'integrations/coding-agents/README.md',out/'README.md')
for path in [out/'runtime/mcp/bin/niu-mcp.mjs',out/'runtime/connect/bin/niu-login.mjs']:path.chmod(0o755)
print(f'Built Niu {version} standalone plugin at {out}')
