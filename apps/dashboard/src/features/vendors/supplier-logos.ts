import openrouter from '@/assets/providers/openrouter.svg';
import newapi from '@/assets/providers/newapi-color.svg';
import azure from '@/assets/providers/azure-color.svg';
import aws from '@/assets/providers/aws.svg';
import googlecloud from '@/assets/providers/googlecloud-color.svg';

// Stable, versioned URLs fit the existing persisted logo_url contract. Recognized
// presets render from bundled assets, without a third-party request in the UI.
const upstream = 'https://raw.githubusercontent.com/lobehub/lobe-icons/329f378cbd1a88f45b60cd096b9111ce16f3ea39/packages/static-svg/icons';
export const supplierLogoPresets = [
  { name: 'OpenRouter', file: 'openrouter', src: openrouter },
  { name: 'New API', file: 'newapi-color', src: newapi },
  { name: 'Azure', file: 'azure-color', src: azure },
  { name: 'AWS', file: 'aws', src: aws },
  { name: 'Google Cloud', file: 'googlecloud-color', src: googlecloud },
].map(preset => ({ ...preset, url: `${upstream}/${preset.file}.svg` }));

export function supplierLogoSource(url: string) {
  return supplierLogoPresets.find(preset => preset.url === url)?.src ?? url;
}
