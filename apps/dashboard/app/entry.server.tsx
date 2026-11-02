import { renderToPipeableStream } from 'react-dom/server';
import { ServerRouter, type EntryContext } from 'react-router';

export const streamTimeout = 5_000;

export default function handleRequest(
  request: Request,
  responseStatusCode: number,
  responseHeaders: Headers,
  routerContext: EntryContext,
) {
  if (request.method.toUpperCase() === 'HEAD') {
    return new Response(null, {
      status: responseStatusCode,
      headers: responseHeaders,
    });
  }

  return new Promise<Response>((resolve, reject) => {
    let shellRendered = false;
    const readyOption = routerContext.isSpaMode ? 'onAllReady' : 'onShellReady';
    const timeoutId = setTimeout(() => abort(), streamTimeout + 1000);

    const { pipe, abort } = renderToPipeableStream(
      <ServerRouter context={routerContext} url={request.url} />,
      {
        [readyOption]() {
          shellRendered = true;
          const stream = new ReadableStream<Uint8Array>({
            start(controller) {
              const writable = {
                write(chunk: Uint8Array | string) {
                  controller.enqueue(
                    typeof chunk === 'string' ? new TextEncoder().encode(chunk) : chunk,
                  );
                  return true;
                },
                end() {
                  clearTimeout(timeoutId);
                  controller.close();
                },
                destroy(err?: unknown) {
                  clearTimeout(timeoutId);
                  if (err) controller.error(err);
                },
                on() {
                  return this;
                },
              };
              pipe(writable as unknown as Parameters<typeof pipe>[0]);
            },
            cancel() {
              clearTimeout(timeoutId);
              abort();
            },
          });

          responseHeaders.set('Content-Type', 'text/html; charset=utf-8');
          resolve(
            new Response(stream, {
              headers: responseHeaders,
              status: responseStatusCode,
            }),
          );
        },
        onShellError(error: unknown) {
          clearTimeout(timeoutId);
          reject(error);
        },
        onError(error: unknown) {
          responseStatusCode = 500;
          if (shellRendered) {
            console.error(error);
          }
        },
      },
    );
  });
}
