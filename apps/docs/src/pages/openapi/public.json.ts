import type { APIRoute } from 'astro';
import contract from '../../../../../contracts/generated/public-openapi.json?raw';
export const prerender = true;
export const GET: APIRoute = () => new Response(contract, {
  headers: { 'Content-Type': 'application/json; charset=utf-8' },
});
