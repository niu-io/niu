export class ResultReadError extends Error {constructor(message:string,readonly status?:number){super(message);}}
const resultFailures: Record<string,{status:number;message:string}> = {
  media_result_unavailable:{status:502,message:'The Supplier cannot serve this saved result right now. Its link may have expired.'},
  media_result_destination_rejected:{status:502,message:'The result cannot be reached safely. Ask your administrator to check gateway DNS and HTTPS access.'},
  media_result_too_large:{status:502,message:'The saved result exceeds the download limit.'},
  media_result_invalid:{status:502,message:'The Supplier returned an unsupported or invalid media file.'},
  media_result_transport_error:{status:502,message:'The Supplier result request failed. Try loading the preview again.'},
  media_result_timeout:{status:504,message:'Result retrieval timed out. Try loading the preview again.'},
  media_result_busy:{status:503,message:'Downloads are busy. Try loading the preview again.'},
  media_result_configuration_error:{status:503,message:'Result retrieval is not configured correctly. Contact your administrator.'},
};
async function failureMessage(response:Response,signal:AbortSignal):Promise<string> {
  const fallback='This result could not be safely retrieved.';
  if(!response.headers.get('content-type')?.toLowerCase().startsWith('application/json') || !response.body) {await response.body?.cancel();return fallback;}
  const reader=response.body.getReader();const chunks:Uint8Array[]=[];let size=0;
  try {
    for(;;) {
      signal.throwIfAborted();const {done,value}=await reader.read();signal.throwIfAborted();if(done)break;
      size+=value.byteLength;if(size>8192)return fallback;chunks.push(value);
    }
    const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
    const body=JSON.parse(new TextDecoder().decode(bytes));
    const type=body?.error?.type;
    const entry=typeof type === 'string' && Object.hasOwn(resultFailures,type) ? resultFailures[type]:undefined;
    return entry?.status === response.status ? entry.message:fallback;
  } catch {signal.throwIfAborted();return fallback;} finally {await reader.cancel().catch(()=>{});reader.releaseLock();}
}
export async function fetchVideoResult(token:string,path:string,kind:'video'|'last_frame',signal:AbortSignal):Promise<Blob> {
  const response=await fetch(`${path}/${kind}`,{headers:{authorization:`Bearer ${token}`,accept:kind === 'video' ? 'video/mp4,video/webm':'image/png,image/jpeg'},signal,redirect:'error'});
  if(!response.ok) {
    if(response.status === 404){await response.body?.cancel();throw new ResultReadError('This result is missing, expired or deleted.',404);}
    if(response.status === 401 || response.status === 403){await response.body?.cancel();throw new ResultReadError('You no longer have access to this result.',response.status);}
    throw new ResultReadError(await failureMessage(response,signal),response.status);
  }
  const type=response.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() ?? '';
  if(!(kind === 'video' ? ['video/mp4','video/webm']:['image/png','image/jpeg']).includes(type)) {await response.body?.cancel();throw new ResultReadError('The result has an unsupported file type.');}
  const maximum=kind === 'video' ? 64*1024*1024:10*1024*1024;
  if(Number(response.headers.get('content-length'))>maximum) {await response.body?.cancel();throw new ResultReadError('The result exceeds the download limit.');}
  if(!response.body)throw new ResultReadError('The result body is unavailable.');
  const reader=response.body.getReader();let size=0;const chunks:BlobPart[]=[];
  try {
    for(;;) {
      signal.throwIfAborted();const {done,value}=await reader.read();signal.throwIfAborted();if(done)break;
      size+=value.byteLength;if(size>maximum)throw new ResultReadError('The result exceeds the download limit.');
      chunks.push(new Uint8Array(value));
    }
    if(!size)throw new ResultReadError('The result body is empty.');
    return new Blob(chunks,{type});
  } catch(error) {await reader.cancel().catch(()=>{});throw error;} finally {reader.releaseLock();}
}
