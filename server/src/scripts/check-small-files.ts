import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { createHash } from 'crypto';

const s3Client = new S3Client({
  region: 'us-east-2',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
  },
});

const paths = [
  'people/appolo_allen/snaps/1768281448871_c6f6658d.jpg',
  'people/rafaelosteel/snaps/1768361453099_7cce57a5.jpg',
  'people/89days/auto/89days_1767196629992_8e64ab86.jpg',
];

async function main() {
  for (const path of paths) {
    try {
      const response = await s3Client.send(new GetObjectCommand({
        Bucket: 'mhc-media-prod',
        Key: 'mhc/media/' + path,
      }));

      const body = await response.Body?.transformToByteArray();
      if (body) {
        const hash = createHash('sha256');
        hash.update(Buffer.from(body));
        console.log(`${path}: ${body.length} bytes, SHA256: ${hash.digest('hex').substring(0, 16)}...`);
      }
    } catch (e: any) {
      console.log(`${path}: Error - ${e.message}`);
    }
  }
}

main();
