import { expect, it } from 'vitest';
import { generationCapability } from '@/features/models/generation-capabilities';
import { capabilityValues } from '@/features/models/model-capabilities';
import type { Model } from '@/app/dashboard-context';
it.each([
 [{chat:false,video:true},['text'],false,true],
 [{chat:true,video:false},['video'],true,false],
 [{chat:true,video:true},[],true,true],
 [{chat:null,video:false},['text'],null,false],
 [{chat:false,video:false},['text','video'],false,false],
 [null,['text'],null,null],
 [undefined,[],null,null],
])('uses configured generation support before catalog modalities (%j)',(capabilities,outputs,chat,video)=>{
 const model={id:'example',public_catalog:false,catalog:{output_modalities:outputs},generation_capabilities:capabilities} as Model;
 expect(generationCapability(model,'chat')).toBe(chat);expect(generationCapability(model,'video')).toBe(video);
});
it('shows the configured video output instead of stale text metadata for a Video-only route',()=>{
 expect(capabilityValues({id:'video',public_catalog:false,catalog:{output_modalities:['text']},generation_capabilities:{chat:false,video:true}},'output')).toEqual(['video']);
});
