import type { APIRoute } from 'astro';
import contract from '../../../../../contracts/generated/handler-operations.json?raw';
import { filterPublicHandlerOperations } from '../../../scripts/openapi-navigation.mjs';

// Publish only customer, model, console, and public operations without
// internal platform/provider endpoints or unreferenced schemas.
const publicHandlerOperations =
  JSON.stringify(filterPublicHandlerOperations(JSON.parse(contract)), null, 2) + '\n';

export const prerender = true;

export const GET: APIRoute = () =>
  new Response(publicHandlerOperations, {
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
