// Deployment mounts are plain path segments, never URL-encoded or navigational.
export function validBasePath(path) {
  return typeof path === 'string' && (path === '' || /^\/[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)*$/.test(path));
}

export function deploymentURL(value) {
  if (typeof value !== 'string') throw new Error('Invalid Niu deployment URL');
  const match = /^(https?:\/\/[^\/?#\\]+)(\/[^?#\\]*)?$/.exec(value);
  const url = new URL(value);
  const path = (match?.[2] || '').replace(/\/$/, '');
  if (!match || url.username || url.password || !validBasePath(path) || url.pathname.replace(/\/$/, '') !== path) throw new Error('Use a Niu deployment URL without credentials, query, fragment or unsafe path');
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost','127.0.0.1','[::1]'].includes(url.hostname))) throw new Error('Niu authorization requires HTTPS (or loopback development HTTP)');
  return {origin:url.origin, base_path:path};
}
