import fs from 'fs';
import path from 'path';

const { promises: fsp, constants } = fs;

export function ensureUploadDir(dirPath) {
  if (!dirPath || typeof dirPath !== 'string') {
    throw new Error('Upload directory must be a non-empty string');
  }

  fs.mkdirSync(dirPath, { recursive: true });
  return dirPath;
}

export async function verifyWritable(dirPath) {
  if (!dirPath) return false;

  try {
    await fsp.access(dirPath, constants.W_OK);
    const probe = path.join(dirPath, `.probe-${Date.now()}-${Math.random().toString(16).slice(2)}`);
    await fsp.writeFile(probe, 'probe');
    await fsp.unlink(probe);
    return true;
  } catch (error) {
    return false;
  }
}

export async function prepareUploadDirectory(dirPath) {
  const resolved = ensureUploadDir(dirPath);
  const writable = await verifyWritable(resolved);

  if (!writable) {
    throw new Error(`Upload directory is not writable: ${resolved}`);
  }

  return resolved;
}
