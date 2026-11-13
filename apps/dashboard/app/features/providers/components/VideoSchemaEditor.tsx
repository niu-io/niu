import { useLocale as useUILocale } from '@/shell/ui-locale';
import { useState, type FormEvent } from 'react';
import { IconChevronDown as ChevronDown } from '@tabler/icons-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { schemaInteger, schemaNames, videoControls, type VideoControlName, type VideoSchema } from '../video-schema';
import {
  presetOutputMappings, standardPixels, videoDurationRanges, videoPreset, videoPresets, videoRatioOptions,
  videoResolutionOptions, type PresetDuration, type VideoPresetId,
} from '../video-presets';

type InputDraft = { enabled: boolean; items: string; bytes: string; https: boolean; mime: string; roles: string; required: boolean };
type ControlDraft = { enabled: boolean; minimum: string; maximum: string; values: string; fallback: string; bytes: string; required: boolean };
const inputLabels = { text: 'Text', image_url: 'Image', video_url: 'Video reference', audio_url: 'Audio reference' } as const;
const inputHelp = {
  text: 'Prompt and text content',
  image_url: 'Inline or HTTPS image references',
  video_url: 'Video reference assets',
  audio_url: 'Audio reference assets',
} as const;
type InputName = keyof typeof inputLabels;
const emptyControlDraft: ControlDraft = { enabled: false, minimum: '', maximum: '', values: '', fallback: '', bytes: '', required: false };

function ordered(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(ordered);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, ordered(item)]));
  return value;
}

function inputDrafts(schema?: VideoSchema): Record<InputName, InputDraft> {
  return Object.fromEntries(Object.keys(inputLabels).map(name => {
    const rule = schema?.inputs[name as InputName];
    return [name, { enabled: Boolean(rule), items: String(rule?.maximum_items ?? ''), bytes: String(rule?.maximum_bytes ?? ''), https: rule?.https ?? false, mime: rule?.data_mime_types.join(', ') ?? '', roles: rule?.roles.join(', ') ?? '', required: rule?.role_required ?? false }];
  })) as Record<InputName, InputDraft>;
}

function controlDrafts(schema?: VideoSchema): Record<VideoControlName, ControlDraft> {
  return Object.fromEntries((Object.keys(videoControls) as VideoControlName[]).map(name => {
    const rule = schema?.controls[name];
    return [name, {
      enabled: Boolean(rule),
      minimum: rule?.kind === 'integer' ? String(rule.minimum) : '',
      maximum: rule?.kind === 'integer' ? String(rule.maximum) : '',
      values: rule?.kind === 'choice' ? rule.values.join(', ') : '',
      fallback: rule && 'default' in rule && rule.default !== null ? String(rule.default) : '',
      bytes: rule?.kind === 'https_url' ? String(rule.maximum_bytes) : '',
      required: schema?.required_controls.includes(name) ?? false,
    }];
  })) as Record<VideoControlName, ControlDraft>;
}

function splitNames(value: string) {
  return value.trim() ? value.split(',').map(item => item.trim()).filter(Boolean) : [];
}

function positiveInteger(value: string) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : undefined;
}

export default function VideoSchemaEditor({ modelAlias, upstreamModel, schema, onClose, onApply }: {
  modelAlias: string; upstreamModel: string; schema?: VideoSchema;
  onClose: () => void; onApply: (schema: VideoSchema | undefined) => void;
}) {
  const { t: uiT, format: uiF } = useUILocale();
  const [advanced, setAdvanced] = useState(false);
  const [presetId, setPresetId] = useState<VideoPresetId | ''>('');
  const [tab, setTab] = useState('general');
  const [channel, setChannel] = useState(schema?.channel ?? '');
  const [bodyBytes, setBodyBytes] = useState(String(schema?.maximum_body_bytes ?? ''));
  const [contentItems, setContentItems] = useState(String(schema?.maximum_content_items ?? ''));
  const [callbacks, setCallbacks] = useState(schema?.callbacks_qualified ?? false);
  const [exclusive, setExclusive] = useState(schema?.exclusive_controls.map(pair => pair.join(', ')).join('\n') ?? '');
  const [inputs, setInputs] = useState<Record<InputName, InputDraft>>(() => inputDrafts(schema));
  const [controls, setControls] = useState<Record<VideoControlName, ControlDraft>>(() => controlDrafts(schema));
  const [inputName, setInputName] = useState<InputName>('text');
  const [controlName, setControlName] = useState<VideoControlName>('duration');
  const [outputEnabled, setOutputEnabled] = useState(Boolean(schema?.output));
  const [estimator, setEstimator] = useState<'SeedancePixelsV1' | 'OutputSecondsV1'>(schema?.output?.estimator ?? 'SeedancePixelsV1');
  const [outputMappings, setOutputMappings] = useState(() => schema?.output?.specifications.map(spec => ({...spec,width:String(spec.width),height:String(spec.height)})) ?? []);
  const [error, setError] = useState('');
  const input = inputs[inputName];
  const control = controls[controlName];
  const controlType = videoControls[controlName];
  const duration = controls.duration;
  const selectedPreset = presetId ? videoPreset(presetId) : undefined;
  const resolutionValues = splitNames(controls.resolution.values);
  const ratioValues = splitNames(controls.ratio.values);
  const resolutionChoices = [...new Set<string>([...videoResolutionOptions, ...resolutionValues])];
  const ratioChoices = [...new Set<string>([...videoRatioOptions, ...ratioValues])];
  const durationMinimum = positiveInteger(duration.minimum);
  const durationMaximum = positiveInteger(duration.maximum);
  const durationDefaults = durationMinimum !== undefined && durationMaximum !== undefined && durationMaximum >= durationMinimum && durationMaximum - durationMinimum <= 120
    ? Array.from({ length: durationMaximum - durationMinimum + 1 }, (_, index) => String(durationMinimum + index))
    : [];
  const durationChoices = durationMinimum !== undefined && durationMaximum !== undefined
    ? [...videoDurationRanges, ...(videoDurationRanges.some(range => range.minimum === durationMinimum && range.maximum === durationMaximum) ? [] : [{ minimum: durationMinimum, maximum: durationMaximum, default: durationMinimum }])]
    : [...videoDurationRanges];
  const currentDurationRange = durationMinimum !== undefined && durationMaximum !== undefined && videoDurationRanges.some(range => range.minimum === durationMinimum && range.maximum === durationMaximum)
    ? `${durationMinimum}-${durationMaximum}` : '';

  function updateOutput(index: number, patch: Partial<(typeof outputMappings)[number]>) { setOutputMappings(current => current.map((row,position) => position === index ? {...row,...patch} : row)); }
  function updateInput(patch: Partial<InputDraft>) { setInputs(current => ({...current,[inputName]:{...current[inputName],...patch}})); }
  function updateControl(patch: Partial<ControlDraft>) { setControls(current => ({...current,[controlName]:{...current[controlName],...patch}})); }

  function loadPreset() {
    if (!selectedPreset) return;
    setChannel(selectedPreset.channel);
    setBodyBytes(String(selectedPreset.maximumBodyBytes));
    setContentItems(String(selectedPreset.maximumContentItems));
    setInputs(Object.fromEntries((Object.keys(inputLabels) as InputName[]).map(name => {
      const rule = selectedPreset.inputs[name];
      return [name, {enabled:rule.enabled,items:String(rule.maximumItems),bytes:String(rule.maximumBytes),https:rule.https,mime:rule.dataMimeTypes.join(', '),roles:rule.roles.join(', '),required:rule.roleRequired}];
    })) as Record<InputName, InputDraft>);
    setControls(Object.fromEntries((Object.keys(videoControls) as VideoControlName[]).map(name => {
      if (name === 'duration') return [name, {enabled:true,minimum:String(selectedPreset.duration.minimum),maximum:String(selectedPreset.duration.maximum),values:'',fallback:String(selectedPreset.duration.default),bytes:'',required:false}];
      if (name === 'resolution') return [name, {enabled:true,minimum:'',maximum:'',values:selectedPreset.resolutions.join(', '),fallback:selectedPreset.resolutions[0] ?? '',bytes:'',required:false}];
      if (name === 'ratio') return [name, {enabled:true,minimum:'',maximum:'',values:selectedPreset.ratios.join(', '),fallback:selectedPreset.ratios[0] ?? '',bytes:'',required:false}];
      if (name === 'frames_per_second' && selectedPreset.framesPerSecond) return [name, {enabled:true,minimum:String(selectedPreset.framesPerSecond.minimum),maximum:String(selectedPreset.framesPerSecond.maximum),values:'',fallback:String(selectedPreset.framesPerSecond.default),bytes:'',required:false}];
      return [name, {...emptyControlDraft}];
    })) as Record<VideoControlName, ControlDraft>);
    setOutputEnabled(true);
    setEstimator(selectedPreset.estimator);
    setOutputMappings(presetOutputMappings(selectedPreset).map(row => ({...row,width:String(row.width),height:String(row.height)})));
    setExclusive('');
    setCallbacks(false);
    setError('');
    setTab('general');
  }

  function toggleInput(name: InputName, enabled: boolean) {
    setInputs(current => {
      const existing = current[name];
      if (!enabled) return {...current,[name]:{...existing,enabled:false}};
      if (existing.enabled) return current;
      const bodyLimit = positiveInteger(bodyBytes) ?? 1;
      const contentLimit = positiveInteger(contentItems) ?? 1;
      const defaults = {
        text: { items: 1, bytes: Math.min(65_536, bodyLimit), https: false, mime: '' },
        image_url: { items: 1, bytes: Math.min(4_194_304, bodyLimit), https: true, mime: 'image/png, image/jpeg, image/webp' },
        video_url: { items: 1, bytes: Math.min(8_388_608, bodyLimit), https: true, mime: 'video/mp4' },
        audio_url: { items: 1, bytes: Math.min(4_194_304, bodyLimit), https: true, mime: 'audio/mpeg, audio/wav' },
      }[name];
      return {...current,[name]:{...existing, enabled:true, items:existing.items || String(Math.min(defaults.items, contentLimit)), bytes:existing.bytes || String(defaults.bytes), https:existing.https || defaults.https, mime:existing.mime || defaults.mime}};
    });
  }

  function syncOutputMappings(nextResolutions: string[], nextRatios: string[]) {
    if (!outputEnabled) return;
    setOutputMappings(current => {
      const allowed = new Set(nextResolutions.flatMap(resolution => nextRatios.map(ratio => `${resolution}\u0000${ratio}`)));
      const kept = current.filter(row => allowed.has(`${row.resolution}\u0000${row.ratio}`));
      const seen = new Set(kept.map(row => `${row.resolution}\u0000${row.ratio}`));
      const appended: Array<{ resolution: string; ratio: string; width: string; height: string }> = [];
      for (const resolution of nextResolutions) for (const ratio of nextRatios) {
        const key = `${resolution}\u0000${ratio}`;
        if (seen.has(key)) continue;
        const pixels = standardPixels(resolution, ratio);
        if (!pixels) continue;
        appended.push({resolution, ratio, width: String(pixels.width), height: String(pixels.height)});
        seen.add(key);
      }
      return [...kept, ...appended];
    });
  }

  function toggleChoice(name: 'resolution' | 'ratio', value: string, checked: boolean) {
    const current = controls[name];
    const configured = splitNames(current.values).filter(item => item !== value);
    const next = checked ? [...configured, value] : configured;
    const choices = name === 'resolution' ? resolutionChoices : ratioChoices;
    const values = [...choices.filter(option => next.includes(option)), ...next.filter(option => !choices.includes(option))];
    const fallback = current.fallback && values.includes(current.fallback) ? current.fallback : checked ? value : values[0] ?? '';
    setControls(previous => ({...previous,[name]:{...previous[name],enabled:true,values:values.join(', '),fallback}}));
    syncOutputMappings(name === 'resolution' ? values : resolutionValues, name === 'ratio' ? values : ratioValues);
  }

  function setChoiceDefault(name: 'resolution' | 'ratio', value: string) {
    setControls(current => ({...current,[name]:{...current[name],enabled:true,fallback:value}}));
  }

  function setDurationRange(range: PresetDuration) {
    setControls(current => {
      const existing = Number(current.duration.fallback);
      const within = current.duration.fallback.trim() && Number.isSafeInteger(existing) && existing >= range.minimum && existing <= range.maximum;
      return {...current,duration:{...current.duration,enabled:true,minimum:String(range.minimum),maximum:String(range.maximum),fallback: within ? current.duration.fallback : current.duration.required ? '' : String(range.default)}};
    });
  }

  function apply(event: FormEvent) {
    event.preventDefault();
    event.stopPropagation();
    setError('');
    try {
      if (!channel.trim() || new TextEncoder().encode(channel.trim()).length > 256 || /[\u0000-\u001f\u007f]/.test(channel)) throw new Error('Enter the exact channel name from its verified adapter contract.');
      const maximumBody = schemaInteger(bodyBytes, uiT('Maximum request bytes'), 1, 16_777_216);
      const maximumItems = schemaInteger(contentItems, uiT('Maximum content items'), 1, 32);
      const result: VideoSchema = {version:1,revision:crypto.randomUUID(),model_alias:modelAlias,upstream_model:upstreamModel,channel:channel.trim(),maximum_body_bytes:maximumBody,maximum_content_items:maximumItems,inputs:{},controls:{},required_controls:[],exclusive_controls:[],callbacks_qualified:callbacks};
      for (const name of Object.keys(inputLabels) as InputName[]) {
        const draft = inputs[name];
        if (!draft.enabled) continue;
        const label = uiT(inputLabels[name]);
        const mime = schemaNames(draft.mime, uiF('{0} MIME types', [label]));
        if (mime.some(value => !value.includes('/'))) throw new Error(uiF('{0} MIME types must contain a slash.', [label]));
        const roles = schemaNames(draft.roles, uiF('{0} roles', [label]));
        if (draft.required && !roles.length) throw new Error(uiF('{0} requires at least one allowed role.', [label]));
        if (name !== 'text' && !draft.https && !mime.length) throw new Error(uiF('{0} needs HTTPS input or an allowed Base64 MIME type.', [label]));
        result.inputs[name] = {maximum_items:schemaInteger(draft.items,uiF('{0} maximum items', [label]),1,maximumItems),maximum_bytes:schemaInteger(draft.bytes,uiF('{0} maximum bytes', [label]),1,maximumBody),https:draft.https,data_mime_types:mime,roles,role_required:draft.required};
      }
      if (!Object.keys(result.inputs).length) throw new Error('Configure at least one input type.');
      for (const name of Object.keys(videoControls) as VideoControlName[]) {
        const draft = controls[name];
        if (!draft.enabled) continue;
        const {label,kind} = videoControls[name];
        const controlLabel = uiT(label);
        if (kind === 'integer') {
          const minimum = schemaInteger(draft.minimum,uiF('{0} minimum', [controlLabel]),-Number.MAX_SAFE_INTEGER);
          const maximum = schemaInteger(draft.maximum,uiF('{0} maximum', [controlLabel]),minimum);
          result.controls[name] = {kind,minimum,maximum,default:draft.fallback.trim() ? schemaInteger(draft.fallback,uiF('{0} default', [controlLabel]),minimum,maximum) : null};
        } else if (kind === 'choice') {
          const values = schemaNames(draft.values,uiF('{0} choices', [controlLabel]),64);
          if (!values.length || (draft.fallback.trim() && !values.includes(draft.fallback.trim()))) throw new Error(uiF('{0} needs choices and any default must be one of them.', [controlLabel]));
          result.controls[name] = {kind,values,default:draft.fallback.trim() || null};
        } else if (kind === 'boolean') {
          result.controls[name] = {kind,default:draft.fallback === '' ? null : draft.fallback === 'true'};
        } else {
          if (!callbacks) throw new Error('Callback URL requires a qualified callback contract for this schema.');
          result.controls[name] = {kind,maximum_bytes:schemaInteger(draft.bytes,uiT('Maximum callback URL bytes'),1,8192)};
        }
        if (draft.required) result.required_controls.push(name);
      }
      if (outputEnabled) {
        for (const name of ['resolution','ratio','duration','frames_per_second'] as const) {
          const rule = result.controls[name];
          if (name === 'frames_per_second' && estimator === 'OutputSecondsV1' && !rule) continue;
          if (!rule || !('default' in rule) || (rule.default === null && !result.required_controls.includes(name))) throw new Error(estimator === 'OutputSecondsV1' ? 'Output estimates require resolution, aspect ratio and duration controls, each with a default or required value. Any frame rate control also needs a default or required value.' : 'Output estimates require resolution, aspect ratio, duration and frame rate controls, each with a default or required value.');
          if ((name === 'duration' || name === 'frames_per_second') && (rule.kind !== 'integer' || rule.minimum <= 0 || (name === 'frames_per_second' && rule.maximum > 4_294_967_295))) throw new Error('Output duration and frame rate need positive integer limits.');
        }
        const resolution = result.controls.resolution; const ratio = result.controls.ratio;
        if (resolution?.kind !== 'choice' || ratio?.kind !== 'choice') throw new Error('Output mappings require resolution and aspect ratio choices.');
        if (!outputMappings.length || outputMappings.length > 256) throw new Error('Configure at least one output mapping, up to 256.');
        const specifications = outputMappings.map(row => {
          if (!resolution.values.includes(row.resolution) || !ratio.values.includes(row.ratio)) throw new Error('Each output mapping must use configured resolution and aspect ratio choices.');
          return {...row,width:schemaInteger(row.width,uiT('Output width'),1,4_294_967_295),height:schemaInteger(row.height,uiT('Output height'),1,4_294_967_295)};
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
        const names = schemaNames(line,uiT('Incompatible controls'),2) as VideoControlName[];
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
    <DialogHeader><DialogTitle>{uiT("Video configuration")}</DialogTitle><DialogDescription>{modelAlias}{" "}{uiT("· Changes are saved with the model mapping. Configuration does not qualify a live route.")}</DialogDescription></DialogHeader>
    <form onSubmit={apply} className="grid min-w-0 gap-4">
      {!advanced && <div className="grid gap-5">
        <section className="grid gap-3 rounded-xl bg-muted/55 p-3.5">
          <div className="grid gap-1">
            <h3 className="text-sm font-semibold">{uiT("Start from a template")}</h3>
            <p className="text-sm text-muted-foreground">{uiT("Templates prefill channel, request limits, MIME types and pixel mappings. They are starting points, not verified model capabilities. Review every value against the Provider contract.")}</p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <div className="grid min-w-0 flex-1 gap-2">
              <Label htmlFor="video-preset">{uiT("Template")}</Label>
              <DropdownMenu>
                <DropdownMenuTrigger asChild><Button id="video-preset" type="button" variant="outline" className="w-full justify-between"><span className="truncate">{selectedPreset ? uiT(selectedPreset.name) : uiT("Choose a template")}</span><ChevronDown size={16}/></Button></DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-[var(--radix-dropdown-menu-trigger-width)]"><DropdownMenuRadioGroup value={presetId} onValueChange={value => setPresetId(value as VideoPresetId)}>{videoPresets.map(preset => <DropdownMenuRadioItem key={preset.id} value={preset.id}><span className="grid min-w-0"><strong className="truncate">{uiT(preset.name)}</strong><small className="truncate text-muted-foreground">{preset.channel}</small></span></DropdownMenuRadioItem>)}</DropdownMenuRadioGroup></DropdownMenuContent>
              </DropdownMenu>
            </div>
            <Button type="button" variant="secondary" disabled={!selectedPreset} onClick={loadPreset}>{uiT("Use template")}</Button>
          </div>
          <p className="text-xs text-muted-foreground">{uiT("Using a template replaces this dialog’s draft. Review the advanced overrides before applying; nothing is saved until you apply the configuration and save the model mapping.")}</p>
        </section>

        <section className="grid gap-3">
          <div className="grid gap-1"><h3 className="text-sm font-semibold">{uiT("Request limits")}</h3><p className="text-sm text-muted-foreground">{uiT("Enter contracted limits for this exact model and channel. A template is a starting point, not a verified limit.")}</p></div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Label className="grid gap-2" htmlFor="video-channel">{uiT("Channel")}<Input id="video-channel" value={channel} onChange={event => setChannel(event.target.value)} maxLength={256} placeholder={uiT("Exact adapter channel")} /></Label>
            <Label className="grid gap-2" htmlFor="video-body-bytes">{uiT("Maximum request bytes")}<Input id="video-body-bytes" inputMode="numeric" value={bodyBytes} onChange={event => setBodyBytes(event.target.value)} /></Label>
            <Label className="grid gap-2" htmlFor="video-content-items">{uiT("Maximum content items")}<Input id="video-content-items" inputMode="numeric" value={contentItems} onChange={event => setContentItems(event.target.value)} /></Label>
          </div>
          <p className="text-sm text-muted-foreground">{uiT("Saving these limits does not qualify a live route; they apply only to this model and channel.")}</p>
        </section>

        <fieldset className="grid gap-3">
          <legend className="text-sm font-semibold">{uiT("Supported inputs")}</legend>
          <p className="text-sm text-muted-foreground">{uiT("Choose the input kinds in the exact model and channel contract. Declaring a media input does not enable dispatch until transport, inspection and the exact contract are qualified.")}</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {(Object.keys(inputLabels) as InputName[]).map(name => <Label key={name} className="flex items-start gap-2 rounded-xl bg-muted/55 p-3 font-normal"><Checkbox checked={inputs[name].enabled} onCheckedChange={value => toggleInput(name, value === true)} /><span className="grid gap-0.5"><strong>{uiT(inputLabels[name])}</strong><small className="text-muted-foreground">{uiT(inputHelp[name])}</small></span></Label>)}
          </div>
        </fieldset>

        <fieldset className="grid gap-3">
          <legend className="text-sm font-semibold">{uiT("Resolutions and aspect ratios")}</legend>
          <p className="text-sm text-muted-foreground">{uiT("Select the output values this exact model and channel accepts. Pixel mappings are derived for standard dimensions and remain editable in advanced overrides.")}</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-2">
              <span className="text-sm font-medium">{uiT("Resolutions")}</span>
              <div className="grid grid-cols-2 gap-1.5">{resolutionChoices.map(value => <Label key={value} className="flex items-center gap-2 font-normal"><Checkbox checked={resolutionValues.includes(value)} onCheckedChange={checked => toggleChoice('resolution', value, checked === true)} /><span>{value === '4k' ? '4K' : value}</span></Label>)}</div>
              <span className="text-sm font-medium">{uiT("Default resolution")}</span>
              <DropdownMenu><DropdownMenuTrigger asChild><Button type="button" variant="outline" className="w-full justify-between" disabled={!resolutionValues.length}><span className="truncate">{controls.resolution.fallback || uiT("No default")}</span><ChevronDown size={16}/></Button></DropdownMenuTrigger><DropdownMenuContent align="start" className="w-[var(--radix-dropdown-menu-trigger-width)]"><DropdownMenuRadioGroup value={controls.resolution.fallback || 'none'} onValueChange={value => setChoiceDefault('resolution', value === 'none' ? '' : value)}><DropdownMenuRadioItem value="none">{uiT("No default")}</DropdownMenuRadioItem>{resolutionValues.map(value => <DropdownMenuRadioItem key={value} value={value}>{value === '4k' ? '4K' : value}</DropdownMenuRadioItem>)}</DropdownMenuRadioGroup></DropdownMenuContent></DropdownMenu>
            </div>
            <div className="grid gap-2">
              <span className="text-sm font-medium">{uiT("Aspect ratios")}</span>
              <div className="grid grid-cols-2 gap-1.5">{ratioChoices.map(value => <Label key={value} className="flex items-center gap-2 font-normal"><Checkbox checked={ratioValues.includes(value)} onCheckedChange={checked => toggleChoice('ratio', value, checked === true)} /><span>{value}</span></Label>)}</div>
              <span className="text-sm font-medium">{uiT("Default aspect ratio")}</span>
              <DropdownMenu><DropdownMenuTrigger asChild><Button type="button" variant="outline" className="w-full justify-between" disabled={!ratioValues.length}><span className="truncate">{controls.ratio.fallback || uiT("No default")}</span><ChevronDown size={16}/></Button></DropdownMenuTrigger><DropdownMenuContent align="start" className="w-[var(--radix-dropdown-menu-trigger-width)]"><DropdownMenuRadioGroup value={controls.ratio.fallback || 'none'} onValueChange={value => setChoiceDefault('ratio', value === 'none' ? '' : value)}><DropdownMenuRadioItem value="none">{uiT("No default")}</DropdownMenuRadioItem>{ratioValues.map(value => <DropdownMenuRadioItem key={value} value={value}>{value}</DropdownMenuRadioItem>)}</DropdownMenuRadioGroup></DropdownMenuContent></DropdownMenu>
            </div>
          </div>
        </fieldset>

        <fieldset className="grid gap-3">
          <legend className="text-sm font-semibold">{uiT("Video duration")}</legend>
          <p className="text-sm text-muted-foreground">{uiT("Select a range from the contract. The default is used for output estimates. Arbitrary bounds stay available in advanced overrides.")}</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-2">
              <span className="text-sm font-medium">{uiT("Duration range")}</span>
              <DropdownMenu><DropdownMenuTrigger asChild><Button type="button" variant="outline" className="w-full justify-between"><span className="truncate">{currentDurationRange ? uiF("{0}–{1} seconds", [durationMinimum!, durationMaximum!]) : durationMinimum !== undefined && durationMaximum !== undefined ? uiF("{0}–{1} seconds", [durationMinimum, durationMaximum]) : uiT("No duration range")}</span><ChevronDown size={16}/></Button></DropdownMenuTrigger><DropdownMenuContent align="start" className="w-[var(--radix-dropdown-menu-trigger-width)]"><DropdownMenuRadioGroup value={currentDurationRange} onValueChange={value => { const [minimum, maximum] = value.split('-').map(Number); const range = durationChoices.find(item => item.minimum === minimum && item.maximum === maximum); if (range) setDurationRange(range); }}>{durationChoices.map(range => <DropdownMenuRadioItem key={`${range.minimum}-${range.maximum}`} value={`${range.minimum}-${range.maximum}`}>{uiF("{0}–{1} seconds", [range.minimum, range.maximum])}</DropdownMenuRadioItem>)}</DropdownMenuRadioGroup></DropdownMenuContent></DropdownMenu>
            </div>
            <div className="grid gap-2">
              <span className="text-sm font-medium">{uiT("Default duration")}</span>
              <DropdownMenu><DropdownMenuTrigger asChild><Button type="button" variant="outline" className="w-full justify-between" disabled={!durationDefaults.length}><span className="truncate">{controls.duration.fallback ? uiF("{0} seconds", [controls.duration.fallback]) : uiT("No default")}</span><ChevronDown size={16}/></Button></DropdownMenuTrigger><DropdownMenuContent align="start" className="max-h-64 w-[var(--radix-dropdown-menu-trigger-width)] overflow-y-auto"><DropdownMenuRadioGroup value={controls.duration.fallback || 'none'} onValueChange={value => setControls(current => ({...current,duration:{...current.duration,enabled:true,fallback:value === 'none' ? '' : value}}))}><DropdownMenuRadioItem value="none">{uiT("No default")}</DropdownMenuRadioItem>{durationDefaults.map(value => <DropdownMenuRadioItem key={value} value={value}>{uiF("{0} seconds", [value])}</DropdownMenuRadioItem>)}</DropdownMenuRadioGroup></DropdownMenuContent></DropdownMenu>
            </div>
          </div>
        </fieldset>

        <section className="grid gap-2">
          <h3 className="text-sm font-semibold">{uiT("Output pixel mappings")}</h3>
          {outputEnabled
            ? <p className="text-sm text-muted-foreground">{uiF("Output estimates map {0} resolution and aspect ratio pairs to pixels. Review the estimator and dimensions in advanced overrides.", [String(outputMappings.length)])}</p>
            : <p className="text-sm text-muted-foreground">{uiT("Output estimates are not configured. Enable and review them in advanced overrides.")}</p>}
        </section>
      </div>}

      <Collapsible open={advanced} onOpenChange={setAdvanced} className="grid gap-3 rounded-xl bg-muted/55 p-3.5">
        <CollapsibleTrigger asChild><Button type="button" variant="ghost" className="h-auto w-full justify-between px-0"><span className="grid gap-1 text-left"><span className="font-semibold">{uiT("Advanced schema overrides")}</span><span className="text-sm font-normal text-muted-foreground">{uiT("Edit raw byte limits, MIME types, control bounds and pixel mappings. These values are validated on apply.")}</span></span><ChevronDown size={16} className={advanced ? 'rotate-180 transition-transform' : 'transition-transform'}/></Button></CollapsibleTrigger>
        <CollapsibleContent className="pt-1">
          <Tabs value={tab} onValueChange={setTab}>
            <TabsList className="grid w-full grid-cols-3 group-data-[orientation=horizontal]/tabs:h-auto sm:grid-cols-5" aria-label={uiT("Video configuration sections")}><TabsTrigger value="general" className="h-9">{uiT("General")}</TabsTrigger><TabsTrigger value="inputs" className="h-9">{uiT("Inputs")}</TabsTrigger><TabsTrigger value="controls" className="h-9">{uiT("Controls")}</TabsTrigger><TabsTrigger value="output" className="h-9">{uiT("Output")}</TabsTrigger><TabsTrigger value="rules" className="h-9">{uiT("Rules")}</TabsTrigger></TabsList>
            <TabsContent value="general" className="grid gap-4 pt-3">
              <Label className="grid gap-2" htmlFor="video-channel">{uiT("Channel")}<Input id="video-channel" value={channel} onChange={event => setChannel(event.target.value)} maxLength={256} placeholder={uiT("Exact adapter channel")} /></Label>
              <div className="grid gap-4 sm:grid-cols-2"><Label className="grid gap-2" htmlFor="video-body-bytes">{uiT("Maximum request bytes")}<Input id="video-body-bytes" inputMode="numeric" value={bodyBytes} onChange={event => setBodyBytes(event.target.value)} /></Label><Label className="grid gap-2" htmlFor="video-content-items">{uiT("Maximum content items")}<Input id="video-content-items" inputMode="numeric" value={contentItems} onChange={event => setContentItems(event.target.value)} /></Label></div>
              <p className="text-sm text-muted-foreground">{uiT("Enter contracted limits for this model and channel. Generation controls and media inputs need their own limits.")}</p>
            </TabsContent>
            <TabsContent value="inputs" className="grid gap-4 pt-3">
              <Label className="grid gap-2" htmlFor="video-input-choice">{uiT("Input type")}</Label><DropdownMenu><DropdownMenuTrigger asChild><Button id="video-input-choice" type="button" variant="outline" className="w-full justify-between">{uiT(inputLabels[inputName])}<ChevronDown size={16} /></Button></DropdownMenuTrigger><DropdownMenuContent align="start" className="w-[var(--radix-dropdown-menu-trigger-width)]"><DropdownMenuRadioGroup value={inputName} onValueChange={value => setInputName(value as InputName)}>{(Object.keys(inputLabels) as InputName[]).map(name => <DropdownMenuRadioItem key={name} value={name}>{uiT(inputLabels[name])}</DropdownMenuRadioItem>)}</DropdownMenuRadioGroup></DropdownMenuContent></DropdownMenu>
              <Label className="flex items-center gap-2"><Checkbox checked={input.enabled} onCheckedChange={value => updateInput({enabled:value === true})} />{uiT("Configure")}{" "}{inputLabels[inputName].toLowerCase()}{" "}{uiT("input")}</Label>
              {input.enabled && <>
                <div className="grid gap-4 sm:grid-cols-2"><Label className="grid gap-2" htmlFor="video-input-items">{uiT("Maximum items")}<Input id="video-input-items" inputMode="numeric" value={input.items} onChange={event => updateInput({items:event.target.value})} /></Label><Label className="grid gap-2" htmlFor="video-input-bytes">{uiT("Maximum bytes per item")}<Input id="video-input-bytes" inputMode="numeric" value={input.bytes} onChange={event => updateInput({bytes:event.target.value})} /></Label></div>
                {inputName !== 'text' && <><Label className="flex items-center gap-2"><Checkbox checked={input.https} onCheckedChange={value => updateInput({https:value === true})} />{uiT("Allow HTTPS URLs")}</Label><Label className="grid gap-2" htmlFor="video-input-mime">{uiT("Allowed Base64 MIME types")}<Input id="video-input-mime" value={input.mime} onChange={event => updateInput({mime:event.target.value})} placeholder={uiT("Comma-separated MIME types")} /></Label></>}
                <Label className="grid gap-2" htmlFor="video-input-roles">{uiT("Allowed roles")}<Input id="video-input-roles" value={input.roles} onChange={event => updateInput({roles:event.target.value})} placeholder={uiT("Comma-separated roles, or leave empty")} /></Label>
                <Label className="flex items-center gap-2"><Checkbox checked={input.required} onCheckedChange={value => updateInput({required:value === true})} />{uiT("Require an input role")}</Label>
              </>}
              <p className="text-sm text-muted-foreground">{uiT("A declared media input remains unavailable for dispatch until transport, inspection and the exact input contract are qualified.")}</p>
            </TabsContent>
            <TabsContent value="controls" className="grid gap-4 pt-3">
              <Label className="grid gap-2" htmlFor="video-control-choice">{uiT("Generation control")}</Label><DropdownMenu><DropdownMenuTrigger asChild><Button id="video-control-choice" type="button" variant="outline" className="w-full justify-between">{uiT(controlType.label)}<ChevronDown size={16} /></Button></DropdownMenuTrigger><DropdownMenuContent align="start" className="max-h-72 w-[var(--radix-dropdown-menu-trigger-width)] overflow-y-auto"><DropdownMenuRadioGroup value={controlName} onValueChange={value => setControlName(value as VideoControlName)}>{(Object.keys(videoControls) as VideoControlName[]).map(name => <DropdownMenuRadioItem key={name} value={name}>{uiT(videoControls[name].label)}</DropdownMenuRadioItem>)}</DropdownMenuRadioGroup></DropdownMenuContent></DropdownMenu>
              <Label className="flex items-center gap-2"><Checkbox checked={control.enabled} onCheckedChange={value => updateControl({enabled:value === true})} />{uiT("Configure")}{" "}{uiT(controlType.label).toLowerCase()}</Label>
              {control.enabled && <>
                {controlType.kind === 'integer' && <div className="grid gap-4 sm:grid-cols-2"><Label className="grid gap-2" htmlFor="video-control-minimum">{uiT("Minimum")}<Input id="video-control-minimum" inputMode="numeric" value={control.minimum} onChange={event => updateControl({minimum:event.target.value})} /></Label><Label className="grid gap-2" htmlFor="video-control-maximum">{uiT("Maximum")}<Input id="video-control-maximum" inputMode="numeric" value={control.maximum} onChange={event => updateControl({maximum:event.target.value})} /></Label></div>}
                {controlType.kind === 'choice' && <Label className="grid gap-2" htmlFor="video-control-values">{uiT("Allowed values")}<Input id="video-control-values" value={control.values} onChange={event => updateControl({values:event.target.value})} placeholder={uiT("Comma-separated values")} /></Label>}
                {(controlType.kind === 'integer' || controlType.kind === 'choice') && <Label className="grid gap-2" htmlFor="video-control-default">{uiT("Default (optional)")}<Input id="video-control-default" value={control.fallback} onChange={event => updateControl({fallback:event.target.value})} /></Label>}
                {controlType.kind === 'boolean' && <><Label className="grid gap-2" htmlFor="video-control-boolean-default">{uiT("Default")}</Label><DropdownMenu><DropdownMenuTrigger asChild><Button id="video-control-boolean-default" type="button" variant="outline" className="w-full justify-between">{control.fallback === '' ? uiT("No default") : control.fallback === 'true' ? uiT("True") : uiT("False")}<ChevronDown size={16} /></Button></DropdownMenuTrigger><DropdownMenuContent align="start" className="w-[var(--radix-dropdown-menu-trigger-width)]"><DropdownMenuRadioGroup value={control.fallback || 'none'} onValueChange={value => updateControl({fallback:value === 'none' ? '' : value})}><DropdownMenuRadioItem value="none">{uiT("No default")}</DropdownMenuRadioItem><DropdownMenuRadioItem value="true">{uiT("True")}</DropdownMenuRadioItem><DropdownMenuRadioItem value="false">{uiT("False")}</DropdownMenuRadioItem></DropdownMenuRadioGroup></DropdownMenuContent></DropdownMenu></>}
                {controlType.kind === 'https_url' && <Label className="grid gap-2" htmlFor="video-control-url-bytes">{uiT("Maximum URL bytes")}<Input id="video-control-url-bytes" inputMode="numeric" value={control.bytes} onChange={event => updateControl({bytes:event.target.value})} /></Label>}
                <Label className="flex items-center gap-2"><Checkbox checked={control.required} onCheckedChange={value => updateControl({required:value === true})} />{uiT("Require this control")}</Label>
              </>}
            </TabsContent>
            <TabsContent value="output" className="grid min-w-0 gap-4 pt-3">
              <Label className="flex items-center gap-2"><Checkbox checked={outputEnabled} onCheckedChange={value => setOutputEnabled(value === true)} />{uiT("Configure output estimates")}</Label>
              {outputEnabled && <>
                <Label className="grid gap-2" htmlFor="video-output-meter">{uiT("Estimation meter")}</Label>
                <DropdownMenu><DropdownMenuTrigger asChild><Button id="video-output-meter" type="button" variant="outline" className="w-full justify-between">{estimator === 'SeedancePixelsV1' ? uiT("Video tokens · Seedance pixels") : uiT("Seconds · output duration")}<ChevronDown size={16}/></Button></DropdownMenuTrigger><DropdownMenuContent align="start" className="w-[var(--radix-dropdown-menu-trigger-width)]"><DropdownMenuRadioGroup value={estimator} onValueChange={value => setEstimator(value as typeof estimator)}><DropdownMenuRadioItem value="SeedancePixelsV1">{uiT("Video tokens · Seedance pixels")}</DropdownMenuRadioItem><DropdownMenuRadioItem value="OutputSecondsV1">{uiT("Seconds · output duration")}</DropdownMenuRadioItem></DropdownMenuRadioGroup></DropdownMenuContent></DropdownMenu>
                <p className="text-sm text-muted-foreground">{uiT("Use contracted output pixels and duration from Controls.")}{" "}{estimator === 'OutputSecondsV1' ? uiT("Frame rate is optional for seconds estimation.") : uiT("Pixel estimation requires a frame rate control.")}{" "}{uiT("Channel support is checked separately.")}</p>
                {outputMappings.map((row,index) => <div key={index} className="grid min-w-0 gap-3 py-2">
                  <div className="flex items-center justify-between gap-2"><span className="text-sm font-medium">{uiT("Output mapping")}{" "}{index + 1}</span><Button type="button" variant="ghost" size="sm" onClick={() => setOutputMappings(current => current.filter((_,position) => position !== index))} aria-label={uiF("Remove output mapping {0}", [index + 1])}>{uiT("Remove")}</Button></div>
                  <div className="grid min-w-0 gap-3 sm:grid-cols-2">
                    <div className="grid min-w-0 gap-2"><Label htmlFor={`output-resolution-${index}`}>{uiT("Resolution")}</Label><DropdownMenu><DropdownMenuTrigger asChild><Button id={`output-resolution-${index}`} type="button" variant="outline" className="w-full min-w-0 justify-between"><span className="truncate">{row.resolution || uiT("Choose resolution")}</span><ChevronDown size={16}/></Button></DropdownMenuTrigger><DropdownMenuContent align="start" className="max-h-64 w-[var(--radix-dropdown-menu-trigger-width)] overflow-y-auto"><DropdownMenuRadioGroup value={row.resolution} onValueChange={value => updateOutput(index,{resolution:value})}>{controls.resolution.values.split(',').map(value => value.trim()).filter((value,index,values) => value && values.indexOf(value) === index).slice(0,64).map(value => <DropdownMenuRadioItem key={value} value={value}>{value}</DropdownMenuRadioItem>)}</DropdownMenuRadioGroup></DropdownMenuContent></DropdownMenu></div>
                    <div className="grid min-w-0 gap-2"><Label htmlFor={`output-ratio-${index}`}>{uiT("Aspect ratio")}</Label><DropdownMenu><DropdownMenuTrigger asChild><Button id={`output-ratio-${index}`} type="button" variant="outline" className="w-full min-w-0 justify-between"><span className="truncate">{row.ratio || uiT("Choose aspect ratio")}</span><ChevronDown size={16}/></Button></DropdownMenuTrigger><DropdownMenuContent align="start" className="max-h-64 w-[var(--radix-dropdown-menu-trigger-width)] overflow-y-auto"><DropdownMenuRadioGroup value={row.ratio} onValueChange={value => updateOutput(index,{ratio:value})}>{controls.ratio.values.split(',').map(value => value.trim()).filter((value,index,values) => value && values.indexOf(value) === index).slice(0,64).map(value => <DropdownMenuRadioItem key={value} value={value}>{value}</DropdownMenuRadioItem>)}</DropdownMenuRadioGroup></DropdownMenuContent></DropdownMenu></div>
                    <Label className="grid min-w-0 gap-2" htmlFor={`output-width-${index}`}>{uiT("Width (px)")}<Input id={`output-width-${index}`} inputMode="numeric" value={row.width} onChange={event => updateOutput(index,{width:event.target.value})}/></Label>
                    <Label className="grid min-w-0 gap-2" htmlFor={`output-height-${index}`}>{uiT("Height (px)")}<Input id={`output-height-${index}`} inputMode="numeric" value={row.height} onChange={event => updateOutput(index,{height:event.target.value})}/></Label>
                  </div>
                </div>)}
                <Button type="button" variant="outline" disabled={outputMappings.length >= 256} onClick={() => setOutputMappings(current => [...current,{resolution:'',ratio:'',width:'',height:''}])}>{uiT("Add output mapping")}</Button>
              </>}
            </TabsContent>
            <TabsContent value="rules" className="grid gap-4 pt-3">
              <Label className="grid gap-2" htmlFor="video-exclusive-controls">{uiT("Incompatible control pairs")}<Textarea id="video-exclusive-controls" value={exclusive} onChange={event => setExclusive(event.target.value)} placeholder={uiT("Two control names per line, separated by a comma")} rows={4} /></Label>
              <Label className="flex items-center gap-2"><Checkbox checked={callbacks} onCheckedChange={value => setCallbacks(value === true)} />{uiT("Callback contract qualified for this schema")}</Label>
              <p className="text-sm text-muted-foreground">{uiT("This declaration does not enable callbacks by itself. The adapter and offer review must support the same contract.")}</p>
            </TabsContent>
          </Tabs>
        </CollapsibleContent>
      </Collapsible>
      {advanced && <p className="text-xs text-muted-foreground">{uiT("Raw overrides replace the simple choices in this dialog. Switching back keeps the current draft.")}</p>}
      {error && <p role="alert" className="text-sm text-destructive">{uiT(error)}</p>}
      <DialogFooter className="flex-wrap gap-2">{schema && <Button type="button" variant="ghost" onClick={() => onApply(undefined)}>{uiT("Remove configuration")}</Button>}<Button type="button" variant="outline" onClick={onClose}>{uiT("Cancel")}</Button><Button type="submit">{uiT("Apply configuration")}</Button></DialogFooter>
    </form>
  </DialogContent></Dialog>;
}
