import type { Plugin, ViteDevServer } from 'vite';
import { spawn } from 'child_process';
import { existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const pkgRoot   = dirname(fileURLToPath(import.meta.url));
const asmSrcDir = resolve(pkgRoot, 'assembly');

export function assemblyscriptPlugin(): Plugin {
  let compiling = false;

  function compile(): Promise<void> {
    return new Promise((res, rej) => {
      const proc = spawn('npm', ['run', 'build:wasm'], {
        cwd: pkgRoot,
        stdio: 'inherit',
        shell: true,
      });
      proc.on('close', (code) => (code === 0 ? res() : rej(new Error('[asc] compilation failed'))));
    });
  }

  function recompile(server: ViteDevServer): void {
    if (compiling) return;
    compiling = true;
    process.stdout.write('\n[asc] recompiling…\n');
    compile()
      .then(() => {
        process.stdout.write('[asc] done — reloading\n');
        server.ws.send({ type: 'full-reload' });
      })
      .catch(() => process.stderr.write('[asc] compilation failed\n'))
      .finally(() => { compiling = false; });
  }

  return {
    name: 'lag-assemblyscript',
    async buildStart() {
      const wasmPath = resolve(pkgRoot, 'assembly/build/release.wasm');
      if (!existsSync(wasmPath)) {
        process.stdout.write('\n[asc] wasm missing — compiling…\n');
        await compile();
      }
    },
    configureServer(server) {
      server.watcher.add(asmSrcDir);
      server.watcher.on('change', (file) => {
        if (file.startsWith(asmSrcDir) && file.endsWith('.ts')) recompile(server);
      });
    },
  };
}
