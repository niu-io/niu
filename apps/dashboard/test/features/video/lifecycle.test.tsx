import {render,screen} from '@testing-library/react';
import {it,expect} from 'vitest';
import VideoLifecycle from '@/features/video/VideoLifecycle';
import {observedLifecycle} from '@/features/video/lifecycle';
const base={source:'gateway_observation' as const,submitted_unix_ms:1000,conflicting_terminal:false};
it('shows observed intervals in readable time without defensive polling copy',()=>{
 render(<VideoLifecycle timing={{...base,observations:[{status:'queued',observed_unix_ms:2000},{status:'running',observed_unix_ms:3000},{status:'succeeded',observed_unix_ms:9000}]}}/>);
 expect(screen.getByLabelText('Before running: 2.0 s')).toBeDefined();
 expect(screen.getByLabelText('Running observed: 6.0 s')).toBeDefined();
 expect(screen.getByText('Observed completion: 8.0 s')).toBeDefined();
 expect(screen.getByText('Timing comes from status updates Niu received.')).toBeDefined();
 expect(screen.queryByText(/Polling delay/)).toBeNull();
 expect(screen.queryByText(/exact Provider queue/)).toBeNull();
});
it('uses minutes for longer observations and milliseconds for sub-second gaps',()=>{
 const {unmount}=render(<VideoLifecycle timing={{...base,observations:[{status:'running',observed_unix_ms:31000},{status:'succeeded',observed_unix_ms:92000}]}}/>);
 expect(screen.getByLabelText('Before running: 30.0 s')).toBeDefined();
 expect(screen.getByLabelText('Running observed: 1 min 1 s')).toBeDefined();
 expect(screen.getByText('Observed completion: 1 min 31 s')).toBeDefined();
 unmount();
 render(<VideoLifecycle timing={{...base,observations:[{status:'succeeded',observed_unix_ms:1500}]}}/>);
 expect(screen.getByText('Observed completion: 500 ms')).toBeDefined();
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
it('renders lifecycle labels in Simplified Chinese without stale English',()=>{
 window.localStorage.setItem('niu-dashboard-locale','zh-CN');
 try {
  render(<VideoLifecycle timing={{...base,observations:[{status:'running',observed_unix_ms:3000},{status:'succeeded',observed_unix_ms:9000}]}}/>);
  expect(screen.getByText('开始运行前')).toBeDefined();
  expect(screen.getByText('观察到运行中')).toBeDefined();
  expect(screen.getByLabelText('开始运行前: 2.0 s')).toBeDefined();
  expect(screen.getByText('已观测完成: 8.0 s')).toBeDefined();
  expect(screen.queryByText('Before running')).toBeNull();
 } finally { window.localStorage.clear(); }
});
