import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import DetectorPreview from '@/features/guardrails/DetectorPreview';
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
const fingerprint='a'.repeat(64);
const binding={detector:'internal-detector',configuration_fingerprint:fingerprint,consent_to_external_processing:true as const};
const description={...binding,recipient:'Example Screening',region:'EU',retention:'No storage',policy_activation:true,content_sent:'request_text_after_local_redaction',processing_guarantees:'declared_unverified',external_charge:'declared_unmetered'};
it('identifies a saved matching recipient and processing terms without exposing fingerprints',async()=>{
 vi.stubGlobal('fetch',vi.fn(async()=>Response.json({data:[description]})));
 render(<DetectorPreview token="test" endpoint="/policies" bindings={[binding]}/>);
 expect(await screen.findByRole('heading',{name:'Example Screening'})).toBeTruthy();
 expect(screen.getByText('EU')).toBeTruthy();
 expect(screen.getByText('No storage')).toBeTruthy();
 expect(document.body.textContent).not.toContain(fingerprint);
 expect(document.body.textContent).not.toContain('internal-detector');
});
it('distinguishes equal-count versions and does not substitute current terms for changed history',async()=>{
 vi.stubGlobal('fetch',vi.fn(async()=>Response.json({data:[{...description,configuration_fingerprint:'b'.repeat(64),recipient:'New Recipient'}]})));
 render(<DetectorPreview token="test" endpoint="/policies" bindings={[binding]}/>);
 expect(await screen.findByRole('heading',{name:'Saved external check 1'})).toBeTruthy();
 expect(screen.getByText(/Configuration changed/)).toBeTruthy();
 expect(screen.getByText(/Current recipient: New Recipient/)).toBeTruthy();
 expect(screen.queryByText('No storage')).toBeNull();
});
it('distinguishes a missing detector from a matching but disabled check',async()=>{
 vi.stubGlobal('fetch',vi.fn(async()=>Response.json({data:[{...description,policy_activation:false}]})));
 render(<DetectorPreview token="test" endpoint="/policies" bindings={[binding,{...binding,detector:'removed'}]}/>);
 expect(await screen.findByText(/not currently enabled/)).toBeTruthy();
 expect(screen.getByText(/saved recipient and processing conditions cannot be recovered/)).toBeTruthy();
});
it('does not describe a failed lookup as a removed detector',async()=>{
 vi.stubGlobal('fetch',vi.fn(async()=>Response.json({error:{message:'Temporarily unavailable'}},{status:503})));
 render(<DetectorPreview token="test" endpoint="/policies" bindings={[binding]}/>);
 expect(await screen.findByRole('button',{name:'Retry check details'})).toBeTruthy();
 expect(screen.queryByText(/cannot be recovered/)).toBeNull();
});
