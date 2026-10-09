import { useState, type FormEvent } from 'react';
import { IconChevronDown as ChevronDown } from '@tabler/icons-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { schemaInteger, schemaNames, videoControls, type VideoControlName, type VideoSchema } from '../video-schema';

type InputDraft = { enabled: boolean; items: string; bytes: string; https: boolean; mime: string; roles: string; required: boolean };
type ControlDraft = { enabled: boolean; minimum: string; maximum: string; values: string; fallback: string; bytes: string; required: boolean };
const inputLabels = { text: 'Text', image_url: 'Image', video_url: 'Video reference', audio_url: 'Audio reference' } as const;
type InputName = keyof typeof inputLabels;

function ordered(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(ordered);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, ordered(item)]));
  return value;
}

export default function VideoSchemaEditor({ modelAlias, upstreamModel, schema, onClose, onApply }: {
  modelAlias: string; upstreamModel: string; schema?: VideoSchema;
  onClose: () => void; onApply: (schema: VideoSchema | undefined) => void;
}) {
  const [tab, setTab] = useState('general');
  const [channel, setChannel] = useState(schema?.channel ?? '');
  const [bodyBytes, setBodyBytes] = useState(String(schema?.maximum_body_bytes ?? ''));
  const [contentItems, setContentItems] = useState(String(schema?.maximum_content_items ?? ''));
  const [callbacks, setCallbacks] = useState(schema?.callbacks_qualified ?? false);
  const [exclusive, setExclusive] = useState(schema?.exclusive_controls.map(pair => pair.join(', ')).join('\n') ?? '');
  const [inputs, setInputs] = useState<Record<InputName, InputDraft>>(() => Object.fromEntries(Object.keys(inputLabels).map(name => {
    const rule = schema?.inputs[name as InputName];
    return [name, {enabled:Boolean(rule),items:String(rule?.maximum_items ?? ''),bytes:String(rule?.maximum_bytes ?? ''),https:rule?.https ?? false,mime:rule?.data_mime_types.join(', ') ?? '',roles:rule?.roles.join(', ') ?? '',required:rule?.role_required ?? false}];
  })) as Record<InputName, InputDraft>);
  const [controls, setControls] = useState<Record<VideoControlName, ControlDraft>>(() => Object.fromEntries(Object.keys(videoControls).map(name => {
    const rule = schema?.controls[name as VideoControlName];
    return [name, {enabled:Boolean(rule),minimum:rule?.kind === 'integer' ? String(rule.minimum) : '',maximum:rule?.kind === 'integer' ? String(rule.maximum) : '',values:rule?.kind === 'choice' ? rule.values.join(', ') : '',fallback:rule && 'default' in rule && rule.default !== null ? String(rule.default) : '',bytes:rule?.kind === 'https_url' ? String(rule.maximum_bytes) : '',required:schema?.required_controls.includes(name as VideoControlName) ?? false}];
  })) as Record<VideoControlName, ControlDraft>);
  const [inputName, setInputName] = useState<InputName>('text');
  const [controlName, setControlName] = useState<VideoControlName>('duration');
  const [outputEnabled, setOutputEnabled] = useState(Boolean(schema?.output));
  const [estimator, setEstimator] = useState<'SeedancePixelsV1' | 'OutputSecondsV1'>(schema?.output?.estimator ?? 'SeedancePixelsV1');
  const [outputMappings, setOutputMappings] = useState(() => schema?.output?.specifications.map(spec => ({...spec,width:String(spec.width),height:String(spec.height)})) ?? []);
  function updateOutput(index: number, patch: Partial<(typeof outputMappings)[number]>) { setOutputMappings(current => current.map((row,position) => position === index ? {...row,...patch} : row)); }
  const [error, setError] = useState('');
  const input = inputs[inputName];
  const control = controls[controlName];
  const controlType = videoControls[controlName];
  function updateInput(patch: Partial<InputDraft>) { setInputs(current => ({...current,[inputName]:{...current[inputName],...patch}})); }
  function updateControl(patch: Partial<ControlDraft>) { setControls(current => ({...current,[controlName]:{...current[controlName],...patch}})); }

  function apply(event: FormEvent) {
    event.preventDefault();
    event.stopPropagation();
    setError('');
    try {
      if (!channel.trim() || new TextEncoder().encode(channel.trim()).length > 256 || /[\u0000-\u001f\u007f]/.test(channel)) throw new Error('Enter the exact channel name from its verified adapter contract.');
      const maximumBody = schemaInteger(bodyBytes, 'Maximum request bytes', 1, 16_777_216);
      const maximumItems = schemaInteger(contentItems, 'Maximum content items', 1, 32);
      const result: VideoSchema = {version:1,revision:crypto.randomUUID(),model_alias:modelAlias,upstream_model:upstreamModel,channel:channel.trim(),maximum_body_bytes:maximumBody,maximum_content_items:maximumItems,inputs:{},controls:{},required_controls:[],exclusive_controls:[],callbacks_qualified:callbacks};
      for (const name of Object.keys(inputLabels) as InputName[]) {
        const draft = inputs[name];
        if (!draft.enabled) continue;
        const label = inputLabels[name];
        const mime = schemaNames(draft.mime, `${label} MIME types`);
        if (mime.some(value => !value.includes('/'))) throw new Error(`${label} MIME types must contain a slash.`);
        const roles = schemaNames(draft.roles, `${label} roles`);
        if (draft.required && !roles.length) throw new Error(`${label} requires at least one allowed role.`);
        if (name !== 'text' && !draft.https && !mime.length) throw new Error(`${label} needs HTTPS input or an allowed Base64 MIME type.`);
        result.inputs[name] = {maximum_items:schemaInteger(draft.items,`${label} maximum items`,1,maximumItems),maximum_bytes:schemaInteger(draft.bytes,`${label} maximum bytes`,1,maximumBody),https:draft.https,data_mime_types:mime,roles,role_required:draft.required};
      }
      if (!Object.keys(result.inputs).length) throw new Error('Configure at least one input type.');
      for (const name of Object.keys(videoControls) as VideoControlName[]) {
        const draft = controls[name];
        if (!draft.enabled) continue;
        const {label,kind} = videoControls[name];
        if (kind === 'integer') {
          const minimum = schemaInteger(draft.minimum,`${label} minimum`,-Number.MAX_SAFE_INTEGER);
          const maximum = schemaInteger(draft.maximum,`${label} maximum`,minimum);
          result.controls[name] = {kind,minimum,maximum,default:draft.fallback.trim() ? schemaInteger(draft.fallback,`${label} default`,minimum,maximum) : null};
        } else if (kind === 'choice') {
          const values = schemaNames(draft.values,`${label} choices`,64);
          if (!values.length || (draft.fallback.trim() && !values.includes(draft.fallback.trim()))) throw new Error(`${label} needs choices and any default must be one of them.`);
          result.controls[name] = {kind,values,default:draft.fallback.trim() || null};
        } else if (kind === 'boolean') {
          result.controls[name] = {kind,default:draft.fallback === '' ? null : draft.fallback === 'true'};
        } else {
          if (!callbacks) throw new Error('Callback URL requires a qualified callback contract for this schema.');
          result.controls[name] = {kind,maximum_bytes:schemaInteger(draft.bytes,'Maximum callback URL bytes',1,8192)};
        }
        if (draft.required) result.required_controls.push(name);
      }
      if (outputEnabled) {
        for (const name of ['resolution','ratio','duration','frames_per_second'] as const) {
          const rule = result.controls[name];
          if (!rule || !('default' in rule) || (rule.default === null && !result.required_controls.includes(name))) throw new Error('Output estimates require resolution, aspect ratio, duration and frame rate controls, each with a default or required value.');
          if ((name === 'duration' || name === 'frames_per_second') && (rule.kind !== 'integer' || rule.minimum <= 0 || (name === 'frames_per_second' && rule.maximum > 4_294_967_295))) throw new Error('Output duration and frame rate need positive integer limits.');
        }
        const resolution = result.controls.resolution; const ratio = result.controls.ratio;
        if (resolution?.kind !== 'choice' || ratio?.kind !== 'choice') throw new Error('Output mappings require resolution and aspect ratio choices.');
        if (!outputMappings.length || outputMappings.length > 256) throw new Error('Configure at least one output mapping, up to 256.');
        const specifications = outputMappings.map(row => {
          if (!resolution.values.includes(row.resolution) || !ratio.values.includes(row.ratio)) throw new Error('Each output mapping must use configured resolution and aspect ratio choices.');
          return {...row,width:schemaInteger(row.width,'Output width',1,4_294_967_295),height:schemaInteger(row.height,'Output height',1,4_294_967_295)};
        });
        if (new Set(specifications.map(row => JSON.stringify([row.resolution,row.ratio]))).size !== specifications.length) throw new Error('Use only one output mapping for each resolution and aspect ratio.');
        if (resolution.default && ratio.default && !specifications.some(row => row.resolution === resolution.default && row.ratio === ratio.default)) throw new Error('Map the default resolution and aspect ratio to output pixels.');
        const previous = schema?.output;
        const unchanged = previous && previous.estimator === estimator && JSON.stringify(ordered(previous.specifications)) === JSON.stringify(ordered(specifications));
        result.output = {specifications,estimator,estimator_revision:unchanged ? previous.estimator_revision : crypto.randomUUID()};
      }
      const pairs = exclusive.trim() ? exclusive.split('\n').filter(line => line.trim()) : [];
      if (pairs.length > 32) throw new Error('Use at most 32 incompatible control pairs.');
      for (const line of pairs) {
        const names = schemaNames(line,'Incompatible controls',2) as VideoControlName[];
        if (names.length !== 2 || names.some(name => !result.controls[name])) throw new Error('Each incompatible pair needs two configured control names.');
        if (names.every(name => {const rule = result.controls[name]!; return 'default' in rule && rule.default !== null;})) throw new Error('Both incompatible controls cannot have defaults.');
        result.exclusive_controls.push([names[0],names[1]]);
      }
      if (new TextEncoder().encode(JSON.stringify(result)).length > 15_000) throw new Error('Configuration is too large. Reduce the allowed values or roles.');
      if (schema && JSON.stringify(ordered({...schema, revision: ''})) === JSON.stringify(ordered({...result, revision: ''}))) result.revision = schema.revision;
      onApply(result);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Video configuration is invalid.'); }
  }

  return <Dialog open onOpenChange={open => {if (!open) onClose();}}><DialogContent className="niu-modal vendor-dialog">
    <DialogHeader><DialogTitle>Video configuration</DialogTitle><DialogDescription>{modelAlias} · Changes are saved with the model mapping. Configuration does not qualify a live route.</DialogDescription></DialogHeader>
    <form onSubmit={apply} className="grid min-w-0 gap-4">
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="grid w-full grid-cols-3 group-data-[orientation=horizontal]/tabs:h-auto sm:grid-cols-5" aria-label="Video configuration sections"><TabsTrigger value="general" className="h-9">General</TabsTrigger><TabsTrigger value="inputs" className="h-9">Inputs</TabsTrigger><TabsTrigger value="controls" className="h-9">Controls</TabsTrigger><TabsTrigger value="output" className="h-9">Output</TabsTrigger><TabsTrigger value="rules" className="h-9">Rules</TabsTrigger></TabsList>
        <TabsContent value="general" className="grid gap-4 pt-3">
          <Label className="grid gap-2" htmlFor="video-channel">Channel<Input id="video-channel" value={channel} onChange={event => setChannel(event.target.value)} maxLength={256} placeholder="Exact adapter channel" /></Label>
          <div className="grid gap-4 sm:grid-cols-2"><Label className="grid gap-2" htmlFor="video-body-bytes">Maximum request bytes<Input id="video-body-bytes" inputMode="numeric" value={bodyBytes} onChange={event => setBodyBytes(event.target.value)} /></Label><Label className="grid gap-2" htmlFor="video-content-items">Maximum content items<Input id="video-content-items" inputMode="numeric" value={contentItems} onChange={event => setContentItems(event.target.value)} /></Label></div>
          <p className="text-sm text-muted-foreground">Enter contracted limits for this model and channel. Generation controls and media inputs need their own limits.</p>
        </TabsContent>
        <TabsContent value="inputs" className="grid gap-4 pt-3">
          <Label className="grid gap-2" htmlFor="video-input-choice">Input type</Label><DropdownMenu><DropdownMenuTrigger asChild><Button id="video-input-choice" type="button" variant="outline" className="w-full justify-between">{inputLabels[inputName]}<ChevronDown size={16} /></Button></DropdownMenuTrigger><DropdownMenuContent align="start" className="w-[var(--radix-dropdown-menu-trigger-width)]"><DropdownMenuRadioGroup value={inputName} onValueChange={value => setInputName(value as InputName)}>{(Object.keys(inputLabels) as InputName[]).map(name => <DropdownMenuRadioItem key={name} value={name}>{inputLabels[name]}</DropdownMenuRadioItem>)}</DropdownMenuRadioGroup></DropdownMenuContent></DropdownMenu>
          <Label className="flex items-center gap-2"><Checkbox checked={input.enabled} onCheckedChange={value => updateInput({enabled:value === true})} />Configure {inputLabels[inputName].toLowerCase()} input</Label>
          {input.enabled && <>
            <div className="grid gap-4 sm:grid-cols-2"><Label className="grid gap-2" htmlFor="video-input-items">Maximum items<Input id="video-input-items" inputMode="numeric" value={input.items} onChange={event => updateInput({items:event.target.value})} /></Label><Label className="grid gap-2" htmlFor="video-input-bytes">Maximum bytes per item<Input id="video-input-bytes" inputMode="numeric" value={input.bytes} onChange={event => updateInput({bytes:event.target.value})} /></Label></div>
            {inputName !== 'text' && <><Label className="flex items-center gap-2"><Checkbox checked={input.https} onCheckedChange={value => updateInput({https:value === true})} />Allow HTTPS URLs</Label><Label className="grid gap-2" htmlFor="video-input-mime">Allowed Base64 MIME types<Input id="video-input-mime" value={input.mime} onChange={event => updateInput({mime:event.target.value})} placeholder="Comma-separated MIME types" /></Label></>}
            <Label className="grid gap-2" htmlFor="video-input-roles">Allowed roles<Input id="video-input-roles" value={input.roles} onChange={event => updateInput({roles:event.target.value})} placeholder="Comma-separated roles, or leave empty" /></Label>
            <Label className="flex items-center gap-2"><Checkbox checked={input.required} onCheckedChange={value => updateInput({required:value === true})} />Require an input role</Label>
          </>}
          <p className="text-sm text-muted-foreground">A declared media input remains unavailable for dispatch until transport, inspection and the exact input contract are qualified.</p>
        </TabsContent>
        <TabsContent value="controls" className="grid gap-4 pt-3">
          <Label className="grid gap-2" htmlFor="video-control-choice">Generation control</Label><DropdownMenu><DropdownMenuTrigger asChild><Button id="video-control-choice" type="button" variant="outline" className="w-full justify-between">{controlType.label}<ChevronDown size={16} /></Button></DropdownMenuTrigger><DropdownMenuContent align="start" className="max-h-72 w-[var(--radix-dropdown-menu-trigger-width)] overflow-y-auto"><DropdownMenuRadioGroup value={controlName} onValueChange={value => setControlName(value as VideoControlName)}>{(Object.keys(videoControls) as VideoControlName[]).map(name => <DropdownMenuRadioItem key={name} value={name}>{videoControls[name].label}</DropdownMenuRadioItem>)}</DropdownMenuRadioGroup></DropdownMenuContent></DropdownMenu>
          <Label className="flex items-center gap-2"><Checkbox checked={control.enabled} onCheckedChange={value => updateControl({enabled:value === true})} />Configure {controlType.label.toLowerCase()}</Label>
          {control.enabled && <>
            {controlType.kind === 'integer' && <div className="grid gap-4 sm:grid-cols-2"><Label className="grid gap-2" htmlFor="video-control-minimum">Minimum<Input id="video-control-minimum" inputMode="numeric" value={control.minimum} onChange={event => updateControl({minimum:event.target.value})} /></Label><Label className="grid gap-2" htmlFor="video-control-maximum">Maximum<Input id="video-control-maximum" inputMode="numeric" value={control.maximum} onChange={event => updateControl({maximum:event.target.value})} /></Label></div>}
            {controlType.kind === 'choice' && <Label className="grid gap-2" htmlFor="video-control-values">Allowed values<Input id="video-control-values" value={control.values} onChange={event => updateControl({values:event.target.value})} placeholder="Comma-separated values" /></Label>}
            {(controlType.kind === 'integer' || controlType.kind === 'choice') && <Label className="grid gap-2" htmlFor="video-control-default">Default (optional)<Input id="video-control-default" value={control.fallback} onChange={event => updateControl({fallback:event.target.value})} /></Label>}
            {controlType.kind === 'boolean' && <><Label className="grid gap-2" htmlFor="video-control-boolean-default">Default</Label><DropdownMenu><DropdownMenuTrigger asChild><Button id="video-control-boolean-default" type="button" variant="outline" className="w-full justify-between">{control.fallback === '' ? 'No default' : control.fallback === 'true' ? 'True' : 'False'}<ChevronDown size={16} /></Button></DropdownMenuTrigger><DropdownMenuContent align="start" className="w-[var(--radix-dropdown-menu-trigger-width)]"><DropdownMenuRadioGroup value={control.fallback || 'none'} onValueChange={value => updateControl({fallback:value === 'none' ? '' : value})}><DropdownMenuRadioItem value="none">No default</DropdownMenuRadioItem><DropdownMenuRadioItem value="true">True</DropdownMenuRadioItem><DropdownMenuRadioItem value="false">False</DropdownMenuRadioItem></DropdownMenuRadioGroup></DropdownMenuContent></DropdownMenu></>}
            {controlType.kind === 'https_url' && <Label className="grid gap-2" htmlFor="video-control-url-bytes">Maximum URL bytes<Input id="video-control-url-bytes" inputMode="numeric" value={control.bytes} onChange={event => updateControl({bytes:event.target.value})} /></Label>}
            <Label className="flex items-center gap-2"><Checkbox checked={control.required} onCheckedChange={value => updateControl({required:value === true})} />Require this control</Label>
          </>}
        </TabsContent>
        <TabsContent value="output" className="grid min-w-0 gap-4 pt-3">
          <Label className="flex items-center gap-2"><Checkbox checked={outputEnabled} onCheckedChange={value => setOutputEnabled(value === true)} />Configure output estimates</Label>
          {outputEnabled && <>
            <Label className="grid gap-2" htmlFor="video-output-meter">Estimation meter</Label>
            <DropdownMenu><DropdownMenuTrigger asChild><Button id="video-output-meter" type="button" variant="outline" className="w-full justify-between">{estimator === 'SeedancePixelsV1' ? 'Video tokens · Seedance pixels' : 'Seconds · output duration'}<ChevronDown size={16}/></Button></DropdownMenuTrigger><DropdownMenuContent align="start" className="w-[var(--radix-dropdown-menu-trigger-width)]"><DropdownMenuRadioGroup value={estimator} onValueChange={value => setEstimator(value as typeof estimator)}><DropdownMenuRadioItem value="SeedancePixelsV1">Video tokens · Seedance pixels</DropdownMenuRadioItem><DropdownMenuRadioItem value="OutputSecondsV1">Seconds · output duration</DropdownMenuRadioItem></DropdownMenuRadioGroup></DropdownMenuContent></DropdownMenu>
            <p className="text-sm text-muted-foreground">Use contracted output pixels. Duration and frame rate come from Controls. Current direct video dispatch supports video tokens.</p>
            {outputMappings.map((row,index) => <div key={index} className="grid min-w-0 gap-3 py-2">
              <div className="flex items-center justify-between gap-2"><span className="text-sm font-medium">Output mapping {index + 1}</span><Button type="button" variant="ghost" size="sm" onClick={() => setOutputMappings(current => current.filter((_,position) => position !== index))} aria-label={`Remove output mapping ${index + 1}`}>Remove</Button></div>
              <div className="grid min-w-0 gap-3 sm:grid-cols-2">
                <div className="grid min-w-0 gap-2"><Label htmlFor={`output-resolution-${index}`}>Resolution</Label><DropdownMenu><DropdownMenuTrigger asChild><Button id={`output-resolution-${index}`} type="button" variant="outline" className="w-full min-w-0 justify-between"><span className="truncate">{row.resolution || 'Choose resolution'}</span><ChevronDown size={16}/></Button></DropdownMenuTrigger><DropdownMenuContent align="start" className="max-h-64 w-[var(--radix-dropdown-menu-trigger-width)] overflow-y-auto"><DropdownMenuRadioGroup value={row.resolution} onValueChange={value => updateOutput(index,{resolution:value})}>{controls.resolution.values.split(',').map(value => value.trim()).filter((value,index,values) => value && values.indexOf(value) === index).slice(0,64).map(value => <DropdownMenuRadioItem key={value} value={value}>{value}</DropdownMenuRadioItem>)}</DropdownMenuRadioGroup></DropdownMenuContent></DropdownMenu></div>
                <div className="grid min-w-0 gap-2"><Label htmlFor={`output-ratio-${index}`}>Aspect ratio</Label><DropdownMenu><DropdownMenuTrigger asChild><Button id={`output-ratio-${index}`} type="button" variant="outline" className="w-full min-w-0 justify-between"><span className="truncate">{row.ratio || 'Choose aspect ratio'}</span><ChevronDown size={16}/></Button></DropdownMenuTrigger><DropdownMenuContent align="start" className="max-h-64 w-[var(--radix-dropdown-menu-trigger-width)] overflow-y-auto"><DropdownMenuRadioGroup value={row.ratio} onValueChange={value => updateOutput(index,{ratio:value})}>{controls.ratio.values.split(',').map(value => value.trim()).filter((value,index,values) => value && values.indexOf(value) === index).slice(0,64).map(value => <DropdownMenuRadioItem key={value} value={value}>{value}</DropdownMenuRadioItem>)}</DropdownMenuRadioGroup></DropdownMenuContent></DropdownMenu></div>
                <Label className="grid min-w-0 gap-2" htmlFor={`output-width-${index}`}>Width (px)<Input id={`output-width-${index}`} inputMode="numeric" value={row.width} onChange={event => updateOutput(index,{width:event.target.value})}/></Label>
                <Label className="grid min-w-0 gap-2" htmlFor={`output-height-${index}`}>Height (px)<Input id={`output-height-${index}`} inputMode="numeric" value={row.height} onChange={event => updateOutput(index,{height:event.target.value})}/></Label>
              </div>
            </div>)}
            <Button type="button" variant="outline" disabled={outputMappings.length >= 256} onClick={() => setOutputMappings(current => [...current,{resolution:'',ratio:'',width:'',height:''}])}>Add output mapping</Button>
          </>}
        </TabsContent>
        <TabsContent value="rules" className="grid gap-4 pt-3">
          <Label className="grid gap-2" htmlFor="video-exclusive-controls">Incompatible control pairs<Textarea id="video-exclusive-controls" value={exclusive} onChange={event => setExclusive(event.target.value)} placeholder="Two control names per line, separated by a comma" rows={4} /></Label>
          <Label className="flex items-center gap-2"><Checkbox checked={callbacks} onCheckedChange={value => setCallbacks(value === true)} />Callback contract qualified for this schema</Label>
          <p className="text-sm text-muted-foreground">This declaration does not enable callbacks by itself. The adapter and offer review must support the same contract.</p>
        </TabsContent>
      </Tabs>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <DialogFooter className="flex-wrap gap-2">{schema && <Button type="button" variant="ghost" onClick={() => onApply(undefined)}>Remove configuration</Button>}<Button type="button" variant="outline" onClick={onClose}>Cancel</Button><Button type="submit">Apply configuration</Button></DialogFooter>
    </form>
  </DialogContent></Dialog>;
}
