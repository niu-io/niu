#!/usr/bin/env python3
"""Check built audience entry points and raw agent-contract links."""
from html.parser import HTMLParser
from pathlib import Path
import argparse
class Links(HTMLParser):
    def __init__(self):super().__init__();self.links=[]
    def handle_starttag(self,tag,attrs):
        if tag=='a':self.links.append(dict(attrs).get('href',''))
p=argparse.ArgumentParser();p.add_argument('--dist',type=Path,default=Path('apps/docs/dist'));a=p.parse_args()
contracts=['install','agents','pools','evaluations','events']
for page in ['index.html','agents/index.html','guides/personal-assistant/index.html']:
    html=(a.dist/page).read_text();parsed=Links();parsed.feed(html)
    assert not any('/docs/docs/' in link for link in parsed.links),f'Duplicated base in {page}'
    assert '/docs/' in parsed.links and '/docs/agents/' in parsed.links,f'Missing audience navigation in {page}'
    if page=='agents/index.html':
        for name in contracts:
            slug='capabilities' if name=='agents' else name
            assert f'/docs/agents/{slug}/' in parsed.links,f'Missing agent reading entry {name}'
            reading=Links();reading.feed((a.dist/f'agents/{slug}/index.html').read_text())
            assert f'/docs/{name}.md' in reading.links,f'Missing original source link {name}'
for name in contracts:
    source=(a.dist/(name+'.md')).read_text()
    assert source.lstrip().startswith('#') and '<!doctype html' not in source.lower(),f'Invalid raw contract {name}'
print('Documentation audience entries and all five raw contracts verified.')
