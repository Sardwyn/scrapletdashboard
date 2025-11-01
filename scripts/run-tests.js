import { runCLI } from '@jest/core';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const configModule = await import(path.resolve(__dirname, '../jest.config.js'));
const jestConfig = configModule.default ?? configModule;

const { results } = await runCLI({
  config: JSON.stringify(jestConfig)
}, [process.cwd()]);

if (!results.success) {
  process.exit(1);
}
