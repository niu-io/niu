import { test } from 'node:test';
import assert from 'node:assert/strict';
import { auditSource, auditTypedDisplay } from './check-i18n.mjs';
const scan = source => auditSource(source, 'fixture.tsx', new Set(['Save']));
test('detects visible copy, accessible attributes and dynamic branches', () => {
 const result = scan('<><h1>Available credits</h1><Input placeholder="Search models" aria-label="Find model"/><p>{ok ? "Enabled" : "Disabled"}</p><p>{`Available ${amount} credits`}</p></>');
 assert.deepEqual(result.map(x => x.kind), ['untranslated-text','untranslated-attribute','untranslated-attribute','untranslated-expression','untranslated-expression','untranslated-template']);
});
test('validates dictionary lookups and accepts explicit bilingual translations', () => {
 assert.deepEqual(scan('<><p>{t("Save")}</p><p>{t("Missing")}</p><p>{t("Cancel", "取消")}</p></>').map(x => x.text), ['Missing']);
});
test('preserves protocol names, code samples and customer values', () => {
 assert.equal(scan('<><p>MCP</p><p>{customer.name}</p><code>curl example</code><pre>{"Technical sample"}</pre></>').length, 0);
});
test('checks new occurrences without a baseline waiver', () => {
 assert.equal(scan('<><p>Untranslated</p><p>Untranslated</p></>').length, 2);
});
test('ignores presentation and route attributes but checks interpolated accessible labels', () => {
 assert.equal(scan('<div className={wide ? "two columns" : "one column"}><a href="/some/path">MCP</a></div>').length, 0);
 assert.equal(scan('<Button aria-label={ok ? "Continue" : "Try again"}/>').length, 2);
});
test('validates parameterized message keys', () => {
 assert.equal(scan('<p>{uiF("Missing {0}", [name])}</p>')[0].kind, 'missing-translation');
});
test('rejects empty explicit translations', () => {
 assert.equal(scan('<p>{t("Save", "")}</p>')[0].kind, 'missing-translation');
});
test('follows a local display constant and checks nested template branches', () => {
 assert.equal(scan('function Page(){ const caption = ok ? "Loading evidence" : "No results"; return <p>{caption}</p> }').length, 2);
 assert.equal(scan('<p>{`${count} ${count === 1 ? "completed request" : "completed requests"}`}</p>').length, 2);
});


test('typed audit follows imported finite labels but preserves customer strings and translated labels', async () => {
 const ts = (await import('typescript')).default;
 const {mkdtempSync,mkdirSync,writeFileSync,rmSync}=await import('node:fs');
 const {tmpdir}=await import('node:os');const path=await import('node:path');
 const root=mkdtempSync(path.join(tmpdir(),'niu-i18n-'));
 try {
  mkdirSync(path.join(root,'app'));
  writeFileSync(path.join(root,'app','choices.ts'),'export const choices = ["Enabled", "Disabled"] as const;');
  const file=path.join(root,'app','page.tsx');
  writeFileSync(file,`import {choices} from './choices';
   declare const index: number; declare const customer: {name:string};
   declare function uiT(value:string):string;
   const localized = uiT(choices[index]);
   export const Page = () => <><p>{choices[index]}</p><p>{customer.name}</p><p>{localized}</p><p>{uiT(choices[index])}</p></>;`);
  const program=ts.createProgram([file],{jsx:ts.JsxEmit.Preserve});
  const findings=auditTypedDisplay(program,root);
  assert.equal(findings.length,1);assert.equal(findings[0].text,'Enabled | Disabled');
 } finally {rmSync(root,{recursive:true,force:true});}
});

test('follows widened literal arrays rendered by map callbacks', () => {
 assert.equal(scan(`<tr>{['Company','Currency'].map(name => <th>{name}</th>)}</tr>`).length,2);
 assert.equal(scan(`function Page(){const headers=['Company','Currency'];return <tr>{headers.map(name => <th>{name}</th>)}</tr>}`).length,2);
 assert.equal(scan(`<tr>{[uiT('Save')].map(name => <th>{name}</th>)}</tr>`).length,0);
 assert.equal(scan(`<tr>{customers.map(customer => <td>{customer.name}</td>)}</tr>`).length,0);
});

test('traces local display helper return values without auditing customer arguments', () => {
 assert.equal(scan(`function caption(value){if(value===null)return 'Unavailable';return value;} function Page(){return <p>{caption(customer.name)}</p>}`).length,1);
 assert.equal(scan(`function Page(){const caption=value=>value===null?'Unavailable':value;return <p>{caption(customer.name)}</p>}`).length,1);
 assert.equal(scan(`function caption(value){return uiT('Save')} function Page(){return <p>{caption(customer.name)}</p>}`).length,0);
});

test('traces widened local object labels rendered through indexed access', () => {
 assert.equal(scan(`function Page(){const labels={mtd:'Month to date',rolling:'Rolling day window'};return <p>{labels[mode]}</p>}`).length,2);
 assert.equal(scan(`function Page(){const labels={mtd:uiT('Save')};return <p>{labels[mode]}</p>}`).length,0);
});

test('requires translations for indexed display dictionaries even when their lookup is translated', () => {
 assert.equal(scan(`function Page(){const labels={save:'Save',other:'Missing'};return <p>{uiT(labels[key])}</p>}`).filter(x=>x.kind==='missing-translation').length,1);
});

test('rejects fixed English date and currency-name presentation locales', () => {
 assert.equal(scan(`const dates=new Intl.DateTimeFormat('en-US');const names=new Intl.DisplayNames(['en'],{type:'currency'});`).filter(x=>x.kind==='unlocalized-formatter').length,2);
 assert.equal(scan(`const dates=new Intl.DateTimeFormat(locale);const names=new Intl.DisplayNames([locale],{type:'currency'});`).length,0);
});
