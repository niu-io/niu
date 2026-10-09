import type { VideoCreateRequest, VideoModel } from '../../../../../sdks/javascript/src/index';
export type ControlValues = Record<string, string | boolean>;
export type ImageReference = { url: string; role?: string };
export const controlLabels: Record<string, string> = {resolution:'Resolution',ratio:'Aspect ratio',duration:'Duration (seconds)',frames_per_second:'Frame rate',seed:'Seed',watermark:'Watermark',camera_fixed:'Fixed camera',return_last_frame:'Last frame'};
export function initialControls(model: VideoModel): ControlValues {
  return Object.fromEntries(Object.entries(model.controls).filter(([,control]) => control.default !== null).map(([name,control])=>[name,typeof control.default === 'boolean' ? control.default : String(control.default)]));
}
export function videoRequest(model: VideoModel, prompt: string, controls: ControlValues, images: ImageReference[] = []): VideoCreateRequest {
  if (!prompt.trim()) throw new Error('Enter a prompt.');
  if (new TextEncoder().encode(prompt).length > model.text.maximum_bytes) throw new Error('The prompt exceeds this model’s text limit.');
  const request: VideoCreateRequest = {model:model.id,content:[{type:'text',text:prompt}]};
  if (model.requires_image && !images.length) throw new Error('This model requires a reference image.');
  if (images.length) {
    const rule = model.image_url;
    if (!rule || !model.input_types.some(type=>type === 'image_url')) throw new Error('This model does not support reference images.');
    if (images.length > rule.maximum_items || images.length + 1 > model.maximum_content_items) throw new Error('Too many reference images for this model.');
    for (const image of images) {
      const match = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/]+={0,2})$/.exec(image.url);
      if (!match || match[2].length % 4 !== 0 || !rule.data_mime_types.some(mime=>mime === match[1])) throw new Error('Choose a supported PNG, JPEG or WebP image.');
      if (image.url.length > rule.maximum_bytes) throw new Error('The reference image exceeds this model’s size limit.');
      if ((rule.role_required && !image.role) || (image.role && !rule.roles.includes(image.role))) throw new Error('Choose a supported role for each reference image.');
      request.content.push({type:'image_url',image_url:{url:image.url},...(image.role ? {role:image.role}:{})});
    }
  }
  for (const [name,rule] of Object.entries(model.controls)) {
    const value=controls[name];
    if (value === undefined || value === '') {
      if (model.required_controls.includes(name) && rule.default === null) throw new Error(`Choose ${controlLabels[name] ?? name}.`);
      continue;
    }
    if (rule.kind === 'integer') {
      const integer=typeof value === 'string' && /^-?\d+$/.test(value) ? Number(value) : NaN;
      if (!Number.isSafeInteger(integer) || integer < rule.minimum || integer > rule.maximum) throw new Error(`${controlLabels[name] ?? name} must be an integer from ${rule.minimum} to ${rule.maximum}.`);
      request[name]=integer;
    } else if (rule.kind === 'choice') {
      if (typeof value !== 'string' || !rule.values.includes(value)) throw new Error(`Choose a supported ${controlLabels[name] ?? name}.`);
      request[name]=value;
    } else {
      if (typeof value !== 'boolean') throw new Error(`Choose ${controlLabels[name] ?? name}.`);
      request[name]=value;
    }
  }
  const effective={...Object.fromEntries(Object.entries(model.controls).filter(([,rule])=>rule.default !== null).map(([name,rule])=>[name,rule.default])),...request};
  if (model.exclusive_controls.some(pair=>pair.every(name=>effective[name] !== undefined))) throw new Error('These settings cannot be used together.');
  if (!model.output.specifications.some(spec=>spec.resolution === effective.resolution && spec.ratio === effective.ratio)) throw new Error('Choose a supported resolution and aspect ratio together.');
  if (new TextEncoder().encode(JSON.stringify(request)).length > model.maximum_body_bytes) throw new Error('The request exceeds this model’s size limit.');
  return request;
}
