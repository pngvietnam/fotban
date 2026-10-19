export class InvalidRequestBody extends Error {}

// Bound the stream before buffering/parsing, including requests without Content-Length.
export async function readSmallJson(request: Request, maxBytes: number): Promise<unknown> {
  if (Number(request.headers.get("content-length") ?? 0) > maxBytes) throw new InvalidRequestBody();
  const reader = request.body?.getReader();
  if (!reader) throw new InvalidRequestBody();
  let bytes = 0; const chunks: Uint8Array[] = [];
  try {
    while (true) {
      const chunk = await reader.read(); if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > maxBytes) { await reader.cancel(); throw new InvalidRequestBody(); }
      chunks.push(chunk.value);
    }
    const buffer = new Uint8Array(bytes); let offset = 0;
    for (const chunk of chunks) { buffer.set(chunk, offset); offset += chunk.byteLength; }
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(buffer));
  } catch { throw new InvalidRequestBody(); }
  finally { reader.releaseLock(); }
}
