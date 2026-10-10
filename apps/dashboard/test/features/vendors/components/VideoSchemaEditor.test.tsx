import { render, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import VideoSchemaEditor from '@/features/vendors/components/VideoSchemaEditor';
import ModelMappingForm from '@/features/vendors/components/ModelMappingForm';
import { emptyCapabilities, type VendorModel } from '@/features/vendors/api';
import type { VideoSchema } from '@/features/vendors/video-schema';

const schema: VideoSchema = {version:1,revision:'private-schema-revision',model_alias:'video-fixture',upstream_model:'upstream-fixture',channel:'ark-direct-v1',maximum_body_bytes:8192,maximum_content_items:4,inputs:{text:{maximum_items:2,maximum_bytes:4096,https:false,data_mime_types:[],roles:[],role_required:false},image_url:{maximum_items:1,maximum_bytes:2048,https:true,data_mime_types:['image/png'],roles:['reference_image'],role_required:true}},controls:{duration:{kind:'integer',minimum:2,maximum:10,default:5},resolution:{kind:'choice',values:['720p','1080p'],default:'720p'},watermark:{kind:'boolean',default:false}},required_controls:['resolution'],exclusive_controls:[],callbacks_qualified:false};

it('keeps full saved input/control constraints without exposing internal references or claiming qualification', async () => {
  const onApply = vi.fn();
  render(<VideoSchemaEditor modelAlias="video-fixture" upstreamModel="upstream-fixture" schema={schema} onClose={vi.fn()} onApply={onApply}/>);
  expect(document.body.textContent).not.toContain(schema.revision);
  expect(screen.getByText(/Configuration does not qualify a live route/)).toBeTruthy();
  await userEvent.setup().click(screen.getByRole('button',{name:'Apply configuration'}));
  expect(onApply).toHaveBeenCalledTimes(1);
  const saved = onApply.mock.calls[0][0];
  expect(saved).toEqual({...schema,revision:expect.any(String)});
  expect(saved.revision).toBe(schema.revision);
});

it('versions changed constraints while preserving the other model controls', async () => {
  const onApply = vi.fn();
  const user = userEvent.setup();
  render(<VideoSchemaEditor modelAlias={schema.model_alias} upstreamModel={schema.upstream_model} schema={schema} onClose={vi.fn()} onApply={onApply}/>);
  await user.clear(screen.getByLabelText('Maximum request bytes'));
  await user.type(screen.getByLabelText('Maximum request bytes'),'16384');
  await user.click(screen.getByRole('button',{name:'Apply configuration'}));
  expect(onApply.mock.calls[0][0]).toEqual({...schema,maximum_body_bytes:16384,revision:expect.any(String)});
  expect(onApply.mock.calls[0][0].revision).not.toBe(schema.revision);
});

it('builds contracted text and resolution constraints with no assumed limits or model bindings to enter', async () => {
  const onApply = vi.fn();
  const user = userEvent.setup();
  render(<VideoSchemaEditor modelAlias="team/video" upstreamModel="actual-upstream" onClose={vi.fn()} onApply={onApply}/>);
  expect((screen.getByLabelText('Maximum request bytes') as HTMLInputElement).value).toBe('');
  await user.type(screen.getByLabelText('Channel'),'ark-direct-v1');
  await user.type(screen.getByLabelText('Maximum request bytes'),'8192');
  await user.type(screen.getByLabelText('Maximum content items'),'4');
  await user.click(screen.getByRole('tab',{name:'Inputs',exact:true}));
  await user.click(screen.getByRole('checkbox',{name:'Configure text input'}));
  await user.type(screen.getByLabelText('Maximum items'),'2');
  await user.type(screen.getByLabelText('Maximum bytes per item'),'4096');
  await user.click(screen.getByRole('tab',{name:'Controls',exact:true}));
  await user.click(screen.getByLabelText('Generation control'));
  await user.click(screen.getByRole('menuitemradio',{name:'Resolution',exact:true}));
  await user.click(screen.getByRole('checkbox',{name:'Configure resolution'}));
  await user.type(screen.getByLabelText('Allowed values'),'720p, 1080p');
  await user.type(screen.getByLabelText('Default (optional)'),'720p');
  await user.click(screen.getByRole('checkbox',{name:'Require this control'}));
  await user.click(screen.getByRole('button',{name:'Apply configuration'}));
  expect(onApply).toHaveBeenCalledTimes(1);
  expect(onApply.mock.calls[0][0]).toMatchObject({model_alias:'team/video',upstream_model:'actual-upstream',maximum_body_bytes:8192,maximum_content_items:4,inputs:{text:{maximum_items:2,maximum_bytes:4096}},controls:{resolution:{kind:'choice',values:['720p','1080p'],default:'720p'}},required_controls:['resolution'],callbacks_qualified:false});
  expect(onApply.mock.calls[0][0].controls.duration).toBeUndefined();
});

it('rejects mutually defaulted controls and unqualified callbacks before applying the draft', async () => {
  const user = userEvent.setup();
  const onApply = vi.fn();
  render(<VideoSchemaEditor modelAlias={schema.model_alias} upstreamModel={schema.upstream_model} schema={schema} onClose={vi.fn()} onApply={onApply}/>);
  await user.click(screen.getByRole('tab',{name:'Rules',exact:true}));
  await user.type(screen.getByLabelText('Incompatible control pairs'),'duration, resolution');
  await user.click(screen.getByRole('button',{name:'Apply configuration'}));
  expect((await screen.findByRole('alert')).textContent).toContain('Both incompatible controls cannot have defaults');
  expect(onApply).not.toHaveBeenCalled();
  await user.clear(screen.getByLabelText('Incompatible control pairs'));
  await user.click(screen.getByRole('tab',{name:'Controls',exact:true}));
  await user.click(screen.getByLabelText('Generation control'));
  await user.click(screen.getByRole('menuitemradio',{name:'Callback URL',exact:true}));
  await user.click(screen.getByRole('checkbox',{name:'Configure callback url'}));
  await user.type(screen.getByLabelText('Maximum URL bytes'),'4096');
  await user.click(screen.getByRole('button',{name:'Apply configuration'}));
  expect((await screen.findByRole('alert')).textContent).toContain('requires a qualified callback contract');
  expect(onApply).not.toHaveBeenCalled();
});

it('rejects a default outside configured choices and oversized UTF-8 roles', async () => {
  const user = userEvent.setup();
  const onApply = vi.fn();
  render(<VideoSchemaEditor modelAlias={schema.model_alias} upstreamModel={schema.upstream_model} schema={schema} onClose={vi.fn()} onApply={onApply}/>);
  await user.click(screen.getByRole('tab',{name:'Controls',exact:true}));
  await user.click(screen.getByLabelText('Generation control'));
  await user.click(screen.getByRole('menuitemradio',{name:'Resolution',exact:true}));
  await user.clear(screen.getByLabelText('Default (optional)'));
  await user.type(screen.getByLabelText('Default (optional)'),'4k');
  await user.click(screen.getByRole('button',{name:'Apply configuration'}));
  expect((await screen.findByRole('alert')).textContent).toContain('default must be one of them');
  await user.clear(screen.getByLabelText('Default (optional)'));
  await user.click(screen.getByRole('tab',{name:'Inputs',exact:true}));
  await user.click(screen.getByLabelText('Input type'));
  await user.click(screen.getByRole('menuitemradio',{name:'Image',exact:true}));
  await user.clear(screen.getByLabelText('Allowed roles'));
  await user.click(screen.getByLabelText('Allowed roles'));
  await user.paste('界'.repeat(86));
  await user.click(screen.getByRole('button',{name:'Apply configuration'}));
  expect((await screen.findByRole('alert')).textContent).toContain('Image roles needs distinct');
  expect(onApply).not.toHaveBeenCalled();
});

it('does not submit the parent mapping until Save mapping and preserves pricing and revision contracts', async () => {
  const user = userEvent.setup();
  const onSave = vi.fn().mockResolvedValue(undefined);
  const model: VendorModel = {alias:schema.model_alias,upstream_model:schema.upstream_model,vendor_id:'private-key',public_catalog:false,enabled:true,pricing:null,revision:7,capabilities:{...emptyCapabilities(),video_schema:schema}};
  render(<ModelMappingForm model={model} catalog={[]} catalogLoading={false} catalogError="" disabled={false} onCancel={vi.fn()} onSave={onSave}/>);
  await user.click(screen.getByRole('button',{name:'Edit video configuration'}));
  const editor = within(screen.getByRole('dialog',{name:'Video configuration'}));
  await user.click(editor.getByRole('button',{name:'Apply configuration'}));
  expect(onSave).not.toHaveBeenCalled();
  await user.clear(screen.getByLabelText('Upstream model ID'));
  await user.type(screen.getByLabelText('Upstream model ID'),'updated-upstream');
  await user.click(screen.getByRole('button',{name:'Save mapping',exact:true}));
  await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
  const body=onSave.mock.calls[0][0];
  expect(body.expected_revision).toBe(7);
  expect(body.capabilities.video_schema.model_alias).toBe(schema.model_alias);
  expect(body.capabilities.video_schema.upstream_model).toBe('updated-upstream');
  expect(body.capabilities.video_schema.revision).not.toBe(schema.revision);
  expect(body.capabilities.video_schema.inputs).toEqual(schema.inputs);
  expect(body).not.toHaveProperty('pricing');
});

it('cancel leaves the original mapping untouched, and removal is only a draft until mapping save', async () => {
  const user = userEvent.setup();
  const onSave = vi.fn().mockResolvedValue(undefined);
  const model: VendorModel = {alias:schema.model_alias,upstream_model:schema.upstream_model,vendor_id:'private-key',public_catalog:false,enabled:true,pricing:null,revision:7,capabilities:{...emptyCapabilities(),video_schema:schema}};
  render(<ModelMappingForm model={model} catalog={[]} catalogLoading={false} catalogError="" disabled={false} onCancel={vi.fn()} onSave={onSave}/>);
  await user.click(screen.getByRole('button',{name:'Edit video configuration'}));
  await user.click(within(screen.getByRole('dialog')).getByRole('button',{name:'Cancel',exact:true}));
  expect(screen.getByText('Configured · ark-direct-v1')).toBeTruthy();
  await user.click(screen.getByRole('button',{name:'Edit video configuration'}));
  await user.click(screen.getByRole('button',{name:'Remove configuration'}));
  expect(onSave).not.toHaveBeenCalled();
  expect(screen.getByText('No video schema configured')).toBeTruthy();
  await user.click(screen.getByRole('button',{name:'Save mapping',exact:true}));
  expect(onSave.mock.calls[0][0].capabilities.video_schema).toBeUndefined();
});

it('preserves separately configured output mappings when editing request limits', async () => {
  const output = {specifications:[{resolution:'720p',ratio:'16:9',width:1280,height:720}],estimator:'SeedancePixelsV1' as const,estimator_revision:'reviewed-formula'};
  const configured = {...schema,controls:{...schema.controls,ratio:{kind:'choice' as const,values:['16:9'],default:'16:9'},frames_per_second:{kind:'integer' as const,minimum:24,maximum:60,default:24}},output};
  const onApply = vi.fn();const user = userEvent.setup();
  render(<VideoSchemaEditor modelAlias={schema.model_alias} upstreamModel={schema.upstream_model} schema={configured} onClose={vi.fn()} onApply={onApply}/>);
  await user.clear(screen.getByLabelText('Maximum request bytes'));
  await user.type(screen.getByLabelText('Maximum request bytes'),'16384');
  await user.click(screen.getByRole('button',{name:'Apply configuration'}));
  expect(onApply.mock.calls[0][0].output).toEqual(output);
  expect(onApply.mock.calls[0][0].revision).not.toBe(schema.revision);
});


it('edits contracted output pixels and meter without exposing estimator revisions', async () => {
  const user = userEvent.setup(); const onApply = vi.fn();
  const configured: VideoSchema = {...schema,controls:{...schema.controls,ratio:{kind:'choice',values:['16:9'],default:'16:9'},frames_per_second:{kind:'integer',minimum:24,maximum:60,default:24}},output:{specifications:[{resolution:'720p',ratio:'16:9',width:1280,height:720}],estimator:'SeedancePixelsV1',estimator_revision:'private-estimator-revision'}};
  render(<VideoSchemaEditor modelAlias={schema.model_alias} upstreamModel={schema.upstream_model} schema={configured} onClose={vi.fn()} onApply={onApply}/>);
  await user.click(screen.getByRole('tab',{name:'Output',exact:true}));
  expect(document.body.textContent).not.toContain('private-estimator-revision');
  await user.clear(screen.getByLabelText('Width (px)')); await user.type(screen.getByLabelText('Width (px)'),'1920');
  await user.click(screen.getByLabelText('Estimation meter'));
  await user.click(screen.getByRole('menuitemradio',{name:'Seconds · output duration',exact:true}));
  await user.click(screen.getByRole('button',{name:'Apply configuration'}));
  expect(onApply.mock.calls[0][0].output).toMatchObject({estimator:'OutputSecondsV1',specifications:[{width:1920,height:720,resolution:'720p',ratio:'16:9'}]});
  expect(onApply.mock.calls[0][0].output.estimator_revision).not.toBe('private-estimator-revision');
});

it('rejects missing output controls and empty mappings, and can remove estimation without removing request constraints', async () => {
  const user = userEvent.setup(); const onApply = vi.fn();
  render(<VideoSchemaEditor modelAlias={schema.model_alias} upstreamModel={schema.upstream_model} schema={schema} onClose={vi.fn()} onApply={onApply}/>);
  await user.click(screen.getByRole('tab',{name:'Output',exact:true}));
  await user.click(screen.getByRole('checkbox',{name:'Configure output estimates'}));
  await user.click(screen.getByRole('button',{name:'Apply configuration'}));
  expect((await screen.findByRole('alert')).textContent).toContain('require resolution, aspect ratio');
  expect(onApply).not.toHaveBeenCalled();
  await user.click(screen.getByRole('checkbox',{name:'Configure output estimates'}));
  await user.click(screen.getByRole('button',{name:'Apply configuration'}));
  expect(onApply.mock.calls[0][0].controls).toEqual(schema.controls);
  expect(onApply.mock.calls[0][0].output).toBeUndefined();
});

it('accepts seconds estimates without a frame-rate control but keeps pixel estimates strict', async () => {
  const onApply = vi.fn();
  const configured: VideoSchema = {...schema, controls:{...schema.controls, ratio:{kind:'choice', values:['16:9'], default:'16:9'}}, output:{specifications:[{resolution:'720p',ratio:'16:9',width:1280,height:720}], estimator:'OutputSecondsV1', estimator_revision:'seconds-formula'}};
  render(<VideoSchemaEditor modelAlias={schema.model_alias} upstreamModel={schema.upstream_model} schema={configured} onClose={vi.fn()} onApply={onApply}/>);
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', {name:'Apply configuration'}));
  expect(onApply).toHaveBeenCalledTimes(1);
  expect(onApply.mock.calls[0][0].controls.frames_per_second).toBeUndefined();
  expect(onApply.mock.calls[0][0].output).toEqual(configured.output);
  await user.click(screen.getByRole('tab', {name:'Output',exact:true}));
  await user.click(screen.getByLabelText('Estimation meter'));
  await user.click(screen.getByRole('menuitemradio', {name:'Video tokens · Seedance pixels',exact:true}));
  await user.click(screen.getByRole('button', {name:'Apply configuration'}));
  expect(onApply).toHaveBeenCalledTimes(1);
  expect(screen.getByRole('alert').textContent).toContain('frame rate controls');
});
