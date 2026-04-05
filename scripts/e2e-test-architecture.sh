#!/usr/bin/env bash
set -euo pipefail

###############################################################################
# Cricket Scoring App — Architecture E2E Test Suite
#
# Tests all architectural improvements: health, auth, scoring flow,
# pagination, data integrity, and security against http://localhost:3001.
###############################################################################

BASE="http://localhost:3001"
API="$BASE/api/v1"
PASS=0
FAIL=0
TOTAL=0
TESTS=()
UNIQUE=$(date +%s)

# ---------- Colors -----------------------------------------------------------
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[0;33m'
NC='\033[0m' # No Color

# ---------- Helpers ----------------------------------------------------------

assert_status() {
  local desc="$1" expected="$2" actual="$3"
  TOTAL=$((TOTAL + 1))
  if [ "$expected" = "$actual" ]; then
    PASS=$((PASS + 1))
    echo -e "  ${GREEN}PASS${NC}: $desc"
  else
    FAIL=$((FAIL + 1))
    echo -e "  ${RED}FAIL${NC}: $desc (expected $expected, got $actual)"
    TESTS+=("FAIL: $desc (expected $expected, got $actual)")
  fi
}

assert_contains() {
  local desc="$1" body="$2" expected="$3"
  TOTAL=$((TOTAL + 1))
  if echo "$body" | grep -q "$expected"; then
    PASS=$((PASS + 1))
    echo -e "  ${GREEN}PASS${NC}: $desc"
  else
    FAIL=$((FAIL + 1))
    echo -e "  ${RED}FAIL${NC}: $desc (missing '$expected')"
    TESTS+=("FAIL: $desc")
  fi
}

assert_not_contains() {
  local desc="$1" body="$2" unexpected="$3"
  TOTAL=$((TOTAL + 1))
  if echo "$body" | grep -q "$unexpected"; then
    FAIL=$((FAIL + 1))
    echo -e "  ${RED}FAIL${NC}: $desc (found '$unexpected' unexpectedly)"
    TESTS+=("FAIL: $desc")
  else
    PASS=$((PASS + 1))
    echo -e "  ${GREEN}PASS${NC}: $desc"
  fi
}

assert_not_empty() {
  local desc="$1" value="$2"
  TOTAL=$((TOTAL + 1))
  if [ -n "$value" ] && [ "$value" != "null" ] && [ "$value" != "undefined" ] && [ "$value" != "" ]; then
    PASS=$((PASS + 1))
    echo -e "  ${GREEN}PASS${NC}: $desc"
  else
    FAIL=$((FAIL + 1))
    echo -e "  ${RED}FAIL${NC}: $desc (empty/null)"
    TESTS+=("FAIL: $desc")
  fi
}

# JSON parser using node (always available in this project)
json_get() {
  echo "$1" | node -e "
    let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{
      try{const o=JSON.parse(d);const k='$2'.split('.');let v=o;for(const i of k)v=v?.[i];
      console.log(v===undefined||v===null?'':String(v));}catch(e){console.log('');}
    });"
}

json_array_len() {
  echo "$1" | node -e "
    let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{
      try{const o=JSON.parse(d);const k='$2'.split('.');let v=o;for(const i of k){if(i)v=v?.[i];}
      console.log(Array.isArray(v)?v.length:0);}catch(e){console.log(0);}
    });"
}

# POST with JSON body — returns body + status on last line
post_json() {
  local url="$1" data="$2"; shift 2
  curl -s -w '\n%{http_code}' -X POST "$url" -H 'Content-Type: application/json' -d "$data" "$@"
}

# GET with optional extra headers — returns body + status on last line
get_json() {
  local url="$1"; shift
  curl -s -w '\n%{http_code}' "$url" "$@"
}

# PATCH with JSON body
patch_json() {
  local url="$1" data="$2"; shift 2
  curl -s -w '\n%{http_code}' -X PATCH "$url" -H 'Content-Type: application/json' -d "$data" "$@"
}

# DELETE with optional body
delete_json() {
  local url="$1"; shift
  curl -s -w '\n%{http_code}' -X DELETE "$url" -H 'Content-Type: application/json' "$@"
}

# Extract status and body from curl output
get_status() { echo "$1" | tail -1; }
get_body()   { echo "$1" | sed '$d'; }

# Get response headers (returns full header dump)
get_headers() {
  curl -s -o /dev/null -D - "$1" "${@:2}"
}

echo "============================================================"
echo "  Architecture E2E Tests — Cricket Scoring Platform"
echo "============================================================"
echo ""

# ---------- Pre-flight: check if API is running ------------------------------
echo "--- Pre-flight: checking API availability ---"
HEALTH_CHECK=$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 "$BASE/health" 2>/dev/null || echo "000")
if [ "$HEALTH_CHECK" = "000" ]; then
  echo -e "  ${RED}ERROR: API is not running at $BASE${NC}"
  echo "  Start the API first: cd apps/api && npm run dev"
  exit 1
fi
echo -e "  ${GREEN}API is running${NC}"
echo ""

###############################################################################
# Section 1: Health & Infrastructure (5 tests)
###############################################################################
echo "=== Section 1: Health & Infrastructure ==="

# 1.1 Health check returns 200 with database status
BODY=$(get_json "$BASE/health")
STATUS=$(get_status "$BODY")
RESP=$(get_body "$BODY")
assert_status "1.1 Health check returns 200" "200" "$STATUS"

# 1.2 Health check includes database field
assert_contains "1.2 Health check has database status" "$RESP" "database"

# 1.3 Health check includes uptime
assert_contains "1.3 Health check includes uptime" "$RESP" "uptime"

# 1.4 Swagger docs available at /docs
BODY=$(get_json "$BASE/docs/json")
STATUS=$(get_status "$BODY")
assert_status "1.4 Swagger docs available at /docs" "200" "$STATUS"

# 1.5 Request correlation ID returned in x-request-id header
HEADERS=$(get_headers "$BASE/health")
if echo "$HEADERS" | grep -qi "x-request-id"; then
  TOTAL=$((TOTAL + 1)); PASS=$((PASS + 1))
  echo -e "  ${GREEN}PASS${NC}: 1.5 x-request-id header present"
else
  TOTAL=$((TOTAL + 1)); FAIL=$((FAIL + 1))
  echo -e "  ${RED}FAIL${NC}: 1.5 x-request-id header missing"
  TESTS+=("FAIL: 1.5 x-request-id header")
fi

echo ""

###############################################################################
# Section 2: Auth & Validation (10 tests)
###############################################################################
echo "=== Section 2: Auth & Validation ==="

# 2.1 Register with valid data returns 201
BODY=$(post_json "$API/auth/register" "{\"email\":\"arch_${UNIQUE}@test.com\",\"password\":\"TestPass123!\",\"displayName\":\"Arch Tester\"}")
STATUS=$(get_status "$BODY")
RESP=$(get_body "$BODY")
assert_status "2.1 Register valid user returns 201" "201" "$STATUS"
USER_ID=$(json_get "$RESP" "user.id")

# 2.2 Register with invalid email returns 400 VALIDATION_ERROR
BODY=$(post_json "$API/auth/register" "{\"email\":\"not-an-email\",\"password\":\"TestPass123!\",\"displayName\":\"Bad Email\"}")
STATUS=$(get_status "$BODY")
RESP=$(get_body "$BODY")
assert_status "2.2 Invalid email returns 400" "400" "$STATUS"
assert_contains "2.2b Error has VALIDATION_ERROR code" "$RESP" "VALIDATION_ERROR"

# 2.3 Register with short password returns 400
BODY=$(post_json "$API/auth/register" "{\"email\":\"short_${UNIQUE}@test.com\",\"password\":\"abc\",\"displayName\":\"Short Pass\"}")
STATUS=$(get_status "$BODY")
assert_status "2.3 Short password returns 400" "400" "$STATUS"

# 2.4 Register duplicate email returns 409
BODY=$(post_json "$API/auth/register" "{\"email\":\"arch_${UNIQUE}@test.com\",\"password\":\"TestPass123!\",\"displayName\":\"Duplicate\"}")
STATUS=$(get_status "$BODY")
assert_status "2.4 Duplicate email returns 409" "409" "$STATUS"

# 2.5 Login with valid credentials returns tokens
BODY=$(post_json "$API/auth/login" "{\"email\":\"arch_${UNIQUE}@test.com\",\"password\":\"TestPass123!\"}")
STATUS=$(get_status "$BODY")
RESP=$(get_body "$BODY")
assert_status "2.5 Login returns 200" "200" "$STATUS"
ACCESS_TOKEN=$(json_get "$RESP" "access_token")
REFRESH_TOKEN=$(json_get "$RESP" "refresh_token")
assert_not_empty "2.5b Has access_token" "$ACCESS_TOKEN"

# 2.6 Login with wrong password returns 401
BODY=$(post_json "$API/auth/login" "{\"email\":\"arch_${UNIQUE}@test.com\",\"password\":\"WrongPass!\"}")
STATUS=$(get_status "$BODY")
assert_status "2.6 Wrong password returns 401" "401" "$STATUS"

# 2.7 Login with missing fields returns 400
BODY=$(post_json "$API/auth/login" "{}")
STATUS=$(get_status "$BODY")
assert_status "2.7 Missing login fields returns 400" "400" "$STATUS"

# 2.8 Refresh token works
BODY=$(post_json "$API/auth/refresh" "{\"refresh_token\":\"$REFRESH_TOKEN\"}")
STATUS=$(get_status "$BODY")
RESP=$(get_body "$BODY")
assert_status "2.8 Refresh token returns 200" "200" "$STATUS"
NEW_ACCESS_TOKEN=$(json_get "$RESP" "access_token")
NEW_REFRESH_TOKEN=$(json_get "$RESP" "refresh_token")
# Update tokens for subsequent requests
if [ -n "$NEW_ACCESS_TOKEN" ] && [ "$NEW_ACCESS_TOKEN" != "" ]; then
  ACCESS_TOKEN="$NEW_ACCESS_TOKEN"
fi
if [ -n "$NEW_REFRESH_TOKEN" ] && [ "$NEW_REFRESH_TOKEN" != "" ]; then
  REFRESH_TOKEN="$NEW_REFRESH_TOKEN"
fi

# 2.9 Session listing works
BODY=$(get_json "$API/auth/sessions" -H "Authorization: Bearer $ACCESS_TOKEN")
STATUS=$(get_status "$BODY")
RESP=$(get_body "$BODY")
assert_status "2.9 Session listing returns 200" "200" "$STATUS"

# 2.10 Logout invalidates refresh token
BODY=$(post_json "$API/auth/logout" "{\"refresh_token\":\"$REFRESH_TOKEN\"}")
STATUS=$(get_status "$BODY")
assert_status "2.10 Logout returns 204" "204" "$STATUS"

# Re-login since we logged out
BODY=$(post_json "$API/auth/login" "{\"email\":\"arch_${UNIQUE}@test.com\",\"password\":\"TestPass123!\"}")
RESP=$(get_body "$BODY")
ACCESS_TOKEN=$(json_get "$RESP" "access_token")
REFRESH_TOKEN=$(json_get "$RESP" "refresh_token")

echo ""

###############################################################################
# Section 3: Scoring Flow — Full Match Simulation (15 tests)
###############################################################################
echo "=== Section 3: Scoring Flow — Full Match Simulation ==="

# 3.1 Create Team A
BODY=$(post_json "$API/teams" "{\"name\":\"Arch Tigers ${UNIQUE}\",\"shortName\":\"AT\",\"teamType\":\"club\"}" -H "Authorization: Bearer $ACCESS_TOKEN")
STATUS=$(get_status "$BODY")
RESP=$(get_body "$BODY")
assert_status "3.1 Create Team A" "201" "$STATUS"
TEAM_A_ID=$(json_get "$RESP" "id")
echo "    Team A ID: $TEAM_A_ID"

# 3.2 Create Team B
BODY=$(post_json "$API/teams" "{\"name\":\"Arch Lions ${UNIQUE}\",\"shortName\":\"AL\",\"teamType\":\"club\"}" -H "Authorization: Bearer $ACCESS_TOKEN")
STATUS=$(get_status "$BODY")
RESP=$(get_body "$BODY")
assert_status "3.2 Create Team B" "201" "$STATUS"
TEAM_B_ID=$(json_get "$RESP" "id")
echo "    Team B ID: $TEAM_B_ID"

# 3.3 Create 11 players for Team A
TEAM_A_PLAYERS=()
for i in $(seq 1 11); do
  BODY=$(post_json "$API/players" "{\"firstName\":\"Tiger\",\"lastName\":\"Player${i}\"}")
  RESP=$(get_body "$BODY")
  PID=$(json_get "$RESP" "id")
  TEAM_A_PLAYERS+=("$PID")
done
assert_not_empty "3.3 Created 11 players for Team A" "${TEAM_A_PLAYERS[0]}"
echo "    Team A players created: ${#TEAM_A_PLAYERS[@]}"

# 3.4 Create 11 players for Team B
TEAM_B_PLAYERS=()
for i in $(seq 1 11); do
  BODY=$(post_json "$API/players" "{\"firstName\":\"Lion\",\"lastName\":\"Player${i}\"}")
  RESP=$(get_body "$BODY")
  PID=$(json_get "$RESP" "id")
  TEAM_B_PLAYERS+=("$PID")
done
assert_not_empty "3.4 Created 11 players for Team B" "${TEAM_B_PLAYERS[0]}"
echo "    Team B players created: ${#TEAM_B_PLAYERS[@]}"

# Build JSON arrays for playing XI
XI_A=$(printf '"%s",' "${TEAM_A_PLAYERS[@]}" | sed 's/,$//')
XI_B=$(printf '"%s",' "${TEAM_B_PLAYERS[@]}" | sed 's/,$//')

# 3.5 Create a match
BODY=$(post_json "$API/matches" "{
  \"formatConfigId\":\"t20\",
  \"homeTeamId\":\"$TEAM_A_ID\",
  \"awayTeamId\":\"$TEAM_B_ID\",
  \"homePlayingXi\":[$XI_A],
  \"awayPlayingXi\":[$XI_B],
  \"venue\":\"Test Stadium\",
  \"city\":\"Test City\"
}" -H "Authorization: Bearer $ACCESS_TOKEN")
STATUS=$(get_status "$BODY")
RESP=$(get_body "$BODY")
assert_status "3.5 Create match returns 201" "201" "$STATUS"
MATCH_ID=$(json_get "$RESP" "id")
echo "    Match ID: $MATCH_ID"

# 3.6 Verify same team as home+away returns 400
BODY=$(post_json "$API/matches" "{
  \"formatConfigId\":\"t20\",
  \"homeTeamId\":\"$TEAM_A_ID\",
  \"awayTeamId\":\"$TEAM_A_ID\",
  \"homePlayingXi\":[$XI_A],
  \"awayPlayingXi\":[$XI_A]
}" -H "Authorization: Bearer $ACCESS_TOKEN")
STATUS=$(get_status "$BODY")
assert_status "3.6 Same team home+away returns 400" "400" "$STATUS"

# 3.7 Record toss
BODY=$(post_json "$API/matches/$MATCH_ID/toss" "{\"winner_id\":\"$TEAM_A_ID\",\"decision\":\"bat\"}" -H "Authorization: Bearer $ACCESS_TOKEN")
STATUS=$(get_status "$BODY")
RESP=$(get_body "$BODY")
assert_status "3.7 Record toss" "200" "$STATUS"

# 3.8 Start match (creates first innings)
BODY=$(post_json "$API/matches/$MATCH_ID/start" "{
  \"battingTeamId\":\"$TEAM_A_ID\",
  \"bowlingTeamId\":\"$TEAM_B_ID\",
  \"battingOrder\":[$XI_A]
}" -H "Authorization: Bearer $ACCESS_TOKEN")
STATUS=$(get_status "$BODY")
RESP=$(get_body "$BODY")
assert_status "3.8 Start match creates innings" "201" "$STATUS"
INNINGS_ID=$(json_get "$RESP" "id")
echo "    Innings ID: $INNINGS_ID"

# Striker = first player, non-striker = second player, bowler = first opponent
STRIKER_ID="${TEAM_A_PLAYERS[0]}"
NON_STRIKER_ID="${TEAM_A_PLAYERS[1]}"
BOWLER_ID="${TEAM_B_PLAYERS[0]}"

# 3.9 Record first delivery (dot ball)
BODY=$(post_json "$API/matches/$MATCH_ID/deliveries" "{
  \"innings_num\":1,
  \"bowler_id\":\"$BOWLER_ID\",
  \"striker_id\":\"$STRIKER_ID\",
  \"non_striker_id\":\"$NON_STRIKER_ID\",
  \"runs_batsman\":0,
  \"runs_extras\":0,
  \"extra_type\":null,
  \"wicket_type\":null,
  \"dismissed_player_id\":null,
  \"fielder_id\":null
}" -H "Authorization: Bearer $ACCESS_TOKEN")
STATUS=$(get_status "$BODY")
RESP=$(get_body "$BODY")
assert_status "3.9 Record dot ball returns 201" "201" "$STATUS"
assert_contains "3.9b Dot ball has delivery object" "$RESP" "delivery"

# 3.10 Record second delivery (4 runs boundary)
BODY=$(post_json "$API/matches/$MATCH_ID/deliveries" "{
  \"innings_num\":1,
  \"bowler_id\":\"$BOWLER_ID\",
  \"striker_id\":\"$STRIKER_ID\",
  \"non_striker_id\":\"$NON_STRIKER_ID\",
  \"runs_batsman\":4,
  \"runs_extras\":0,
  \"extra_type\":null,
  \"wicket_type\":null,
  \"dismissed_player_id\":null,
  \"fielder_id\":null
}" -H "Authorization: Bearer $ACCESS_TOKEN")
STATUS=$(get_status "$BODY")
RESP=$(get_body "$BODY")
assert_status "3.10 Record 4 runs returns 201" "201" "$STATUS"
SCORE_AFTER_4=$(json_get "$RESP" "scorecardSnapshot.innings_score")
echo "    Score after boundary: $SCORE_AFTER_4"

# 3.11 Record a wide
BODY=$(post_json "$API/matches/$MATCH_ID/deliveries" "{
  \"innings_num\":1,
  \"bowler_id\":\"$BOWLER_ID\",
  \"striker_id\":\"$STRIKER_ID\",
  \"non_striker_id\":\"$NON_STRIKER_ID\",
  \"runs_batsman\":0,
  \"runs_extras\":1,
  \"extra_type\":\"wide\",
  \"wicket_type\":null,
  \"dismissed_player_id\":null,
  \"fielder_id\":null
}" -H "Authorization: Bearer $ACCESS_TOKEN")
STATUS=$(get_status "$BODY")
RESP=$(get_body "$BODY")
assert_status "3.11 Record wide returns 201" "201" "$STATUS"
assert_contains "3.11b Wide has scorecardSnapshot" "$RESP" "scorecardSnapshot"

# 3.12 Record a no-ball
BODY=$(post_json "$API/matches/$MATCH_ID/deliveries" "{
  \"innings_num\":1,
  \"bowler_id\":\"$BOWLER_ID\",
  \"striker_id\":\"$STRIKER_ID\",
  \"non_striker_id\":\"$NON_STRIKER_ID\",
  \"runs_batsman\":0,
  \"runs_extras\":1,
  \"extra_type\":\"no_ball\",
  \"wicket_type\":null,
  \"dismissed_player_id\":null,
  \"fielder_id\":null
}" -H "Authorization: Bearer $ACCESS_TOKEN")
STATUS=$(get_status "$BODY")
RESP=$(get_body "$BODY")
assert_status "3.12 Record no-ball returns 201" "201" "$STATUS"

# 3.13 Record a wicket (bowled)
BODY=$(post_json "$API/matches/$MATCH_ID/deliveries" "{
  \"innings_num\":1,
  \"bowler_id\":\"$BOWLER_ID\",
  \"striker_id\":\"$STRIKER_ID\",
  \"non_striker_id\":\"$NON_STRIKER_ID\",
  \"runs_batsman\":0,
  \"runs_extras\":0,
  \"extra_type\":null,
  \"wicket_type\":\"bowled\",
  \"dismissed_player_id\":\"$STRIKER_ID\",
  \"fielder_id\":null
}" -H "Authorization: Bearer $ACCESS_TOKEN")
STATUS=$(get_status "$BODY")
RESP=$(get_body "$BODY")
assert_status "3.13 Record wicket (bowled) returns 201" "201" "$STATUS"
WICKETS_AFTER=$(json_get "$RESP" "scorecardSnapshot.innings_wickets")
echo "    Wickets after bowled: $WICKETS_AFTER"

# 3.14 Undo last delivery
BODY=$(delete_json "$API/matches/$MATCH_ID/deliveries/last" -d "{\"inningsId\":\"$INNINGS_ID\"}" -H "Authorization: Bearer $ACCESS_TOKEN")
STATUS=$(get_status "$BODY")
RESP=$(get_body "$BODY")
assert_status "3.14 Undo last delivery returns 200" "200" "$STATUS"
assert_contains "3.14b Undo returns success" "$RESP" "success"

# 3.15 Test idempotency: send delivery with client_id
CLIENT_UUID=$(node -e "console.log(require('crypto').randomUUID())")
DELIVERY_DATA="{
  \"innings_num\":1,
  \"bowler_id\":\"$BOWLER_ID\",
  \"striker_id\":\"$NON_STRIKER_ID\",
  \"non_striker_id\":\"$STRIKER_ID\",
  \"runs_batsman\":1,
  \"runs_extras\":0,
  \"extra_type\":null,
  \"wicket_type\":null,
  \"dismissed_player_id\":null,
  \"fielder_id\":null,
  \"client_id\":\"$CLIENT_UUID\"
}"

# First send
BODY=$(post_json "$API/matches/$MATCH_ID/deliveries" "$DELIVERY_DATA" -H "Authorization: Bearer $ACCESS_TOKEN")
STATUS1=$(get_status "$BODY")

# Second send (same client_id) — should return 200 (idempotent hit)
BODY=$(post_json "$API/matches/$MATCH_ID/deliveries" "$DELIVERY_DATA" -H "Authorization: Bearer $ACCESS_TOKEN")
STATUS2=$(get_status "$BODY")
RESP2=$(get_body "$BODY")
assert_status "3.15 Idempotent delivery returns 200 on duplicate" "200" "$STATUS2"
assert_contains "3.15b Idempotent response flagged" "$RESP2" "idempotent"

# 3.16 Test sync conflict: wrong expected_stack_pos returns 409
BODY=$(post_json "$API/matches/$MATCH_ID/deliveries" "{
  \"innings_num\":1,
  \"bowler_id\":\"$BOWLER_ID\",
  \"striker_id\":\"$NON_STRIKER_ID\",
  \"non_striker_id\":\"$STRIKER_ID\",
  \"runs_batsman\":2,
  \"runs_extras\":0,
  \"extra_type\":null,
  \"wicket_type\":null,
  \"dismissed_player_id\":null,
  \"fielder_id\":null,
  \"expected_stack_pos\":9999
}" -H "Authorization: Bearer $ACCESS_TOKEN")
STATUS=$(get_status "$BODY")
RESP=$(get_body "$BODY")
assert_status "3.16 Sync conflict returns 409" "409" "$STATUS"
assert_contains "3.16b Error has SYNC_CONFLICT" "$RESP" "SYNC_CONFLICT"

# 3.17 Get full scorecard — verify structure
BODY=$(get_json "$API/matches/$MATCH_ID/scorecard")
STATUS=$(get_status "$BODY")
RESP=$(get_body "$BODY")
assert_status "3.17 Full scorecard returns 200" "200" "$STATUS"
assert_contains "3.17b Scorecard has batting data" "$RESP" "batting"

echo ""

###############################################################################
# Section 4: Pagination (5 tests)
###############################################################################
echo "=== Section 4: Pagination ==="

# 4.1 GET /matches with no params returns paginated response
BODY=$(get_json "$API/matches")
STATUS=$(get_status "$BODY")
RESP=$(get_body "$BODY")
assert_status "4.1 GET /matches returns 200" "200" "$STATUS"
assert_contains "4.1b Response has pagination" "$RESP" "pagination"

# 4.2 GET /matches?page=1&limit=5 returns max 5 results
BODY=$(get_json "$API/matches?page=1&limit=5")
STATUS=$(get_status "$BODY")
RESP=$(get_body "$BODY")
RETURNED_LIMIT=$(json_get "$RESP" "pagination.limit")
assert_status "4.2 Limit=5 respected" "5" "$RETURNED_LIMIT"

# 4.3 GET /matches?limit=200 caps at 100
BODY=$(get_json "$API/matches?limit=200")
STATUS=$(get_status "$BODY")
RESP=$(get_body "$BODY")
CAPPED_LIMIT=$(json_get "$RESP" "pagination.limit")
assert_status "4.3 Limit capped at 100" "100" "$CAPPED_LIMIT"

# 4.4 GET /players returns paginated response
BODY=$(get_json "$API/players")
STATUS=$(get_status "$BODY")
RESP=$(get_body "$BODY")
assert_status "4.4 GET /players returns 200" "200" "$STATUS"
assert_contains "4.4b Players has pagination" "$RESP" "pagination"

# 4.5 GET /teams returns paginated response
BODY=$(get_json "$API/teams")
STATUS=$(get_status "$BODY")
RESP=$(get_body "$BODY")
assert_status "4.5 GET /teams returns 200" "200" "$STATUS"
assert_contains "4.5b Teams has pagination" "$RESP" "pagination"

echo ""

###############################################################################
# Section 5: Data Integrity (5 tests)
###############################################################################
echo "=== Section 5: Data Integrity ==="

# 5.1 Create match with same team as home+away returns 400 (already tested in 3.6, do it explicitly here)
BODY=$(post_json "$API/matches" "{
  \"formatConfigId\":\"t20\",
  \"homeTeamId\":\"$TEAM_A_ID\",
  \"awayTeamId\":\"$TEAM_A_ID\",
  \"homePlayingXi\":[],
  \"awayPlayingXi\":[]
}" -H "Authorization: Bearer $ACCESS_TOKEN")
STATUS=$(get_status "$BODY")
assert_status "5.1 Same team home+away returns 400" "400" "$STATUS"

# 5.2 Create match with non-existent team returns 404
FAKE_UUID="00000000-0000-0000-0000-000000000099"
BODY=$(post_json "$API/matches" "{
  \"formatConfigId\":\"t20\",
  \"homeTeamId\":\"$FAKE_UUID\",
  \"awayTeamId\":\"$TEAM_B_ID\",
  \"homePlayingXi\":[],
  \"awayPlayingXi\":[]
}" -H "Authorization: Bearer $ACCESS_TOKEN")
STATUS=$(get_status "$BODY")
assert_status "5.2 Non-existent team returns 404" "404" "$STATUS"

# 5.3 Match status transition: can't go from created directly to completed
# Create a fresh match for this test
BODY=$(post_json "$API/matches" "{
  \"formatConfigId\":\"t20\",
  \"homeTeamId\":\"$TEAM_A_ID\",
  \"awayTeamId\":\"$TEAM_B_ID\",
  \"homePlayingXi\":[],
  \"awayPlayingXi\":[]
}" -H "Authorization: Bearer $ACCESS_TOKEN")
RESP=$(get_body "$BODY")
FRESH_MATCH_ID=$(json_get "$RESP" "id")

# Try to transition directly to completed (should fail)
BODY=$(patch_json "$API/matches/$FRESH_MATCH_ID" "{\"status\":\"completed\"}" -H "Authorization: Bearer $ACCESS_TOKEN")
STATUS=$(get_status "$BODY")
assert_status "5.3 Invalid status transition returns 400" "400" "$STATUS"

# 5.4 Delivery validation rejects negative runs (runs_batsman must be >= 0)
BODY=$(post_json "$API/matches/$MATCH_ID/deliveries" "{
  \"innings_num\":1,
  \"bowler_id\":\"$BOWLER_ID\",
  \"striker_id\":\"$NON_STRIKER_ID\",
  \"non_striker_id\":\"$STRIKER_ID\",
  \"runs_batsman\":-1,
  \"runs_extras\":0,
  \"extra_type\":null,
  \"wicket_type\":null,
  \"dismissed_player_id\":null,
  \"fielder_id\":null
}" -H "Authorization: Bearer $ACCESS_TOKEN")
STATUS=$(get_status "$BODY")
assert_status "5.4 Negative runs returns 400" "400" "$STATUS"

# 5.5 Delivery validation rejects invalid wicket type
BODY=$(post_json "$API/matches/$MATCH_ID/deliveries" "{
  \"innings_num\":1,
  \"bowler_id\":\"$BOWLER_ID\",
  \"striker_id\":\"$NON_STRIKER_ID\",
  \"non_striker_id\":\"$STRIKER_ID\",
  \"runs_batsman\":0,
  \"runs_extras\":0,
  \"extra_type\":null,
  \"wicket_type\":\"invalid_type\",
  \"dismissed_player_id\":\"$NON_STRIKER_ID\",
  \"fielder_id\":null
}" -H "Authorization: Bearer $ACCESS_TOKEN")
STATUS=$(get_status "$BODY")
assert_status "5.5 Invalid wicket type returns 400" "400" "$STATUS"

echo ""

###############################################################################
# Section 6: Security (5 tests)
###############################################################################
echo "=== Section 6: Security ==="

# 6.1 POST to /matches without auth token (requireAuth is a preHandler)
BODY=$(post_json "$API/matches" "{
  \"formatConfigId\":\"t20\",
  \"homeTeamId\":\"$TEAM_A_ID\",
  \"awayTeamId\":\"$TEAM_B_ID\",
  \"homePlayingXi\":[],
  \"awayPlayingXi\":[]
}")
STATUS=$(get_status "$BODY")
assert_status "6.1 Create match without auth returns 401" "401" "$STATUS"

# 6.2 Security headers present (X-Content-Type-Options from helmet)
HEADERS=$(get_headers "$BASE/health")
if echo "$HEADERS" | grep -qi "x-content-type-options"; then
  TOTAL=$((TOTAL + 1)); PASS=$((PASS + 1))
  echo -e "  ${GREEN}PASS${NC}: 6.2 X-Content-Type-Options header present"
else
  TOTAL=$((TOTAL + 1)); FAIL=$((FAIL + 1))
  echo -e "  ${RED}FAIL${NC}: 6.2 X-Content-Type-Options header missing"
  TESTS+=("FAIL: 6.2 security headers")
fi

# 6.3 CORS headers present (Access-Control-Allow-Origin)
CORS_HEADERS=$(curl -s -o /dev/null -D - -X OPTIONS "$BASE/health" -H "Origin: http://localhost:3000" -H "Access-Control-Request-Method: GET")
if echo "$CORS_HEADERS" | grep -qi "access-control"; then
  TOTAL=$((TOTAL + 1)); PASS=$((PASS + 1))
  echo -e "  ${GREEN}PASS${NC}: 6.3 CORS headers present"
else
  TOTAL=$((TOTAL + 1)); FAIL=$((FAIL + 1))
  echo -e "  ${RED}FAIL${NC}: 6.3 CORS headers missing"
  TESTS+=("FAIL: 6.3 CORS headers")
fi

# 6.4 Rate limit headers present (X-RateLimit-Limit from @fastify/rate-limit)
HEADERS=$(get_headers "$API/matches")
if echo "$HEADERS" | grep -qi "x-ratelimit-limit"; then
  TOTAL=$((TOTAL + 1)); PASS=$((PASS + 1))
  echo -e "  ${GREEN}PASS${NC}: 6.4 Rate limit headers present"
else
  TOTAL=$((TOTAL + 1)); FAIL=$((FAIL + 1))
  echo -e "  ${RED}FAIL${NC}: 6.4 Rate limit headers missing"
  TESTS+=("FAIL: 6.4 rate limit headers")
fi

# 6.5 Protected endpoint (create team) rejects without token
BODY=$(post_json "$API/teams" "{\"name\":\"NoAuth Team\",\"teamType\":\"club\"}")
STATUS=$(get_status "$BODY")
assert_status "6.5 Create team without auth returns 401" "401" "$STATUS"

echo ""

###############################################################################
# RESULTS SUMMARY
###############################################################################
echo "============================================================"
echo -e "  RESULTS: ${GREEN}$PASS passed${NC}, ${RED}$FAIL failed${NC}, $TOTAL total"
echo "============================================================"

if [ ${#TESTS[@]} -gt 0 ]; then
  echo ""
  echo "  Failed tests:"
  for t in "${TESTS[@]}"; do
    echo -e "    - ${RED}$t${NC}"
  done
fi

echo ""
if [ "$FAIL" -eq 0 ]; then
  echo -e "  ${GREEN}ALL TESTS PASSED!${NC}"
else
  echo -e "  ${YELLOW}Some tests failed. Review output above.${NC}"
fi

exit "$FAIL"
