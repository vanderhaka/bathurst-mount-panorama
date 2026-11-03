import type { IncomingMessage, ServerResponse } from 'node:http';

export default function shootout(request: IncomingMessage, response: ServerResponse): void {
  const head = request.method === 'HEAD';
  const read = head || request.method === 'GET';
  response.writeHead(410, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': read ? 'public, max-age=0, s-maxage=300' : 'no-store',
  });
  response.end(head ? undefined : JSON.stringify({ error: 'The game has moved to Racing Live. Open racinglive.app/game/ to play Live Racing and post times.' }));
}
