#!/usr/bin/env python3
"""Build installable Claude Code/Codex local marketplace artifacts."""
import argparse,json,subprocess,sys
from pathlib import Path
root=Path(__file__).resolve().parents[1]
p=argparse.ArgumentParser();p.add_argument('--output',required=True,type=Path);args=p.parse_args();out=args.output.resolve()
if out.exists():raise SystemExit('Choose a new output directory')
subprocess.run([sys.executable,str(root/'scripts/build-agent-plugin.py'),'--output',str(out/'plugins/niu')],check=True)
claude={'name':'niu','metadata':{'description':'Niu model discovery, authorized management and execution evidence for coding agents'},'owner':{'name':'Niu'},'plugins':[{'name':'niu','source':'./plugins/niu','description':'Niu model information, comparisons and request evidence'}]}
codex={'name':'niu','plugins':[{'name':'niu','source':{'source':'local','path':'./plugins/niu'},'policy':{'installation':'AVAILABLE','authentication':'ON_INSTALL'},'category':'Productivity'}]}
for name,value in [('.claude-plugin/marketplace.json',claude),('.agents/plugins/marketplace.json',codex)]:
 target=out/name;target.parent.mkdir(parents=True,exist_ok=True);target.write_text(json.dumps(value,indent=2)+'\n')
print('Built host-native Niu marketplaces without installing or publishing')
