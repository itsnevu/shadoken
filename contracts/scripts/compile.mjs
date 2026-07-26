import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import solc from 'solc';

const root = new URL('..', import.meta.url).pathname;
const sourcePath = join(root, 'src', 'ShadokenArenaPool.sol');
const source = await readFile(sourcePath, 'utf8');

const input = {
  language: 'Solidity',
  sources: {
    'ShadokenArenaPool.sol': { content: source },
  },
  settings: {
    optimizer: { enabled: true, runs: 200 },
    outputSelection: {
      '*': {
        '*': ['abi', 'evm.bytecode.object', 'evm.deployedBytecode.object'],
      },
    },
  },
};

function findImports(importPath) {
  const candidates = [
    join(root, 'src', importPath),
    join(root, 'node_modules', importPath),
  ];
  for (const candidate of candidates) {
    try {
      return { contents: readFileSync(candidate, 'utf8') };
    } catch {
      /* try next */
    }
  }
  return { error: `Import not found: ${importPath}` };
}

const output = JSON.parse(solc.compile(JSON.stringify(input), { import: findImports }));
if (output.errors) {
  for (const err of output.errors) {
    console.error(`${err.severity}: ${err.formattedMessage}`);
  }
  if (output.errors.some((err) => err.severity === 'error')) process.exit(1);
}

const contract = output.contracts['ShadokenArenaPool.sol'].ShadokenArenaPool;
await mkdir(join(root, 'artifacts'), { recursive: true });
await writeFile(
  join(root, 'artifacts', 'ShadokenArenaPool.json'),
  JSON.stringify(contract, null, 2),
  'utf8',
);
console.log('Wrote artifacts/ShadokenArenaPool.json');
