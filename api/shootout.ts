import type { IncomingMessage, ServerResponse } from 'node:http';

export default function shootout(request: IncomingMessage, response: ServerResponse): void {
  const head = request.method === 'HEAD';
  const read = head || request.method === 'GET';
  response.writeHead(410, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': read ? 'public, max-age=0, s-maxage=300' : 'no-store',
  });
  response.end(head ? undefined : JSON.stringify({ error: 'Bathurst has moved. Open racinglive.app/game/ to play and post times.' }));
}
