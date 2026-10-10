import type { APIRoute } from 'astro';
import contract from '../../../../../contracts/generated/handler-operations.json?raw';

// Publish the same generated subset used by the reference page. This endpoint
// is a static build artifact, so it needs neither gateway access nor credentials.
export const prerender = true;

export const GET: APIRoute = () =>
  new Response(contract, {
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
