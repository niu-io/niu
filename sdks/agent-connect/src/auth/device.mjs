/** Niu browser authorization client. Never logs or returns browser credentials. */
export async function authorizeDevice({baseURL,clientName,capabilities=[],showVerification,signal,fetchImpl=fetch,wait=(ms)=>new Promise(resolve=>setTimeout(resolve,ms))}) {
  const origin=new URL(baseURL);
  if (origin.username || origin.password || origin.search || origin.hash || (origin.pathname!=='/' && origin.pathname!=='')) throw new Error('Use a Niu origin without credentials, path, query or fragment');
  if (origin.protocol!=='https:' && !(origin.protocol==='http:' && ['localhost','127.0.0.1','[::1]'].includes(origin.hostname))) throw new Error('Niu authorization requires HTTPS (or loopback development HTTP)');
  if (!['Claude Code','Codex','DeepSeek Harness'].includes(clientName)) throw new Error('Choose Claude Code, Codex or DeepSeek Harness');
  const post=async(path,body)=>fetchImpl(new URL(path,origin),{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body),signal,redirect:'error'});
  if(capabilities.length>6 || new Set(capabilities).size!==capabilities.length || capabilities.some(value=>!['pools:read','pools:write','events:read','events:write','evaluations:read','evaluations:write'].includes(value)))throw new Error('Unsupported or duplicate Niu management capability');
  const started=await post('/api/v1/auth/agents',{client_name:clientName,...(capabilities.length?{capabilities}: {})});
  if (started.status!==201) throw new Error(`Niu authorization could not start (HTTP ${started.status})`);
  const grant=await started.json();
  if (!/^[0-9a-f]{64}$/.test(grant.device_secret) || !/^[0-9A-F]{12}$/.test(grant.user_code) || grant.verification_uri!=='/connect' || !Number.isInteger(grant.expires_in) || grant.expires_in<1 || grant.expires_in>600 || grant.interval!==5) throw new Error('Niu returned an invalid authorization request');
  const verificationURL=new URL(grant.verification_uri,origin);
  verificationURL.searchParams.set('code',grant.user_code);
  await showVerification({url:verificationURL.toString(),code:grant.user_code,clientName});
  const deadline=Date.now()+grant.expires_in*1000;
  while (Date.now()<deadline) {
    signal?.throwIfAborted();
    const response=await post('/api/v1/auth/agents/token',{device_secret:grant.device_secret});
    if (response.status===200) {
      const result=await response.json();
      if (result.token_type!=='Bearer' || !/^niu_[0-9a-f]{64}$/.test(result.token)) throw new Error('Niu returned an invalid credential');
      return {origin:origin.origin,token:result.token};
    }
    if (response.status===401 || response.status===403) throw new Error('Niu authorization was denied, expired, revoked or already consumed; start a new request');
    if (response.status!==202 && response.status!==429) throw new Error(`Niu authorization failed (HTTP ${response.status}); do not replay a successful credential exchange`);
    await wait(Math.min(response.status===429?60000:5000,Math.max(0,deadline-Date.now())));
  }
  throw new Error('Niu authorization expired; start a new request');
}
