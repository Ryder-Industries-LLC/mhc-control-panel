const { storageService } = require('../services/storage/storage.service.js');

async function analyzeS3() {
  await storageService.init();
  const s3Provider = storageService.getS3Provider();

  if (!s3Provider) {
    console.log('S3 provider not available');
    return;
  }

  console.log('Scanning S3 bucket...');
  console.log('');

  const objects = await s3Provider.listObjects('', 2000000);

  const dirCounts = {};
  const dirSizes = {};
  let totalSize = 0;

  for (const obj of objects) {
    totalSize += obj.size || 0;

    const parts = obj.key.split('/');

    if (parts.length === 1) {
      // Root level flat file
      dirCounts['(root - flat files)'] = (dirCounts['(root - flat files)'] || 0) + 1;
      dirSizes['(root - flat files)'] = (dirSizes['(root - flat files)'] || 0) + (obj.size || 0);
    } else if (parts[0] === 'people' && parts.length >= 3) {
      // people/username/folder/file structure
      const folder = parts.length >= 4 ? parts[2] : '(direct)';
      const key = 'people/*/'+folder;
      dirCounts[key] = (dirCounts[key] || 0) + 1;
      dirSizes[key] = (dirSizes[key] || 0) + (obj.size || 0);
    } else {
      // Other structure
      const key = parts.slice(0, Math.min(2, parts.length)).join('/');
      dirCounts[key] = (dirCounts[key] || 0) + 1;
      dirSizes[key] = (dirSizes[key] || 0) + (obj.size || 0);
    }
  }

  console.log('=== S3 Bucket Analysis ===');
  console.log('');
  console.log('Total Objects:', objects.length.toLocaleString());
  console.log('Total Size:', (totalSize / 1024 / 1024 / 1024).toFixed(2), 'GB');
  console.log('');
  console.log('Directory Structure:');
  console.log('');
  console.log('     Count          Size  Path');
  console.log('----------  ------------  ----');

  // Sort by count descending
  const sorted = Object.entries(dirCounts).sort((a, b) => b[1] - a[1]);

  for (const [dir, count] of sorted) {
    const size = dirSizes[dir] || 0;
    const sizeStr = size > 1024*1024*1024
      ? (size / 1024 / 1024 / 1024).toFixed(2) + ' GB'
      : (size / 1024 / 1024).toFixed(2) + ' MB';
    console.log(count.toLocaleString().padStart(10) + '  ' + sizeStr.padStart(12) + '  ' + dir);
  }
}

analyzeS3().catch(console.error);
