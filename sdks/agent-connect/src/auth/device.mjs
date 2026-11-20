import {deploymentURL} from './deployment.mjs';

/** Niu browser authorization client. Never logs or returns browser credentials. */
export async function authorizeDevice({baseURL,clientName,capabilities=[],task,workspace,showVerification,signal,fetchImpl=fetch,wait=(ms)=>new Promise(resolve=>setTimeout(resolve,ms))}) {
  const deployment=deploymentURL(baseURL);
  const normalizedClient=typeof clientName==='string'?clientName.trim():'';
  if (!normalizedClient || [...normalizedClient].length>80 || /[\u0000-\u001F\u007F-\u009F]/.test(normalizedClient)) throw new Error('Choose a printable client name (1-80 characters)');
  const workspaceSlug=workspace===undefined?undefined:String(workspace).trim();
  if (workspaceSlug!==undefined && (!workspaceSlug || workspaceSlug.length>80 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(workspaceSlug))) throw new Error('Use a lowercase workspace slug');
  const post=async(path,body)=>fetchImpl(new URL(deployment.base_path+path,deployment.origin),{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body),signal,redirect:'error'});
  if(capabilities.length>6 || new Set(capabilities).size!==capabilities.length || capabilities.some(value=>!['pools:read','pools:write','events:read','events:write','evaluations:read','evaluations:write'].includes(value)))throw new Error('Unsupported or duplicate Niu management capability');
  const taskLabel=typeof task==='string'?task.trim():'';
  if(task!==undefined && (typeof task!=='string' || taskLabel.length===0 || taskLabel.length>200 || /[\u0000-\u001f\u007f]/.test(taskLabel))) throw new Error('Task description must be 1 to 200 characters without control characters');
  const started=await post('/api/v1/auth/agents',{client_name:normalizedClient,...(capabilities.length?{capabilities}:{}),...(taskLabel?{task:taskLabel}:{})});
  if (started.status!==201) throw new Error(`Niu authorization could not start (HTTP ${started.status})`);
  const grant=await started.json();
  if (!/^[0-9a-f]{64}$/.test(grant.device_secret) || !/^[0-9A-F]{12}$/.test(grant.user_code) || grant.verification_uri!=='/connect' || !Number.isInteger(grant.expires_in) || grant.expires_in<1 || grant.expires_in>600 || grant.interval!==5) throw new Error('Niu returned an invalid authorization request');
  const verificationURL=new URL(deployment.base_path+grant.verification_uri,deployment.origin);
  verificationURL.searchParams.set('code',grant.user_code);
  if (workspaceSlug) verificationURL.searchParams.set('workspace',workspaceSlug);
  await showVerification({url:verificationURL.toString(),code:grant.user_code,clientName:normalizedClient,...(workspaceSlug?{workspace:workspaceSlug}:{}),...(taskLabel?{task:taskLabel}:{})});
  const deadline=Date.now()+grant.expires_in*1000;
  while (Date.now()<deadline) {
    signal?.throwIfAborted();
    const response=await post('/api/v1/auth/agents/token',{device_secret:grant.device_secret});
    if (response.status===200) {
      const result=await response.json();
      if (result.token_type!=='Bearer' || !/^niu_[0-9a-f]{64}$/.test(result.token)) throw new Error('Niu returned an invalid credential');
      return {...deployment,token:result.token};
    }
    if (response.status===401 || response.status===403) throw new Error('Niu authorization was denied, expired, revoked or already consumed; start a new request');
    if (response.status!==202 && response.status!==429) throw new Error(`Niu authorization failed (HTTP ${response.status}); do not replay a successful credential exchange`);
    await wait(Math.min(response.status===429?60000:5000,Math.max(0,deadline-Date.now())));
  }
  throw new Error('Niu authorization expired; start a new request');
}
