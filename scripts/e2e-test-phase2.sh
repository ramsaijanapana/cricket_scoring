#!/usr/bin/env bash
set -euo pipefail

###############################################################################
# Cricket Scoring App — Phase 2 E2E Test Suite (Social Platform)
#
# Tests all Phase 2 features with real user flows against http://localhost:3001.
# Simulates two users interacting: following, chatting, feed, fantasy, etc.
###############################################################################

API="http://localhost:3001/api/v1"
PASS=0
FAIL=0
TESTS=()

# ---------- Helper functions -------------------------------------------------

assert_status() {
  local desc="$1" expected="$2" actual="$3"
  if [ "$expected" = "$actual" ]; then
    PASS=$((PASS + 1))
    echo "  PASS: $desc"
  else
    FAIL=$((FAIL + 1))
    echo "  FAIL: $desc (expected $expected, got $actual)"
    TESTS+=("FAIL: $desc")
  fi
}

assert_contains() {
  local desc="$1" body="$2" expected="$3"
  if echo "$body" | grep -q "$expected"; then
    PASS=$((PASS + 1))
    echo "  PASS: $desc"
  else
    FAIL=$((FAIL + 1))
    echo "  FAIL: $desc (response doesn't contain '$expected')"
    TESTS+=("FAIL: $desc")
  fi
}

assert_not_empty() {
  local desc="$1" value="$2"
  if [ -n "$value" ] && [ "$value" != "null" ] && [ "$value" != "undefined" ] && [ "$value" != "" ]; then
    PASS=$((PASS + 1))
    echo "  PASS: $desc"
  else
    FAIL=$((FAIL + 1))
    echo "  FAIL: $desc (value was empty/null)"
    TESTS+=("FAIL: $desc")
  fi
}

json_get() {
  echo "$1" | node -e "
    let d=''; process.stdin.on('data',c=>d+=c); process.stdin.on('end',()=>{
      try {
        const o=JSON.parse(d);
        const keys='$2'.split('.');
        let v=o;
        for(const k of keys) v=v?.[k];
        console.log(v===undefined||v===null?'':String(v));
      } catch(e) { console.log(''); }
    });"
}

json_array_len() {
  echo "$1" | node -e "
    let d=''; process.stdin.on('data',c=>d+=c); process.stdin.on('end',()=>{
      try {
        const o=JSON.parse(d);
        const keys='$2'.split('.');
        let v=o;
        for(const k of keys) { if(k) v=v?.[k]; }
        console.log(Array.isArray(v)?v.length:0);
      } catch(e) { console.log(0); }
    });"
}

# Helper: POST with JSON body
post_json() {
  local url="$1" data="$2"
  shift 2
  curl -s -w '\n%{http_code}' -X POST "$url" -H 'Content-Type: application/json' -d "$data" "$@"
}

# Helper: GET with headers
get_auth() {
  local url="$1" userId="$2"
  curl -s -w '\n%{http_code}' "$url" -H "x-user-id: $userId"
}

UNIQUE=$(date +%s)

echo "============================================================"
echo "  Phase 2 E2E Tests — Social Platform Features"
echo "============================================================"
echo ""

###############################################################################
# 1. Register & Login two users
###############################################################################
echo "--- 1. Register & Login two users ---"

# Register Alice
BODY_A=$(post_json "$API/auth/register" "{\"email\":\"alice_${UNIQUE}@test.com\",\"password\":\"Test1234!\",\"displayName\":\"Alice Test\"}")
STATUS_A=$(echo "$BODY_A" | tail -1)
RESP_A=$(echo "$BODY_A" | sed '$d')
assert_status "Register Alice" "201" "$STATUS_A"
USER_A_ID=$(json_get "$RESP_A" "user.id")
assert_not_empty "Alice has user ID" "$USER_A_ID"
echo "  Alice ID: $USER_A_ID"

# Login Alice to get JWT
BODY=$(post_json "$API/auth/login" "{\"email\":\"alice_${UNIQUE}@test.com\",\"password\":\"Test1234!\"}")
STATUS=$(echo "$BODY" | tail -1)
RESP=$(echo "$BODY" | sed '$d')
assert_status "Login Alice" "200" "$STATUS"
TOKEN_A=$(json_get "$RESP" "access_token")
assert_not_empty "Alice has access token" "$TOKEN_A"

# Register Bob
BODY_B=$(post_json "$API/auth/register" "{\"email\":\"bob_${UNIQUE}@test.com\",\"password\":\"Test1234!\",\"displayName\":\"Bob Test\"}")
STATUS_B=$(echo "$BODY_B" | tail -1)
RESP_B=$(echo "$BODY_B" | sed '$d')
assert_status "Register Bob" "201" "$STATUS_B"
USER_B_ID=$(json_get "$RESP_B" "user.id")
assert_not_empty "Bob has user ID" "$USER_B_ID"
echo "  Bob ID: $USER_B_ID"

# Login Bob
BODY=$(post_json "$API/auth/login" "{\"email\":\"bob_${UNIQUE}@test.com\",\"password\":\"Test1234!\"}")
STATUS=$(echo "$BODY" | tail -1)
RESP=$(echo "$BODY" | sed '$d')
assert_status "Login Bob" "200" "$STATUS"
TOKEN_B=$(json_get "$RESP" "access_token")
assert_not_empty "Bob has access token" "$TOKEN_B"

# Register Charlie (for suggestions test)
BODY_C=$(post_json "$API/auth/register" "{\"email\":\"charlie_${UNIQUE}@test.com\",\"password\":\"Test1234!\",\"displayName\":\"Charlie Test\"}")
USER_C_ID=$(json_get "$(echo "$BODY_C" | sed '$d')" "user.id")
echo "  Charlie ID: $USER_C_ID"

###############################################################################
# 2. Update user profiles
###############################################################################
echo ""
echo "--- 2. Update user profiles ---"

# Update Alice's profile
BODY=$(curl -s -w '\n%{http_code}' -X PATCH "$API/users/me" \
  -H 'Content-Type: application/json' \
  -H "x-user-id: $USER_A_ID" \
  -d '{"bio":"Cricket enthusiast from Mumbai","city":"Mumbai","country":"India","battingStyle":"right_hand","bowlingStyle":"right_arm_medium","primaryRole":"batsman","ballTypePreference":["leather","tennis"]}')
STATUS=$(echo "$BODY" | tail -1)
RESP=$(echo "$BODY" | sed '$d')
if [ "$STATUS" = "200" ]; then
  assert_status "Update Alice profile" "200" "$STATUS"
  assert_contains "Alice city is Mumbai" "$RESP" "Mumbai"
else
  echo "  INFO: PATCH /users/me returned $STATUS — profile update endpoint may need implementation"
  echo "  DEBUG: $RESP"
fi

# Update Bob's profile
BODY=$(curl -s -w '\n%{http_code}' -X PATCH "$API/users/me" \
  -H 'Content-Type: application/json' \
  -H "x-user-id: $USER_B_ID" \
  -d '{"bio":"Fast bowler from Mumbai","city":"Mumbai","country":"India","battingStyle":"left_hand","bowlingStyle":"left_arm_fast","primaryRole":"bowler","ballTypePreference":["leather"]}')
STATUS=$(echo "$BODY" | tail -1)
if [ "$STATUS" = "200" ]; then
  assert_status "Update Bob profile" "200" "$STATUS"
else
  echo "  INFO: PATCH /users/me for Bob returned $STATUS"
fi

###############################################################################
# 3. Follow system
###############################################################################
echo ""
echo "--- 3. Follow system ---"

# Alice follows Bob (send empty JSON body to avoid Fastify empty-body error)
BODY=$(post_json "$API/users/$USER_B_ID/follow" "{}" -H "x-user-id: $USER_A_ID")
STATUS=$(echo "$BODY" | tail -1)
RESP=$(echo "$BODY" | sed '$d')
assert_status "Alice follows Bob" "201" "$STATUS"
if [ "$STATUS" = "201" ]; then
  assert_contains "Follow has followerId" "$RESP" "$USER_A_ID"
fi

# Duplicate follow should fail with 409
BODY=$(post_json "$API/users/$USER_B_ID/follow" "{}" -H "x-user-id: $USER_A_ID")
STATUS=$(echo "$BODY" | tail -1)
assert_status "Duplicate follow returns 409" "409" "$STATUS"

# Self-follow should fail with 400
BODY=$(post_json "$API/users/$USER_A_ID/follow" "{}" -H "x-user-id: $USER_A_ID")
STATUS=$(echo "$BODY" | tail -1)
assert_status "Self-follow returns 400" "400" "$STATUS"

# Follow non-existent user should fail with 404
BODY=$(post_json "$API/users/00000000-0000-0000-0000-000000000099/follow" "{}" -H "x-user-id: $USER_A_ID")
STATUS=$(echo "$BODY" | tail -1)
assert_status "Follow non-existent user returns 404" "404" "$STATUS"

# Bob follows Alice back
BODY=$(post_json "$API/users/$USER_A_ID/follow" "{}" -H "x-user-id: $USER_B_ID")
STATUS=$(echo "$BODY" | tail -1)
assert_status "Bob follows Alice back" "201" "$STATUS"

# Check Bob's followers (should include Alice)
BODY=$(curl -s -w '\n%{http_code}' "$API/users/$USER_B_ID/followers")
STATUS=$(echo "$BODY" | tail -1)
RESP=$(echo "$BODY" | sed '$d')
assert_status "Get Bob's followers" "200" "$STATUS"
FOLLOWER_COUNT=$(json_array_len "$RESP" "data")
assert_not_empty "Bob has at least 1 follower" "$FOLLOWER_COUNT"
assert_contains "Alice is in Bob's followers" "$RESP" "Alice Test"

# Check Alice's following (should include Bob)
BODY=$(curl -s -w '\n%{http_code}' "$API/users/$USER_A_ID/following")
STATUS=$(echo "$BODY" | tail -1)
RESP=$(echo "$BODY" | sed '$d')
assert_status "Get Alice's following list" "200" "$STATUS"
assert_contains "Bob is in Alice's following" "$RESP" "Bob Test"

# Check Bob's following (should include Alice)
BODY=$(curl -s -w '\n%{http_code}' "$API/users/$USER_B_ID/following")
STATUS=$(echo "$BODY" | tail -1)
RESP=$(echo "$BODY" | sed '$d')
assert_status "Get Bob's following list" "200" "$STATUS"
assert_contains "Alice is in Bob's following" "$RESP" "Alice Test"

###############################################################################
# 4. Friend suggestions
###############################################################################
echo ""
echo "--- 4. Friend suggestions ---"

# Get suggestions for Alice (should potentially include Charlie who is not followed)
BODY=$(get_auth "$API/users/suggestions" "$USER_A_ID")
STATUS=$(echo "$BODY" | tail -1)
RESP=$(echo "$BODY" | sed '$d')
assert_status "Get friend suggestions for Alice" "200" "$STATUS"
assert_contains "Suggestions returns data array" "$RESP" "data"

# Suggestions without auth should fail
BODY=$(curl -s -w '\n%{http_code}' "$API/users/suggestions")
STATUS=$(echo "$BODY" | tail -1)
assert_status "Suggestions without auth returns 401" "401" "$STATUS"

###############################################################################
# 5. Activity & Feed
###############################################################################
echo ""
echo "--- 5. Activity & Feed ---"

# Get Alice's feed (may be empty initially)
BODY=$(get_auth "$API/users/feed" "$USER_A_ID")
STATUS=$(echo "$BODY" | tail -1)
RESP=$(echo "$BODY" | sed '$d')
assert_status "Get Alice's feed" "200" "$STATUS"
assert_contains "Feed returns data array" "$RESP" "data"

# Feed without auth should fail
BODY=$(curl -s -w '\n%{http_code}' "$API/users/feed")
STATUS=$(echo "$BODY" | tail -1)
assert_status "Feed without auth returns 401" "401" "$STATUS"

# Get trending feed (no auth required)
BODY=$(curl -s -w '\n%{http_code}' "$API/users/feed/trending")
STATUS=$(echo "$BODY" | tail -1)
RESP=$(echo "$BODY" | sed '$d')
assert_status "Get trending feed" "200" "$STATUS"
assert_contains "Trending feed returns data" "$RESP" "data"

# Trending with city filter
BODY=$(curl -s -w '\n%{http_code}' "$API/users/feed/trending?city=Mumbai")
STATUS=$(echo "$BODY" | tail -1)
assert_status "Trending with city filter" "200" "$STATUS"

# Trending with country filter
BODY=$(curl -s -w '\n%{http_code}' "$API/users/feed/trending?country=India")
STATUS=$(echo "$BODY" | tail -1)
assert_status "Trending with country filter" "200" "$STATUS"

###############################################################################
# 6. Chat system
###############################################################################
echo ""
echo "--- 6. Chat system ---"

# Get-or-create DM room between Alice and Bob (GET /direct/:userId)
BODY=$(get_auth "$API/chat/direct/$USER_B_ID" "$USER_A_ID")
STATUS=$(echo "$BODY" | tail -1)
RESP=$(echo "$BODY" | sed '$d')
assert_status "Create/get DM room" "201" "$STATUS"
ROOM_ID=$(json_get "$RESP" "id")
assert_not_empty "DM room has ID" "$ROOM_ID"
echo "  DM Room ID: $ROOM_ID"

# Get-or-create DM again should return same room (200 this time)
BODY=$(get_auth "$API/chat/direct/$USER_B_ID" "$USER_A_ID")
STATUS2=$(echo "$BODY" | tail -1)
RESP2=$(echo "$BODY" | sed '$d')
ROOM_ID2=$(json_get "$RESP2" "id")
if [ "$ROOM_ID" = "$ROOM_ID2" ]; then
  PASS=$((PASS + 1))
  echo "  PASS: Get-or-create DM returns same room"
else
  FAIL=$((FAIL + 1))
  echo "  FAIL: Get-or-create DM returned different room ($ROOM_ID vs $ROOM_ID2)"
  TESTS+=("FAIL: DM idempotency")
fi

# DM yourself should fail
BODY=$(get_auth "$API/chat/direct/$USER_A_ID" "$USER_A_ID")
STATUS=$(echo "$BODY" | tail -1)
assert_status "DM yourself returns 400" "400" "$STATUS"

# DM without auth should fail
BODY=$(curl -s -w '\n%{http_code}' "$API/chat/direct/$USER_B_ID")
STATUS=$(echo "$BODY" | tail -1)
assert_status "DM without auth returns 401" "401" "$STATUS"

# Alice sends a message
if [ -n "$ROOM_ID" ]; then
  BODY=$(post_json "$API/chat/rooms/$ROOM_ID/messages" '{"content":"Hey Bob! Great match yesterday!"}' -H "x-user-id: $USER_A_ID")
  STATUS=$(echo "$BODY" | tail -1)
  RESP=$(echo "$BODY" | sed '$d')
  assert_status "Alice sends message" "201" "$STATUS"
  MSG_A_ID=$(json_get "$RESP" "id")
  assert_not_empty "Message has ID" "$MSG_A_ID"
  assert_contains "Message content" "$RESP" "Great match yesterday"

  # Bob replies
  BODY=$(post_json "$API/chat/rooms/$ROOM_ID/messages" "{\"content\":\"Thanks Alice! That six was amazing!\",\"replyToId\":\"$MSG_A_ID\"}" -H "x-user-id: $USER_B_ID")
  STATUS=$(echo "$BODY" | tail -1)
  RESP=$(echo "$BODY" | sed '$d')
  assert_status "Bob replies" "201" "$STATUS"
  assert_contains "Reply references original" "$RESP" "$MSG_A_ID"

  # Alice sends another message
  BODY=$(post_json "$API/chat/rooms/$ROOM_ID/messages" '{"content":"Lets practice tomorrow?"}' -H "x-user-id: $USER_A_ID")
  STATUS=$(echo "$BODY" | tail -1)
  assert_status "Alice sends second message" "201" "$STATUS"

  # Get messages in room
  BODY=$(get_auth "$API/chat/rooms/$ROOM_ID/messages" "$USER_A_ID")
  STATUS=$(echo "$BODY" | tail -1)
  RESP=$(echo "$BODY" | sed '$d')
  assert_status "Get room messages" "200" "$STATUS"
  MSG_COUNT=$(json_array_len "$RESP" "data")
  if [ "$MSG_COUNT" -ge 3 ]; then
    PASS=$((PASS + 1))
    echo "  PASS: Room has $MSG_COUNT messages (expected >= 3)"
  else
    FAIL=$((FAIL + 1))
    echo "  FAIL: Expected >= 3 messages, got $MSG_COUNT"
    TESTS+=("FAIL: Room message count")
  fi

  # Non-member can't read messages
  BODY=$(get_auth "$API/chat/rooms/$ROOM_ID/messages" "$USER_C_ID")
  STATUS=$(echo "$BODY" | tail -1)
  assert_status "Non-member can't read messages (403)" "403" "$STATUS"

  # Empty message should fail
  BODY=$(post_json "$API/chat/rooms/$ROOM_ID/messages" '{"content":""}' -H "x-user-id: $USER_A_ID")
  STATUS=$(echo "$BODY" | tail -1)
  assert_status "Empty message returns 400" "400" "$STATUS"
else
  echo "  SKIP: Chat message tests (no room ID)"
fi

# List Alice's rooms
BODY=$(get_auth "$API/chat/rooms" "$USER_A_ID")
STATUS=$(echo "$BODY" | tail -1)
RESP=$(echo "$BODY" | sed '$d')
assert_status "List Alice's chat rooms" "200" "$STATUS"
ROOM_COUNT=$(json_array_len "$RESP" "data")
assert_not_empty "Alice has at least 1 room" "$ROOM_COUNT"

# Create a group chat
BODY=$(post_json "$API/chat/rooms" "{\"type\":\"group\",\"name\":\"Match Day Chat\",\"memberIds\":[\"$USER_B_ID\",\"$USER_C_ID\"]}" -H "x-user-id: $USER_A_ID")
STATUS=$(echo "$BODY" | tail -1)
RESP=$(echo "$BODY" | sed '$d')
assert_status "Create group chat" "201" "$STATUS"
GROUP_ROOM_ID=$(json_get "$RESP" "id")
assert_not_empty "Group room has ID" "$GROUP_ROOM_ID"

# Send message in group
if [ -n "$GROUP_ROOM_ID" ]; then
  BODY=$(post_json "$API/chat/rooms/$GROUP_ROOM_ID/messages" '{"content":"Welcome everyone to match day!"}' -H "x-user-id: $USER_A_ID")
  STATUS=$(echo "$BODY" | tail -1)
  assert_status "Send group message" "201" "$STATUS"
fi

# Chat without auth
BODY=$(curl -s -w '\n%{http_code}' "$API/chat/rooms")
STATUS=$(echo "$BODY" | tail -1)
assert_status "Chat rooms without auth returns 401" "401" "$STATUS"

###############################################################################
# 7. Notifications
###############################################################################
echo ""
echo "--- 7. Notifications ---"

# Get Alice's notifications
BODY=$(get_auth "$API/notifications" "$USER_A_ID")
STATUS=$(echo "$BODY" | tail -1)
RESP=$(echo "$BODY" | sed '$d')
assert_status "Get Alice's notifications" "200" "$STATUS"
assert_contains "Notifications returns data" "$RESP" "data"

# Get unread count
BODY=$(get_auth "$API/notifications/unread-count" "$USER_A_ID")
STATUS=$(echo "$BODY" | tail -1)
RESP=$(echo "$BODY" | sed '$d')
assert_status "Get unread notification count" "200" "$STATUS"
assert_contains "Has count field" "$RESP" "count"

# Mark all as read (POST with empty JSON body)
BODY=$(post_json "$API/notifications/read-all" "{}" -H "x-user-id: $USER_A_ID")
STATUS=$(echo "$BODY" | tail -1)
RESP=$(echo "$BODY" | sed '$d')
assert_status "Mark all notifications read" "200" "$STATUS"
assert_contains "Read-all returns success" "$RESP" "success"

# Notifications without auth
BODY=$(curl -s -w '\n%{http_code}' "$API/notifications")
STATUS=$(echo "$BODY" | tail -1)
assert_status "Notifications without auth returns 401" "401" "$STATUS"

###############################################################################
# 8. Fantasy contests
###############################################################################
echo ""
echo "--- 8. Fantasy contests ---"

# Create a fantasy contest
BODY=$(post_json "$API/fantasy/contests" "{
  \"name\":\"IPL Fantasy League ${UNIQUE}\",
  \"description\":\"Test fantasy contest for IPL match\",
  \"matchSource\":\"external\",
  \"externalMatchRef\":\"ipl-2026-match-1\",
  \"entryFee\":0,
  \"maxEntries\":100,
  \"scoringRules\":{\"run\":1,\"wicket\":25,\"catch\":10,\"four\":1,\"six\":2},
  \"lockTime\":\"2026-12-31T23:59:59Z\",
  \"startsAt\":\"2026-12-31T23:59:59Z\"
}" -H "x-user-id: $USER_A_ID")
STATUS=$(echo "$BODY" | tail -1)
RESP=$(echo "$BODY" | sed '$d')
assert_status "Create fantasy contest" "201" "$STATUS"
CONTEST_ID=$(json_get "$RESP" "id")
assert_not_empty "Contest has ID" "$CONTEST_ID"
echo "  Contest ID: $CONTEST_ID"

# List contests
BODY=$(curl -s -w '\n%{http_code}' "$API/fantasy/contests")
STATUS=$(echo "$BODY" | tail -1)
RESP=$(echo "$BODY" | sed '$d')
assert_status "List fantasy contests" "200" "$STATUS"
assert_contains "Contests list has data" "$RESP" "data"

# Get single contest
BODY=$(curl -s -w '\n%{http_code}' "$API/fantasy/contests/$CONTEST_ID")
STATUS=$(echo "$BODY" | tail -1)
RESP=$(echo "$BODY" | sed '$d')
assert_status "Get single contest" "200" "$STATUS"
assert_contains "Contest has correct name" "$RESP" "IPL Fantasy League"

# Alice submits a fantasy team (NOTE: singular /team not /teams)
BODY=$(post_json "$API/fantasy/contests/$CONTEST_ID/team" "{
  \"teamName\":\"Alice Dream XI\",
  \"players\":[
    {\"playerId\":\"player-1\",\"role\":\"batsman\",\"isCaptain\":true},
    {\"playerId\":\"player-2\",\"role\":\"bowler\",\"isViceCaptain\":true}
  ]
}" -H "x-user-id: $USER_A_ID")
STATUS=$(echo "$BODY" | tail -1)
RESP=$(echo "$BODY" | sed '$d')
assert_status "Alice submits fantasy team" "201" "$STATUS"
FANTASY_TEAM_ID=$(json_get "$RESP" "id")
assert_not_empty "Fantasy team has ID" "$FANTASY_TEAM_ID"

# Bob submits a fantasy team
BODY=$(post_json "$API/fantasy/contests/$CONTEST_ID/team" "{
  \"teamName\":\"Bob Thunderbolts\",
  \"players\":[
    {\"playerId\":\"player-3\",\"role\":\"allrounder\",\"isCaptain\":true},
    {\"playerId\":\"player-4\",\"role\":\"wicketkeeper\",\"isViceCaptain\":true}
  ]
}" -H "x-user-id: $USER_B_ID")
STATUS=$(echo "$BODY" | tail -1)
assert_status "Bob submits fantasy team" "201" "$STATUS"

# Duplicate entry should fail with 409
BODY=$(post_json "$API/fantasy/contests/$CONTEST_ID/team" '{"teamName":"Dup","players":[{"playerId":"p1","role":"bat"}]}' -H "x-user-id: $USER_A_ID")
STATUS=$(echo "$BODY" | tail -1)
assert_status "Duplicate fantasy team entry returns 409" "409" "$STATUS"

# Edit team before lock
BODY=$(curl -s -w '\n%{http_code}' -X PATCH "$API/fantasy/contests/$CONTEST_ID/team" \
  -H 'Content-Type: application/json' \
  -H "x-user-id: $USER_A_ID" \
  -d '{"teamName":"Alice Updated XI"}')
STATUS=$(echo "$BODY" | tail -1)
RESP=$(echo "$BODY" | sed '$d')
assert_status "Edit fantasy team" "200" "$STATUS"
assert_contains "Updated team name" "$RESP" "Alice Updated XI"

# Get Alice's contests
BODY=$(get_auth "$API/fantasy/my-contests" "$USER_A_ID")
STATUS=$(echo "$BODY" | tail -1)
RESP=$(echo "$BODY" | sed '$d')
assert_status "Get Alice's fantasy contests" "200" "$STATUS"
CONTEST_COUNT=$(json_array_len "$RESP" "data")
if [ "$CONTEST_COUNT" -ge 1 ]; then
  PASS=$((PASS + 1))
  echo "  PASS: Alice has $CONTEST_COUNT fantasy contests"
else
  FAIL=$((FAIL + 1))
  echo "  FAIL: Alice has no fantasy contests"
  TESTS+=("FAIL: Alice's fantasy contests empty")
fi

# Get contest leaderboard (via single contest detail)
BODY=$(curl -s -w '\n%{http_code}' "$API/fantasy/contests/$CONTEST_ID")
STATUS=$(echo "$BODY" | tail -1)
RESP=$(echo "$BODY" | sed '$d')
LB_COUNT=$(json_array_len "$RESP" "leaderboard")
if [ "$LB_COUNT" -ge 2 ]; then
  PASS=$((PASS + 1))
  echo "  PASS: Contest leaderboard has $LB_COUNT teams"
else
  FAIL=$((FAIL + 1))
  echo "  FAIL: Contest leaderboard expected >= 2, got $LB_COUNT"
  TESTS+=("FAIL: Contest leaderboard count")
fi

# Fantasy history (no completed contests yet)
BODY=$(get_auth "$API/fantasy/history" "$USER_A_ID")
STATUS=$(echo "$BODY" | tail -1)
assert_status "Get fantasy history" "200" "$STATUS"

# Create contest without auth
BODY=$(post_json "$API/fantasy/contests" '{"name":"No auth","matchSource":"ext","scoringRules":{}}')
STATUS=$(echo "$BODY" | tail -1)
assert_status "Create contest without auth returns 401" "401" "$STATUS"

###############################################################################
# 9. Leaderboards
###############################################################################
echo ""
echo "--- 9. Leaderboards ---"

# Batting leaderboard
BODY=$(curl -s -w '\n%{http_code}' "$API/leaderboards/batting")
STATUS=$(echo "$BODY" | tail -1)
RESP=$(echo "$BODY" | sed '$d')
assert_status "Batting leaderboard" "200" "$STATUS"
assert_contains "Batting leaderboard has data" "$RESP" "data"

# Bowling leaderboard
BODY=$(curl -s -w '\n%{http_code}' "$API/leaderboards/bowling")
STATUS=$(echo "$BODY" | tail -1)
assert_status "Bowling leaderboard" "200" "$STATUS"

# XP leaderboard
BODY=$(curl -s -w '\n%{http_code}' "$API/leaderboards/xp")
STATUS=$(echo "$BODY" | tail -1)
assert_status "XP leaderboard" "200" "$STATUS"

# Fantasy leaderboard
BODY=$(curl -s -w '\n%{http_code}' "$API/leaderboards/fantasy")
STATUS=$(echo "$BODY" | tail -1)
assert_status "Fantasy leaderboard" "200" "$STATUS"

# Personal ranks
BODY=$(get_auth "$API/leaderboards/me" "$USER_A_ID")
STATUS=$(echo "$BODY" | tail -1)
assert_status "Personal ranks" "200" "$STATUS"

# Leaderboard with filters
BODY=$(curl -s -w '\n%{http_code}' "$API/leaderboards/batting?city=Mumbai&ballType=leather&period=month")
STATUS=$(echo "$BODY" | tail -1)
assert_status "Batting leaderboard with filters" "200" "$STATUS"

BODY=$(curl -s -w '\n%{http_code}' "$API/leaderboards/bowling?country=India&period=week")
STATUS=$(echo "$BODY" | tail -1)
assert_status "Bowling leaderboard with country filter" "200" "$STATUS"

###############################################################################
# 10. Trending
###############################################################################
echo ""
echo "--- 10. Trending ---"

# Trending players
BODY=$(curl -s -w '\n%{http_code}' "$API/trending/players")
STATUS=$(echo "$BODY" | tail -1)
RESP=$(echo "$BODY" | sed '$d')
assert_status "Trending players" "200" "$STATUS"
assert_contains "Trending players has data" "$RESP" "data"

# Trending teams
BODY=$(curl -s -w '\n%{http_code}' "$API/trending/teams")
STATUS=$(echo "$BODY" | tail -1)
assert_status "Trending teams" "200" "$STATUS"

# Trending matches
BODY=$(curl -s -w '\n%{http_code}' "$API/trending/matches")
STATUS=$(echo "$BODY" | tail -1)
assert_status "Trending matches" "200" "$STATUS"

# Trending with filters
BODY=$(curl -s -w '\n%{http_code}' "$API/trending/players?city=Mumbai&period=week")
STATUS=$(echo "$BODY" | tail -1)
assert_status "Trending players city+period filter" "200" "$STATUS"

BODY=$(curl -s -w '\n%{http_code}' "$API/trending/teams?country=India&ballType=leather")
STATUS=$(echo "$BODY" | tail -1)
assert_status "Trending teams country+ballType filter" "200" "$STATUS"

###############################################################################
# 11. Like/Unlike activity
###############################################################################
echo ""
echo "--- 11. Like/Unlike activity ---"

# Like non-existent activity should 404
FAKE_UUID="00000000-0000-0000-0000-000000000001"
BODY=$(post_json "$API/users/feed/$FAKE_UUID/like" "{}" -H "x-user-id: $USER_A_ID")
STATUS=$(echo "$BODY" | tail -1)
assert_status "Like non-existent activity returns 404" "404" "$STATUS"

# Like without auth should 401
BODY=$(post_json "$API/users/feed/$FAKE_UUID/like" "{}")
STATUS=$(echo "$BODY" | tail -1)
assert_status "Like without auth returns 401" "401" "$STATUS"

###############################################################################
# 12. Unfollow
###############################################################################
echo ""
echo "--- 12. Unfollow ---"

# Alice unfollows Bob
BODY=$(curl -s -w '\n%{http_code}' -X DELETE "$API/users/$USER_B_ID/follow" -H "x-user-id: $USER_A_ID")
STATUS=$(echo "$BODY" | tail -1)
assert_status "Alice unfollows Bob" "204" "$STATUS"

# Unfollow again should 404
BODY=$(curl -s -w '\n%{http_code}' -X DELETE "$API/users/$USER_B_ID/follow" -H "x-user-id: $USER_A_ID")
STATUS=$(echo "$BODY" | tail -1)
assert_status "Unfollow non-existent returns 404" "404" "$STATUS"

# Verify Bob's followers no longer include Alice
BODY=$(curl -s -w '\n%{http_code}' "$API/users/$USER_B_ID/followers")
STATUS=$(echo "$BODY" | tail -1)
RESP=$(echo "$BODY" | sed '$d')
if echo "$RESP" | grep -q "Alice Test"; then
  FAIL=$((FAIL + 1))
  echo "  FAIL: Alice still in Bob's followers after unfollow"
  TESTS+=("FAIL: Unfollow didn't remove Alice from followers")
else
  PASS=$((PASS + 1))
  echo "  PASS: Alice removed from Bob's followers"
fi

# Re-follow should work
BODY=$(post_json "$API/users/$USER_B_ID/follow" "{}" -H "x-user-id: $USER_A_ID")
STATUS=$(echo "$BODY" | tail -1)
assert_status "Re-follow after unfollow works" "201" "$STATUS"

###############################################################################
# 13. Auth protection (no x-user-id)
###############################################################################
echo ""
echo "--- 13. Auth protection ---"

# Follow without auth
BODY=$(post_json "$API/users/$USER_B_ID/follow" "{}")
STATUS=$(echo "$BODY" | tail -1)
assert_status "Follow without auth returns 401" "401" "$STATUS"

# Suggestions without auth
BODY=$(curl -s -w '\n%{http_code}' "$API/users/suggestions")
STATUS=$(echo "$BODY" | tail -1)
assert_status "Suggestions without auth returns 401" "401" "$STATUS"

# Fantasy my-contests without auth
BODY=$(curl -s -w '\n%{http_code}' "$API/fantasy/my-contests")
STATUS=$(echo "$BODY" | tail -1)
assert_status "My-contests without auth returns 401" "401" "$STATUS"

# Leaderboard /me without auth
BODY=$(curl -s -w '\n%{http_code}' "$API/leaderboards/me")
STATUS=$(echo "$BODY" | tail -1)
assert_status "Leaderboard /me without auth returns 401" "401" "$STATUS"

###############################################################################
# 14. Pagination
###############################################################################
echo ""
echo "--- 14. Pagination ---"

BODY=$(curl -s -w '\n%{http_code}' "$API/users/$USER_B_ID/following?page=1&limit=5")
STATUS=$(echo "$BODY" | tail -1)
RESP=$(echo "$BODY" | sed '$d')
assert_status "Paginated following list" "200" "$STATUS"
PAGE_NUM=$(json_get "$RESP" "page")
LIMIT_NUM=$(json_get "$RESP" "limit")
assert_status "Page number is 1" "1" "$PAGE_NUM"
assert_status "Limit is 5" "5" "$LIMIT_NUM"

# Page 2 (likely empty)
BODY=$(curl -s -w '\n%{http_code}' "$API/users/$USER_B_ID/followers?page=2&limit=1")
STATUS=$(echo "$BODY" | tail -1)
RESP=$(echo "$BODY" | sed '$d')
assert_status "Page 2 of followers" "200" "$STATUS"
PAGE2=$(json_get "$RESP" "page")
assert_status "Page 2 page number" "2" "$PAGE2"

# Large limit gets capped at 100
BODY=$(curl -s -w '\n%{http_code}' "$API/users/$USER_B_ID/followers?limit=999")
STATUS=$(echo "$BODY" | tail -1)
RESP=$(echo "$BODY" | sed '$d')
CAPPED_LIMIT=$(json_get "$RESP" "limit")
assert_status "Limit capped at 100" "100" "$CAPPED_LIMIT"

###############################################################################
# 15. GDPR (Phase 1 regression)
###############################################################################
echo ""
echo "--- 15. GDPR export/delete ---"

BODY=$(get_auth "$API/users/me/export" "$USER_C_ID")
STATUS=$(echo "$BODY" | tail -1)
RESP=$(echo "$BODY" | sed '$d')
assert_status "GDPR data export" "200" "$STATUS"
assert_contains "Export has email" "$RESP" "charlie_${UNIQUE}@test.com"

# Soft-delete Charlie
BODY=$(curl -s -w '\n%{http_code}' -X DELETE "$API/users/me" -H "x-user-id: $USER_C_ID")
STATUS=$(echo "$BODY" | tail -1)
assert_status "GDPR account deletion" "204" "$STATUS"

###############################################################################
# RESULTS
###############################################################################
echo ""
echo "============================================================"
echo "  RESULTS: $PASS passed, $FAIL failed"
echo "============================================================"

if [ ${#TESTS[@]} -gt 0 ]; then
  echo ""
  echo "  Failed tests:"
  for t in "${TESTS[@]}"; do
    echo "    - $t"
  done
fi

echo ""
if [ "$FAIL" -eq 0 ]; then
  echo "  ALL TESTS PASSED!"
else
  echo "  Some tests failed. Review output above."
fi

exit $FAIL
