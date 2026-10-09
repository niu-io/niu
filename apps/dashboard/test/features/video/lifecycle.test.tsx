import {render,screen} from '@testing-library/react';
import {it,expect} from 'vitest';
import VideoLifecycle from '@/features/video/VideoLifecycle';
import {observedLifecycle} from '@/features/video/lifecycle';
const base={source:'gateway_observation' as const,submitted_unix_ms:1000,conflicting_terminal:false};
it('shows observed intervals without pretending polling measures exact generation',()=>{
 render(<VideoLifecycle timing={{...base,observations:[{status:'queued',observed_unix_ms:2000},{status:'running',observed_unix_ms:3000},{status:'succeeded',observed_unix_ms:9000}]}}/>);
 expect(screen.getByLabelText('Before running: 2.0 s')).toBeDefined();
 expect(screen.getByLabelText('Running observed: 6.0 s')).toBeDefined();
 expect(screen.getByText('Observed completion: 8.0 s')).toBeDefined();
 expect(screen.getByText(/Polling delay is included/)).toBeDefined();
});
it('does not invent running or completion intervals from missing observations',()=>{
 const result=observedLifecycle({...base,observations:[{status:'queued',observed_unix_ms:2000}]});
 expect(result).toMatchObject({total:1000,rows:[],terminal:false});
 expect(observedLifecycle({...base,submitted_unix_ms:null,observations:[]})).toBeNull();
});
it('suppresses misleading breakdowns for contradictory or out-of-order statuses',()=>{
 expect(observedLifecycle({...base,observations:[{status:'running',observed_unix_ms:9000},{status:'succeeded',observed_unix_ms:3000}]})).toMatchObject({ordered:false,rows:[]});
 render(<VideoLifecycle timing={{...base,observations:[{status:'succeeded',observed_unix_ms:3000},{status:'failed',observed_unix_ms:4000}]}}/>);
 expect(screen.getByText(/Conflicting completion statuses/)).toBeDefined();
 expect(screen.queryByText(/Observed completion:/)).toBeNull();
});
