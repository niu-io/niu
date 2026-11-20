import type { RouteHandle } from '@/shell/router-context';

export const handle: RouteHandle = {
  destination: 'Workspace',
  navTo: 'video',
  title: { en: 'Video settings', zh: '视频设置' },
};

export { default } from './volcengine/page';
