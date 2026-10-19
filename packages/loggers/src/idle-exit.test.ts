/**
 * Regression tests for https://github.com/mastra-ai/mastra/issues/27360
 *
 * Constructing an idle HttpTransport / UpstashTransport used to keep the
 * Node.js process alive indefinitely because the flush `setInterval` was
 * created referenced. The interval is now unref'd, so a transport with no
 * pending work never blocks a natural process exit.
 */
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';
import { HttpTransport } from './http/index.js';
import { UpstashTransport } from './upstash/index.js';

const tsxCli = fileURLToPath(new URL('../node_modules/tsx/dist/cli.mjs', import.meta.url));
const httpSrc = fileURLToPath(new URL('./http/index.js', import.meta.url));
const upstashSrc = fileURLToPath(new URL('./upstash/index.js', import.meta.url));

function runIdleChild(moduleUrl: string, construct: string): ReturnType<typeof spawnSync> {
  const code = `
    import(${JSON.stringify(moduleUrl)}).then(m => {
      ${construct};
      console.log('child done');
    });
  `;
  return spawnSync(process.execPath, [tsxCli, '--eval', code], { timeout: 20000, encoding: 'utf8' });
}

describe('idle transport does not block process exit (#27360)', () => {
  it('HttpTransport leaves its flush interval unreferenced', () => {
    const transport = new HttpTransport({ url: 'https://example.invalid/logs' });
    try {
      expect((transport as any).flushIntervalId.hasRef()).toBe(false);
    } finally {
      transport.destroy();
    }
  });

  it('UpstashTransport leaves its flush interval unreferenced', () => {
    const transport = new UpstashTransport({
      upstashUrl: 'https://example.invalid',
      upstashToken: 'test',
    });
    try {
      expect((transport as any).flushIntervalId.hasRef()).toBe(false);
    } finally {
      transport.destroy();
    }
  });

  it('a process holding only an idle HttpTransport exits naturally', () => {
    const result = runIdleChild(httpSrc, `new m.HttpTransport({ url: 'https://example.invalid/logs' })`);
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('child done');
  });

  it('a process holding only an idle UpstashTransport exits naturally', () => {
    const result = runIdleChild(
      upstashSrc,
      `new m.UpstashTransport({ upstashUrl: 'https://example.invalid', upstashToken: 'test' })`,
    );
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('child done');
  });
});
