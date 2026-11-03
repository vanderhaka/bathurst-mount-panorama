import type { IncomingMessage, ServerResponse } from 'node:http';

export default function shootout(_request: IncomingMessage, response: ServerResponse): void {
  response.writeHead(410, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  response.end(JSON.stringify({ error: 'Bathurst has moved. Open racinglive.app/game/ to play and post times.' }));
}
