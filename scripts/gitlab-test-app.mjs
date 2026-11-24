import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';

const html = await readFile(process.argv[3] ?? new URL('../examples/app.html', import.meta.url));
const server = createServer((_request, response) => {
  response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  response.end(html);
});
server.listen(Number(process.argv[2] ?? 31415), '127.0.0.1', () =>
  console.log(server.address().port),
);
for (const signal of ['SIGINT', 'SIGTERM'])
  process.once(signal, () => server.close(() => process.exit()));
