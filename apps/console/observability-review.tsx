import React from 'react';
import {createRoot} from 'react-dom/client';
import {MemoryRouter} from 'react-router';
import GatewayActivity from './src/features/executions/components/GatewayActivity';
import './src/styles.css';
const data = ['test-request-one','test-request-two'].map((id,i)=>({attempt_id:id,operation_id:`operation-${id}`,api_key_id:'test-key',key_name:'Development',task_id:null,task_evidence:null,model:i?'Comparison model':'Test model',provider_model:'test-provider-model',created_at:'2026-09-29T08:00:00Z',dispatched_at:'2026-09-29T08:00:00Z',completed_at:'2026-09-29T08:00:01Z',duration_ms:1000,execution:'confirmed_completed',usage_confidence:'provider_reported',prompt_tokens:'120',completion_tokens:'240'}));
window.fetch=async(input)=>new Response(JSON.stringify(String(input).endsWith('/keys')?{data:[{id:'test-key',name:'Development'}]}:{data,next_cursor:null}),{status:200});
createRoot(document.getElementById('root')!).render(<MemoryRouter><main style={{padding:24}}><p>Isolated visual test fixture</p><GatewayActivity token="fixture" models={['Test model','Comparison model']} initialScope={{organizationId:'test',projectId:'test'}}/></main></MemoryRouter>);
