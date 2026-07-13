import { describe, expect, it } from 'vitest';

import { MAX_ASSET_MULTIPART_REQUEST_BYTES, parseDeclaredUploadLength } from './upload-boundary';

describe('asset upload proxy request boundary', () => {
  it('fails closed when Content-Length is missing or malformed', () => {
    expect(parseDeclaredUploadLength(null)).toEqual({ ok: false, status: 411 });
    expect(parseDeclaredUploadLength('chunked')).toEqual({ ok: false, status: 400 });
    expect(parseDeclaredUploadLength('-1')).toEqual({ ok: false, status: 400 });
  });

  it('rejects oversized declared requests before multipart buffering', () => {
    expect(parseDeclaredUploadLength(String(MAX_ASSET_MULTIPART_REQUEST_BYTES + 1))).toEqual({
      ok: false,
      status: 413,
    });
    expect(parseDeclaredUploadLength('1024')).toEqual({ ok: true, bytes: 1024 });
  });
});
