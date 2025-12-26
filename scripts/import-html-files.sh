#!/bin/bash

# Script to import HTML files from Chaturbate pages

DOWNLOADS_DIR="/Users/tracysmith/Downloads"
API_URL="http://localhost:8080/api/followers"

echo "=== Importing Following (Offline) Pages ==="
total_following=0

# Following Offline pages 1-15
for i in 1 2 3 4 5 6 7 9 10 11 12 13 15; do
  file="$DOWNLOADS_DIR/Following-Offline-Page${i}.html"
  if [ -f "$file" ]; then
    echo -n "Page $i: "
    result=$(curl -s -X POST "$API_URL/update-following" \
      -H "Content-Type: application/json" \
      -d "{\"html\": $(cat "$file" | jq -Rs .)}")
    total=$(echo "$result" | jq -r '.stats.totalFollowing // "error"')
    new=$(echo "$result" | jq -r '.stats.newFollowing // 0')
    echo "Total=$total, New=$new"
    total_following=$total
  fi
done

# Handle Page 14 with typo filename
file="$DOWNLOADS_DIR/Following-Offline-Page14..html"
if [ -f "$file" ]; then
  echo -n "Page 14: "
  result=$(curl -s -X POST "$API_URL/update-following" \
    -H "Content-Type: application/json" \
    -d "{\"html\": $(cat "$file" | jq -Rs .)}")
  total=$(echo "$result" | jq -r '.stats.totalFollowing // "error"')
  new=$(echo "$result" | jq -r '.stats.newFollowing // 0')
  echo "Total=$total, New=$new"
  total_following=$total
fi

echo ""
echo "=== Following Import Complete: $total_following total users ==="
echo ""

echo "=== Importing Followers Pages ==="
total_followers=0

# Followers pages 1-25
for i in $(seq 1 25); do
  file="$DOWNLOADS_DIR/My-Followers-Page${i}.html"
  if [ -f "$file" ]; then
    echo -n "Page $i: "
    result=$(curl -s -X POST "$API_URL/update-followers" \
      -H "Content-Type: application/json" \
      -d "{\"html\": $(cat "$file" | jq -Rs .)}")
    total=$(echo "$result" | jq -r '.stats.totalFollowers // "error"')
    new=$(echo "$result" | jq -r '.stats.newFollowers // 0')
    echo "Total=$total, New=$new"
    total_followers=$total
  fi
done

echo ""
echo "=== Followers Import Complete: $total_followers total users ==="
echo ""
echo "=== SUMMARY ==="
echo "Following: $total_following users"
echo "Followers: $total_followers users"
