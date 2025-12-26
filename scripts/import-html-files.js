#!/usr/bin/env node
/**
 * Script to import HTML files from Chaturbate pages
 * Parses usernames locally to avoid large HTTP payloads
 */

import fs from 'fs';
import path from 'path';
import http from 'http';
import * as cheerio from 'cheerio';

const DOWNLOADS_DIR = '/Users/tracysmith/Downloads';
const API_HOST = 'localhost';
const API_PORT = 8080;

/**
 * Parse following HTML - extracts usernames from room cards
 */
function parseFollowingHTML(html) {
  const $ = cheerio.load(html);
  const usernames = [];

  // Look for room cards with data-room attribute
  $('[data-room]').each((_, element) => {
    const username = $(element).attr('data-room');
    if (username && username.length > 0) {
      usernames.push(username.toLowerCase());
    }
  });

  // Fallback: li.room_list_room
  if (usernames.length === 0) {
    $('li.room_list_room').each((_, element) => {
      const username = $(element).find('a').attr('href')?.replace(/^\//, '').replace(/\/$/, '');
      if (username && username.length > 0) {
        usernames.push(username.toLowerCase());
      }
    });
  }

  return [...new Set(usernames)];
}

/**
 * Parse followers HTML - extracts usernames from follower list
 * Followers have format: <a href="/username/" data-room="">username</a>
 * Note: data-room="" (empty) = actual follower, data-room="username" = following dropdown (exclude)
 */
function parseFollowersHTML(html) {
  const $ = cheerio.load(html);
  const usernames = [];

  // Look for follower links with EMPTY data-room attribute (data-room="")
  // Links with data-room="username" are from the Following dropdown, not followers
  $('a[data-room=""]').each((_, element) => {
    const $el = $(element);
    const href = $el.attr('href');
    const text = $el.text().trim().toLowerCase();

    if (href && text) {
      // Extract username from href (format: /username/)
      const hrefUsername = href.replace(/^\//, '').replace(/\/$/, '').toLowerCase();

      // Only include if the link text matches the href username (actual follower links)
      if (hrefUsername === text && hrefUsername.length > 0) {
        usernames.push(hrefUsername);
      }
    }
  });

  return [...new Set(usernames)];
}

async function sendUsernames(endpoint, usernames) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ usernames });

    const options = {
      hostname: API_HOST,
      port: API_PORT,
      path: endpoint,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error(`Failed to parse response: ${data}`));
        }
      });
    });

    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function main() {
  console.log('=== Importing Following (Offline) Pages ===\n');

  // First, parse all Following files locally
  let allFollowingUsernames = [];

  // Following Offline pages 1-15
  for (let i = 1; i <= 15; i++) {
    const file = path.join(DOWNLOADS_DIR, `Following-Offline-Page${i}.html`);
    if (fs.existsSync(file)) {
      process.stdout.write(`Parsing page ${i}... `);
      const html = fs.readFileSync(file, 'utf-8');
      const usernames = parseFollowingHTML(html);
      console.log(`found ${usernames.length} users`);
      allFollowingUsernames.push(...usernames);
    }
  }

  // Deduplicate
  allFollowingUsernames = [...new Set(allFollowingUsernames)];
  console.log(`\nTotal unique Following usernames parsed: ${allFollowingUsernames.length}`);
  console.log('Uploading to server...');

  try {
    const result = await sendUsernames('/api/followers/update-following', allFollowingUsernames);
    if (result.stats) {
      console.log(`✓ Following imported: Total=${result.stats.totalFollowing}, New=${result.stats.newFollowing}`);
    } else {
      console.log('Error:', result.error || 'Unknown error');
    }
  } catch (e) {
    console.log('Error:', e.message);
  }

  console.log('\n=== Importing Followers Pages ===\n');

  // Parse all Followers files locally
  let allFollowersUsernames = [];

  for (let i = 1; i <= 25; i++) {
    const file = path.join(DOWNLOADS_DIR, `My-Followers-Page${i}.html`);
    if (fs.existsSync(file)) {
      process.stdout.write(`Parsing page ${i}... `);
      const html = fs.readFileSync(file, 'utf-8');
      const usernames = parseFollowersHTML(html);
      console.log(`found ${usernames.length} users`);
      allFollowersUsernames.push(...usernames);
    }
  }

  // Deduplicate
  allFollowersUsernames = [...new Set(allFollowersUsernames)];
  console.log(`\nTotal unique Followers usernames parsed: ${allFollowersUsernames.length}`);
  console.log('Uploading to server...');

  try {
    const result = await sendUsernames('/api/followers/update-followers', allFollowersUsernames);
    if (result.stats) {
      console.log(`✓ Followers imported: Total=${result.stats.totalFollowers}, New=${result.stats.newFollowers}`);
    } else {
      console.log('Error:', result.error || 'Unknown error');
    }
  } catch (e) {
    console.log('Error:', e.message);
  }

  console.log('\n=== FINAL SUMMARY ===');
  console.log(`Following: ${allFollowingUsernames.length} users parsed`);
  console.log(`Followers: ${allFollowersUsernames.length} users parsed`);
}

main().catch(console.error);
