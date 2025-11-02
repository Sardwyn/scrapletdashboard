import fs from 'fs';
import path from 'path';

import { recordApiStatus } from '../utils/metrics.js';



import { recordApiStatus } from '../utils/metrics.js';


const { promises: fsp, constants } = fs;

export function ensureUploadDir(dirPath) {
  if (!dirPath || typeof dirPath !== 'string') {




    recordApiStatus({ service: 'uploads', status: 'error', detail: 'invalid_path' });
    throw new Error('Upload directory must be a non-empty string');
  }

  try {
    fs.mkdirSync(dirPath, { recursive: true });
    recordApiStatus({ service: 'uploads', status: 'success', detail: 'ensure_dir' });
  } catch (error) {
    recordApiStatus({ service: 'uploads', status: 'error', detail: error.message });
    throw error;
  }



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




    recordApiStatus({ service: 'uploads', status: 'success', detail: 'verify_writable' });
    return true;
  } catch (error) {
    recordApiStatus({ service: 'uploads', status: 'error', detail: error.message });

    return true;
  } catch (error) {

    return false;
  }
}

export async function prepareUploadDirectory(dirPath) {
  const resolved = ensureUploadDir(dirPath);
  const writable = await verifyWritable(resolved);

  if (!writable) {

    recordApiStatus({ service: 'uploads', status: 'error', detail: 'not_writable' });
    throw new Error(`Upload directory is not writable: ${resolved}`);
  }

  recordApiStatus({ service: 'uploads', status: 'success', detail: 'prepare_directory' });


    throw new Error(`Upload directory is not writable: ${resolved}`);
  }

  return resolved;
}
