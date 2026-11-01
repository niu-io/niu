import {test} from 'node:test';
import assert from 'node:assert/strict';
import {documentationAudience,publicNavigationActive,documentationHref} from '../src/navigation.ts';
test('agent audience contains explicit machine contracts and their index',()=>{
 for(const path of ['/docs/agents/','/docs/install.md','/docs/agents.md','/docs/pools.md','/docs/evaluations.md','/help/events.md']) assert.equal(documentationAudience(path),'agent',path);
});
test('human audience retains tutorials and optional product references',()=>{
 for(const path of ['/docs/','/help/','/docs/getting-started/','/docs/guides/mcp/','/docs/configuration/models/','/docs/admin/']) assert.equal(documentationAudience(path),'human',path);
});
test('audience navigation and generated reference sections have distinct active states',()=>{
 assert(publicNavigationActive('/docs/agents/','For Agents'));
 assert(!publicNavigationActive('/docs/agents/','For Human'));
 assert(publicNavigationActive('/docs/configuration/models/','For Human'));
 assert(publicNavigationActive('/docs/api/rest/','API'));
 assert(!publicNavigationActive('/docs/api/rest/','For Human'));
});

test('embedded documentation links preserve dashboard scope and query state',()=>{
 assert.equal(documentationHref('/docs/agents/',true),'/help/agents/');
 assert.equal(documentationHref('/docs/?search=1#start',true),'/help/?search=1#start');
 assert.equal(documentationHref('/docs/install.md',true),'/help/install.md');
 assert.equal(documentationHref('/docs/agents/'),'/docs/agents/');
 assert.equal(documentationHref('https://niu.io/docs/',true),'https://niu.io/docs/');
});
