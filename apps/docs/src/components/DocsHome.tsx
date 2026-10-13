import { IconBooks, IconCode, IconKey, IconRoute, IconSparkles, IconVideo, IconListDetails, IconShieldCheck, IconServer } from '@tabler/icons-react';
import { Button } from '../../../dashboard/src/components/ui/button';

const groups = [
  { title: 'Connect & build', links: [
    { title: 'Models & routing', description: 'Connect Suppliers and choose the models your applications can call.', href: '/docs/configuration/models/', icon: IconRoute },
    { title: 'API quickstart', description: 'Use a workspace key, discover models and send your first request.', href: '/docs/guides/api-quickstart/', icon: IconKey },
    { title: 'SDK quickstart', description: 'Make typed model calls and handle streaming with the JavaScript client.', href: '/docs/guides/sdk-quickstart/', icon: IconCode },
  ] },
  { title: 'Use & manage', links: [
    { title: 'Generations', description: 'Work with saved Chat and Video sessions.', href: '/docs/reference/generations/', icon: IconSparkles },
    { title: 'Video generation', description: 'Submit supported video jobs and manage their status and results.', href: '/docs/reference/video/', icon: IconVideo },
    { title: 'Request logs', description: 'Follow responses, timing, reported usage and customer charges.', href: '/docs/concepts/execution-observation/', icon: IconListDetails },
    { title: 'Guardrails', description: 'Understand supported policies and their enforcement boundaries.', href: '/docs/configuration/guardrails/', icon: IconShieldCheck },
  ] },
];
export default function DocsHome() {
  return <div className="docs-home not-content">
    <header className="docs-home-intro"><p className="docs-home-eyebrow">Build with Niu</p><h1 id="_top">Niu Documentation</h1><p className="docs-home-lead">Connect model APIs. Manage text and video generation. Understand your usage and bill.</p><p>Everything you need to connect an application, manage workspace access and operate your gateway.</p><div className="docs-home-actions"><Button asChild><a href="/docs/getting-started/">Quickstart </a></Button><Button asChild variant="secondary"><a href="/docs/deployment/single-container/"><IconServer /> Deploy Niu</a></Button></div></header>
    <section className="docs-home-request" aria-labelledby="first-request"><div className="docs-home-section-heading"><div><h2 id="first-request">Start with a real request</h2><p>List models available to your workspace key on your running gateway.</p></div><a href="/docs/guides/api-quickstart/">Full API tutorial </a></div><div className="docs-home-code"><span>Shell · Model discovery</span><pre><code>{'curl http://localhost:2555/v1/models \\\n  -H "Authorization: Bearer $NIU_API_KEY"'}</code></pre></div><p className="docs-home-hint">Use your gateway URL and workspace API key. Model and video availability depends on the configured routes.</p></section>
    <div className="docs-home-groups">{groups.map(group=><section key={group.title}><h2>{group.title}</h2><div className="docs-home-links">{group.links.map(link=><a key={link.href} href={link.href}><link.icon size={21} stroke={1.6} /><div><h3>{link.title}</h3><p>{link.description}</p></div></a>)}</div></section>)}</div>
    <section className="docs-home-reference"><h2>Reference documentation</h2><p>Generated from the API contract and SDK source, with tutorials in the Docs directory.</p><div className="docs-home-reference-links"><a href="/docs/api/rest/"><IconBooks size={22} stroke={1.6} /><div><h3>REST API specification</h3><p>Endpoints, authentication, request and response schemas.</p></div></a><a href="/docs/api/sdk/"><IconCode size={22} stroke={1.6} /><div><h3>SDK interfaces & types</h3><p>Client methods, parameters and exported TypeScript types.</p></div></a></div></section>
    <footer className="docs-home-footer"><a href="/docs/security/overview/">Security & access</a><a href="/docs/guides/local-development/">Local development</a><a href="/compare/">Compare Niu</a><p>Niu is in active development. Guides describe supported behavior and current limitations.</p></footer>
  </div>;
}
