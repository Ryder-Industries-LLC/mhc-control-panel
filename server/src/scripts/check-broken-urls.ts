/**
 * Check specific broken URLs reported by user
 */

import { S3Client, HeadObjectCommand } from '@aws-sdk/client-s3';

const s3Client = new S3Client({
  region: 'us-east-2',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
  },
});

// Broken URLs from user - extract the path after /images/
const brokenUrls = [
  // david_stain
  'thumbnails/david_stain_1767843822829_f287df8f.jpg',

  // alex_lord_
  'people/alex_lord_/snaps/1768207484373_43996e43.jpg',
  'thumbnails/alex_lord__1767852709228_43996e43.jpg',
  'thumbnails/alex_lord__1767347128484_43996e43.jpg',
  'thumbnails/alex_lord__1767078935654_43996e43.jpg',

  // bricktiger
  'thumbnails/bricktiger_1767680130401_14151505.jpg',
  'thumbnails/bricktiger_1767584120596_14151505.jpg',
  'thumbnails/bricktiger_1767419964241_14151505.jpg',

  // mattiufr
  'thumbnails/mattiufr_1767396009120_33aaaac7.jpg',
  'thumbnails/mattiufr_1767311532741_33aaaac7.jpg',

  // liamwyatt_
  'people/liamwyatt_/uploads/d50d28ca-527b-44c7-beb7-da7ac90562e7.jpg',
  'people/liamwyatt_/uploads/85d2eb07-35b5-43e7-8deb-72578c3a68a8.jpg',
  'people/liamwyatt_/uploads/45f4bcc0-2b33-4228-8825-051d094c816f.jpg',
  'thumbnails/liamwyatt__1767516285644_d648ddae.jpg',
  'thumbnails/liamwyatt__1766988779536_d648ddae.jpg',

  // moonlighter7
  'thumbnails/moonlighter7_1767758768503_9ee95569.jpg',
  'thumbnails/moonlighter7_1766988768577_9ee95569.jpg',

  // kinkracc
  'thumbnails/kinkracc_1767522484438_d98cb895.jpg',
  'thumbnails/kinkracc_1767260393067_d98cb895.jpg',
  'thumbnails/kinkracc_1767178537103_d98cb895.jpg',
];

async function checkS3(path: string): Promise<boolean> {
  try {
    await s3Client.send(new HeadObjectCommand({
      Bucket: 'mhc-media-prod',
      Key: 'mhc/media/' + path,
    }));
    return true;
  } catch (e) {
    return false;
  }
}

async function main() {
  console.log('=== Checking broken URLs in S3 ===\n');

  for (const path of brokenUrls) {
    const exists = await checkS3(path);
    const status = exists ? '✅ EXISTS' : '❌ MISSING';
    console.log(`${status}: ${path}`);

    // If it's a thumbnail, also check the full-size path
    if (path.startsWith('thumbnails/')) {
      const filename = path.replace('thumbnails/', '');
      // Parse filename: {username}_{timestamp}_{hash}.jpg
      // Need to find where username ends - look for pattern _\d{13}_
      const match = filename.match(/^(.+?)_(\d{13})_([a-f0-9]{8})\.(\w+)$/);
      if (match) {
        const [, username, timestamp, hash, ext] = match;
        const fullPath = `people/${username}/auto/${filename}`;
        const fullExists = await checkS3(fullPath);
        console.log(`  Full-size: ${fullExists ? '✅' : '❌'} ${fullPath}`);
      }
    }
  }
}

main().catch(console.error);
