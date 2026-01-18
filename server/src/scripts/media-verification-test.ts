/**
 * Media Verification Test Suite
 *
 * Strict pass/fail test suite that runs before AND after each phase of the
 * media storage consolidation to ensure zero regressions.
 *
 * Usage:
 *   npx tsx server/src/scripts/media-verification-test.ts baseline
 *   npx tsx server/src/scripts/media-verification-test.ts verify
 *
 * Test URLs (fixed - known state):
 *   - /profile/alex_lord_
 *   - /profile/david_stain
 *   - /profile/liiamspears (control - should have 0 broken)
 *   - /profile/bricktiger
 *   - /profile/mattiufr
 *
 * Plus 5 random users selected at baseline time (stored for consistency)
 */

import { query } from '../db/client.js';
import { S3Client, HeadObjectCommand } from '@aws-sdk/client-s3';
import * as fs from 'fs';
import * as path from 'path';
import axios from 'axios';

const S3_BUCKET = 'mhc-media-prod';
const S3_REGION = 'us-east-2';
const S3_PREFIX = 'mhc/media/';

const BASELINE_FILE = path.join(process.cwd(), 'reports', 'media-verification-baseline.json');

// Base URL for HTTP tests (frontend proxy)
const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:8080';

// Fixed test usernames (known state)
const FIXED_TEST_USERNAMES = [
  'alex_lord_',
  'david_stain',
  'liiamspears',
  'bricktiger',
  'mattiufr',
];

interface TestResult {
  username: string;
  personId: string;
  totalImages: number;
  workingImages: number;
  brokenImages: number;
  primaryImageId: string | null;
  primaryImageExists: boolean;
  timestamp: string;
}

interface HttpTestResult {
  username: string;
  apiStatus: number;
  apiImagesCount: number;
  imageUrlsWorking: number;
  imageUrlsBroken: number;
  uiStatus: number;
  uiHasContent: boolean;
  errors: string[];
}

interface Baseline {
  timestamp: string;
  fixedUsers: TestResult[];
  randomUsers: TestResult[];
  randomUsernames: string[];
  httpTests?: HttpTestResult[];
}

let s3Client: S3Client;

function initS3Client() {
  s3Client = new S3Client({
    region: S3_REGION,
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
    },
  });
}

async function checkS3Exists(relativePath: string): Promise<boolean> {
  try {
    const key = `${S3_PREFIX}${relativePath}`;
    await s3Client.send(new HeadObjectCommand({
      Bucket: S3_BUCKET,
      Key: key,
    }));
    return true;
  } catch (error: any) {
    if (error.name === 'NotFound' || error.$metadata?.httpStatusCode === 404) {
      return false;
    }
    throw error;
  }
}

async function getPersonByUsername(username: string): Promise<{ id: string; username: string } | null> {
  const result = await query(
    'SELECT id, username FROM persons WHERE username = $1',
    [username]
  );
  if (result.rows.length === 0) return null;
  const row = result.rows[0] as { id: string; username: string };
  return row;
}

async function selectRandomUsers(count: number): Promise<string[]> {
  // Select random users that have at least some images
  // Note: deleted_at column will be added in future migration
  const result = await query(`
    SELECT username FROM (
      SELECT DISTINCT p.username
      FROM persons p
      JOIN media_locator pi ON pi.person_id = p.id
      WHERE p.username IS NOT NULL
        AND p.username NOT IN (${FIXED_TEST_USERNAMES.map((_, i) => `$${i + 1}`).join(', ')})
    ) sub
    ORDER BY RANDOM()
    LIMIT $${FIXED_TEST_USERNAMES.length + 1}
  `, [...FIXED_TEST_USERNAMES, count]);

  return result.rows.map((r) => (r as { username: string }).username);
}

async function testUser(username: string): Promise<TestResult | null> {
  const person = await getPersonByUsername(username);
  if (!person) {
    console.log(`  ⚠️  User not found: ${username}`);
    return null;
  }

  // Get all images for this person
  // Note: deleted_at column will be added in future migration
  const imagesResult = await query(`
    SELECT id, file_path, is_primary
    FROM media_locator
    WHERE person_id = $1
    ORDER BY uploaded_at DESC
  `, [person.id]);

  const images = imagesResult.rows;
  let workingCount = 0;
  let brokenCount = 0;
  let primaryImageId: string | null = null;
  let primaryImageExists = false;

  for (const img of images) {
    if (img.is_primary) {
      primaryImageId = img.id;
    }

    if (img.file_path) {
      const exists = await checkS3Exists(img.file_path);
      if (exists) {
        workingCount++;
        if (img.is_primary) {
          primaryImageExists = true;
        }
      } else {
        brokenCount++;
      }
    } else {
      brokenCount++;
    }
  }

  return {
    username,
    personId: person.id,
    totalImages: images.length,
    workingImages: workingCount,
    brokenImages: brokenCount,
    primaryImageId,
    primaryImageExists,
    timestamp: new Date().toISOString(),
  };
}

async function runTests(usernames: string[]): Promise<TestResult[]> {
  const results: TestResult[] = [];

  for (const username of usernames) {
    console.log(`Testing ${username}...`);
    const result = await testUser(username);
    if (result) {
      results.push(result);
      console.log(`  Total: ${result.totalImages}, Working: ${result.workingImages}, Broken: ${result.brokenImages}`);
    }
  }

  return results;
}

/**
 * Test HTTP endpoints for a user:
 * - API: GET /api/profile/{username}/images
 * - Image URLs: HEAD request each image URL to verify they return 200
 * - UI: GET /profile/{username}
 */
async function testHttpEndpoints(username: string): Promise<HttpTestResult> {
  const result: HttpTestResult = {
    username,
    apiStatus: 0,
    apiImagesCount: 0,
    imageUrlsWorking: 0,
    imageUrlsBroken: 0,
    uiStatus: 0,
    uiHasContent: false,
    errors: [],
  };

  // Test API endpoint
  let imageUrls: string[] = [];
  try {
    const apiResponse = await axios.get(`${BASE_URL}/api/profile/${username}/images`, {
      timeout: 10000,
    });
    result.apiStatus = apiResponse.status;
    if (apiResponse.data && Array.isArray(apiResponse.data.images)) {
      result.apiImagesCount = apiResponse.data.images.length;
      // Collect image URLs for verification
      imageUrls = apiResponse.data.images
        .filter((img: any) => img.file_path)
        .map((img: any) => `${BASE_URL}/api/storage/s3/${img.file_path}`)
        .slice(0, 10); // Test up to 10 images per user to keep it fast
    }
  } catch (error: any) {
    result.apiStatus = error.response?.status || 0;
    result.errors.push(`API: ${error.message}`);
  }

  // Test each image URL - follow redirects and verify final URL works
  for (const imageUrl of imageUrls) {
    try {
      // First get the redirect to get the presigned S3 URL
      const redirectResponse = await axios.get(imageUrl, {
        timeout: 5000,
        maxRedirects: 0,
        validateStatus: (status) => status === 302,
      });

      // Get the presigned URL from Location header
      const presignedUrl = redirectResponse.headers.location;
      if (!presignedUrl) {
        result.imageUrlsBroken++;
        const filename = imageUrl.substring(imageUrl.lastIndexOf('/') + 1);
        result.errors.push(`Image NO_REDIRECT: ${filename}`);
        continue;
      }

      // Test S3 presigned URL with GET + Range header to minimize data transfer
      // S3 presigned URLs signed for GET don't work with HEAD requests
      const imgResponse = await axios.get(presignedUrl, {
        timeout: 5000,
        headers: { Range: 'bytes=0-0' },
        validateStatus: (status) => status === 200 || status === 206,
      });
      result.imageUrlsWorking++;
    } catch (error: any) {
      result.imageUrlsBroken++;
      const filename = imageUrl.substring(imageUrl.lastIndexOf('/') + 1);
      result.errors.push(`Image ${error.response?.status || 'ERR'}: ${filename}`);
    }
  }

  // Test UI endpoint (just check it returns 200 with content)
  try {
    const uiResponse = await axios.get(`${BASE_URL}/profile/${username}`, {
      timeout: 10000,
    });
    result.uiStatus = uiResponse.status;
    result.uiHasContent = typeof uiResponse.data === 'string' && uiResponse.data.length > 1000;
  } catch (error: any) {
    result.uiStatus = error.response?.status || 0;
    result.errors.push(`UI: ${error.message}`);
  }

  return result;
}

/**
 * Run HTTP tests for all fixed users
 */
async function runHttpTests(usernames: string[]): Promise<HttpTestResult[]> {
  console.log('\nTesting HTTP endpoints:');
  const results: HttpTestResult[] = [];

  for (const username of usernames) {
    console.log(`  Testing ${username}...`);
    const result = await testHttpEndpoints(username);
    results.push(result);

    const apiOk = result.apiStatus === 200;
    const uiOk = result.uiStatus === 200;
    const hasImages = result.apiImagesCount > 0;
    const allImagesWork = result.imageUrlsBroken === 0 && result.imageUrlsWorking > 0;

    if (apiOk && uiOk && hasImages && allImagesWork) {
      console.log(`    ✅ API: ${result.apiStatus} (${result.apiImagesCount} images), Images: ${result.imageUrlsWorking}/${result.imageUrlsWorking + result.imageUrlsBroken} OK, UI: ${result.uiStatus}`);
    } else {
      const issues: string[] = [];
      if (!apiOk) issues.push(`API ${result.apiStatus}`);
      if (!uiOk) issues.push(`UI ${result.uiStatus}`);
      if (!hasImages) issues.push('0 images');
      if (result.imageUrlsBroken > 0) issues.push(`${result.imageUrlsBroken} broken images`);
      console.log(`    ❌ ${issues.join(', ')}`);
      if (result.errors.length > 0) {
        for (const err of result.errors) {
          console.log(`       ${err}`);
        }
      }
    }
  }

  return results;
}

/**
 * Verify HTTP endpoints against baseline expectations
 */
function verifyHttpTests(current: HttpTestResult[], baseline?: HttpTestResult[]): { passed: boolean; failures: string[] } {
  const failures: string[] = [];

  for (const test of current) {
    // API should return 200
    if (test.apiStatus !== 200) {
      failures.push(`${test.username}: API returned ${test.apiStatus}, expected 200`);
    }

    // UI should return 200
    if (test.uiStatus !== 200) {
      failures.push(`${test.username}: UI returned ${test.uiStatus}, expected 200`);
    }

    // Should have at least some images
    if (test.apiImagesCount === 0) {
      failures.push(`${test.username}: API returned 0 images`);
    }

    // All tested image URLs should work (return 200)
    if (test.imageUrlsBroken > 0) {
      failures.push(`${test.username}: ${test.imageUrlsBroken} image URL(s) returned non-200`);
    }

    // If baseline exists, compare counts (should not decrease)
    if (baseline) {
      const baselineTest = baseline.find(b => b.username === test.username);
      if (baselineTest) {
        if (test.apiImagesCount < baselineTest.apiImagesCount) {
          failures.push(`${test.username}: Image count decreased from ${baselineTest.apiImagesCount} to ${test.apiImagesCount}`);
        }
        // Broken image count should not increase
        if (test.imageUrlsBroken > (baselineTest.imageUrlsBroken || 0)) {
          failures.push(`${test.username}: Broken images increased from ${baselineTest.imageUrlsBroken || 0} to ${test.imageUrlsBroken}`);
        }
      }
    }
  }

  return { passed: failures.length === 0, failures };
}

async function createBaseline(): Promise<void> {
  console.log('=== Creating Media Verification Baseline ===\n');

  initS3Client();

  // Test fixed users
  console.log('Testing fixed users:');
  const fixedResults = await runTests(FIXED_TEST_USERNAMES);

  // Select and test random users
  console.log('\nSelecting 5 random users...');
  const randomUsernames = await selectRandomUsers(5);
  console.log(`Selected: ${randomUsernames.join(', ')}\n`);

  console.log('Testing random users:');
  const randomResults = await runTests(randomUsernames);

  // Run HTTP tests for fixed users
  const httpResults = await runHttpTests(FIXED_TEST_USERNAMES);

  // Save baseline
  const baseline: Baseline = {
    timestamp: new Date().toISOString(),
    fixedUsers: fixedResults,
    randomUsers: randomResults,
    randomUsernames,
    httpTests: httpResults,
  };

  // Ensure reports directory exists
  const reportsDir = path.dirname(BASELINE_FILE);
  if (!fs.existsSync(reportsDir)) {
    fs.mkdirSync(reportsDir, { recursive: true });
  }

  fs.writeFileSync(BASELINE_FILE, JSON.stringify(baseline, null, 2));
  console.log(`\n✅ Baseline saved to ${BASELINE_FILE}`);

  // Print summary
  console.log('\n=== Baseline Summary ===');
  console.log('\nFixed Users:');
  for (const r of fixedResults) {
    const status = r.brokenImages === 0 ? '✅' : '⚠️';
    console.log(`  ${status} ${r.username}: ${r.workingImages}/${r.totalImages} working (${r.brokenImages} broken)`);
  }

  console.log('\nRandom Users:');
  for (const r of randomResults) {
    const status = r.brokenImages === 0 ? '✅' : '⚠️';
    console.log(`  ${status} ${r.username}: ${r.workingImages}/${r.totalImages} working (${r.brokenImages} broken)`);
  }

  console.log('\nHTTP Tests:');
  for (const r of httpResults) {
    const ok = r.apiStatus === 200 && r.uiStatus === 200 && r.apiImagesCount > 0 && r.imageUrlsBroken === 0;
    const status = ok ? '✅' : '❌';
    const imgStatus = r.imageUrlsBroken > 0 ? `, Images: ${r.imageUrlsWorking}/${r.imageUrlsWorking + r.imageUrlsBroken} OK` : `, Images: ${r.imageUrlsWorking} OK`;
    console.log(`  ${status} ${r.username}: API ${r.apiStatus} (${r.apiImagesCount} images)${imgStatus}, UI ${r.uiStatus}`);
  }
}

async function verify(): Promise<boolean> {
  console.log('=== Verifying Against Baseline ===\n');

  // Load baseline
  if (!fs.existsSync(BASELINE_FILE)) {
    console.error('❌ No baseline found. Run with "baseline" command first.');
    process.exit(1);
  }

  const baseline: Baseline = JSON.parse(fs.readFileSync(BASELINE_FILE, 'utf-8'));
  console.log(`Baseline from: ${baseline.timestamp}\n`);

  initS3Client();

  let allPassed = true;
  const failures: string[] = [];

  // Test fixed users
  console.log('Testing fixed users:');
  const fixedResults = await runTests(FIXED_TEST_USERNAMES);

  for (const current of fixedResults) {
    const baselineResult = baseline.fixedUsers.find(b => b.username === current.username);
    if (!baselineResult) {
      console.log(`  ⚠️  ${current.username}: No baseline (skipping)`);
      continue;
    }

    const moreBroken = current.brokenImages > baselineResult.brokenImages;
    const fewerWorking = current.workingImages < baselineResult.workingImages;

    if (moreBroken || fewerWorking) {
      allPassed = false;
      failures.push(`${current.username}: Broken ${baselineResult.brokenImages} → ${current.brokenImages}, Working ${baselineResult.workingImages} → ${current.workingImages}`);
      console.log(`  ❌ ${current.username}: REGRESSION`);
      console.log(`     Broken: ${baselineResult.brokenImages} → ${current.brokenImages}`);
      console.log(`     Working: ${baselineResult.workingImages} → ${current.workingImages}`);
    } else {
      const improved = current.brokenImages < baselineResult.brokenImages;
      const status = improved ? '🎉' : '✅';
      console.log(`  ${status} ${current.username}: OK (${current.workingImages}/${current.totalImages})`);
    }
  }

  // Test random users (using same usernames from baseline)
  console.log('\nTesting random users:');
  const randomResults = await runTests(baseline.randomUsernames);

  for (const current of randomResults) {
    const baselineResult = baseline.randomUsers.find(b => b.username === current.username);
    if (!baselineResult) {
      console.log(`  ⚠️  ${current.username}: No baseline (skipping)`);
      continue;
    }

    const moreBroken = current.brokenImages > baselineResult.brokenImages;
    const fewerWorking = current.workingImages < baselineResult.workingImages;

    if (moreBroken || fewerWorking) {
      allPassed = false;
      failures.push(`${current.username}: Broken ${baselineResult.brokenImages} → ${current.brokenImages}, Working ${baselineResult.workingImages} → ${current.workingImages}`);
      console.log(`  ❌ ${current.username}: REGRESSION`);
      console.log(`     Broken: ${baselineResult.brokenImages} → ${current.brokenImages}`);
      console.log(`     Working: ${baselineResult.workingImages} → ${current.workingImages}`);
    } else {
      const improved = current.brokenImages < baselineResult.brokenImages;
      const status = improved ? '🎉' : '✅';
      console.log(`  ${status} ${current.username}: OK (${current.workingImages}/${current.totalImages})`);
    }
  }

  // Run HTTP tests
  const httpResults = await runHttpTests(FIXED_TEST_USERNAMES);
  const httpVerification = verifyHttpTests(httpResults, baseline.httpTests);

  if (!httpVerification.passed) {
    allPassed = false;
    failures.push(...httpVerification.failures);
  }

  // Final result
  console.log('\n=== Verification Result ===');
  if (allPassed) {
    console.log('✅ ALL TESTS PASSED - No regressions detected');
    return true;
  } else {
    console.log('❌ VERIFICATION FAILED - Regressions detected:');
    for (const failure of failures) {
      console.log(`   - ${failure}`);
    }
    console.log('\n⛔ DO NOT PROCEED until regressions are fixed.');
    return false;
  }
}

async function main() {
  const command = process.argv[2];

  switch (command) {
    case 'baseline':
      await createBaseline();
      break;
    case 'verify':
      const passed = await verify();
      process.exit(passed ? 0 : 1);
    default:
      console.log('Usage:');
      console.log('  npx tsx server/src/scripts/media-verification-test.ts baseline');
      console.log('  npx tsx server/src/scripts/media-verification-test.ts verify');
      process.exit(1);
  }

  process.exit(0);
}

main().catch(error => {
  console.error('Error:', error);
  process.exit(1);
});
