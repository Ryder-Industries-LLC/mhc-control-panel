import { S3Client, HeadObjectCommand } from '@aws-sdk/client-s3';

const s3Client = new S3Client({
  region: 'us-east-2',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
  },
});

async function main() {
  const paths = [
    'people/liamwyatt_/auto/liamwyatt__1767516285645_d648ddae.jpg',
    'people/liamwyatt_/auto/liamwyatt__1767514584154_d648ddae.jpg',
    'people/liamwyatt_/auto/liamwyatt__1767514580143_d648ddae.jpg',
    'people/liamwyatt_/auto/liamwyatt__1766987947798_d648ddae.jpg',
    'people/liamwyatt_/auto/liamwyatt__1766987360293_d648ddae.jpg',
    'people/liamwyatt_/auto/liamwyatt__1766986999625_d648ddae.jpg',
    'people/liamwyatt_/uploads/d50d28ca-527b-44c7-beb7-da7ac90562e7.jpg',
  ];

  for (const path of paths) {
    try {
      await s3Client.send(new HeadObjectCommand({
        Bucket: 'mhc-media-prod',
        Key: 'mhc/media/' + path,
      }));
      console.log('EXISTS:', path);
    } catch (e: any) {
      console.log('MISSING:', path);
    }
  }
}

main();
