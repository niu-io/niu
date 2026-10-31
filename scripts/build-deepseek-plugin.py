#!/usr/bin/env python3
"""Package Niu as a native DeepSeek Harness bundle, without installing/publishing."""
import argparse, json, shutil, subprocess, sys
from pathlib import Path
root = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser()
parser.add_argument('--output', type=Path, required=True)
args = parser.parse_args()
out = args.output.resolve()
# Reuse the exact shared runtime/skills builder and its no-overwrite guard.
subprocess.run([sys.executable, str(root/'scripts/build-agent-plugin.py'), '--output', str(out)], check=True)
shutil.copyfile(out/'.claude-plugin/icon.png', out/'icon.png')
shutil.rmtree(out/'.claude-plugin')
for name in ['plugin.json','mcp.json','.mcp.json']:
    (out/name).unlink()
source = root/'integrations/coding-agents/deepseek-harness'
for name in ['index.mjs','README.md']:
    shutil.copyfile(source/name, out/name)
version = (root/'VERSION').read_text().strip()
peers = {name: '0.2.1-rc.5' for name in ['@deepseek-ai/dsh-mcp-client','@deepseek-ai/dsh-skill-filesystem']}
package = {
    'name':'@niu-io/dsh-plugin','version':version,'type':'module','main':'index.mjs',
    'description':'Connect DeepSeek Harness to Niu model management and task evidence.',
    'license':'MIT','homepage':'https://niu.io/docs/install.md',
    'repository':{'type':'git','url':'https://github.com/niu-io/niu'},
    'engines':{'node':'>=24.9.0','dsh':'0.2.1-rc.5'},
    'exports':{'.':'./index.mjs','./package.json':'./package.json','./icon':'./icon.png'},
    'files':['index.mjs','cordis.patch.yml','skills','runtime','icon.png','README.md','LICENSE'],
    'peerDependencies':peers,'devDependencies':peers,
    'dsh':{'bundle':{'patch':'./cordis.patch.yml'}},
}
(out/'package.json').write_text(json.dumps(package,indent=2)+'\n')
(out/'cordis.patch.yml').write_text("- insert:\n    - id: niu-native\n      name: '@niu-io/dsh-plugin'\n")
print(f'Built Niu {version} DeepSeek Harness bundle at {out}')
