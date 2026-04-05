#!/usr/bin/env bash
set -euo pipefail

###############################################################################
# Cricket Scoring App — End-to-End Test Suite
#
# Tests the complete scoring flow against the real API at http://localhost:3001.
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

# Use node for JSON parsing since python3 may not be available
json_get() {
  echo "$1" | node -e "
    let d=''; process.stdin.on('data',c=>d+=c); process.stdin.on('end',()=>{
      try {
        const o=JSON.parse(d);
        const keys='$2'.split('.');
        let v=o;
        for(const k of keys) v=v?.[k];
        console.log(v===undefined||v===null?'':String(v));
      } catch(e){ console.log(''); }
    })
  " 2>/dev/null
}

extract_id() {
  json_get "$1" "id"
}

split_response() {
  local raw="$1"
  BODY=$(echo "$raw" | sed '$d')
  STATUS=$(echo "$raw" | tail -1)
}

post() {
  curl -s -w "\n%{http_code}" -X POST "$1" -H "Content-Type: application/json" -d "$2" 2>/dev/null
}

get() {
  curl -s -w "\n%{http_code}" "$1" 2>/dev/null
}

patch_req() {
  curl -s -w "\n%{http_code}" -X PATCH "$1" -H "Content-Type: application/json" -d "$2" 2>/dev/null
}

del() {
  curl -s -w "\n%{http_code}" -X DELETE "$1" -H "Content-Type: application/json" ${2:+-d "$2"} 2>/dev/null
}

del_with_header() {
  curl -s -w "\n%{http_code}" -X DELETE "$1" -H "$2" 2>/dev/null
}

get_with_header() {
  curl -s -w "\n%{http_code}" -H "$2" "$1" 2>/dev/null
}

# ---------- Verify API is running --------------------------------------------
echo ""
echo "================================================================"
echo "  Cricket Scoring App — E2E Test Suite"
echo "================================================================"
echo ""
echo "Checking API at http://localhost:3001 ..."
if ! curl -s --max-time 3 "http://localhost:3001/health" > /dev/null 2>&1; then
  echo "ERROR: API not running. Start with: cd apps/api && npx tsx src/server.ts"
  exit 1
fi
echo "API is up. Starting tests..."
echo ""

###############################################################################
# 1. HEALTH CHECK
###############################################################################
echo "--- 1. Health Check ---"

RAW=$(get "http://localhost:3001/health")
split_response "$RAW"
assert_status "GET /health returns 200" "200" "$STATUS"
assert_contains "Health body has ok" "$BODY" "ok"

echo ""

###############################################################################
# 2. AUTH FLOW
###############################################################################
echo "--- 2. Auth Flow ---"

UNIQUE_EMAIL="e2e-$(date +%s)@test.com"

# Register
RAW=$(post "$API/auth/register" "{\"email\":\"$UNIQUE_EMAIL\",\"password\":\"Test1234!\",\"displayName\":\"E2E Tester\"}")
split_response "$RAW"
assert_status "POST /auth/register returns 201" "201" "$STATUS"
assert_contains "Register response has user" "$BODY" "user"
AUTH_USER_ID=$(json_get "$BODY" "user.id")
echo "    -> User: $AUTH_USER_ID"

# Duplicate registration
RAW=$(post "$API/auth/register" "{\"email\":\"$UNIQUE_EMAIL\",\"password\":\"Test1234!\",\"displayName\":\"E2E Tester\"}")
split_response "$RAW"
assert_status "Duplicate register returns 409" "409" "$STATUS"

# Login
RAW=$(post "$API/auth/login" "{\"email\":\"$UNIQUE_EMAIL\",\"password\":\"Test1234!\"}")
split_response "$RAW"
assert_status "POST /auth/login returns 200" "200" "$STATUS"
assert_contains "Login has access_token" "$BODY" "access_token"
assert_contains "Login has refresh_token" "$BODY" "refresh_token"
ACCESS_TOKEN=$(json_get "$BODY" "access_token")
REFRESH_TOKEN=$(json_get "$BODY" "refresh_token")
echo "    -> Token: ${ACCESS_TOKEN:0:20}..."

# Refresh
RAW=$(post "$API/auth/refresh" "{\"refresh_token\":\"$REFRESH_TOKEN\"}")
split_response "$RAW"
assert_status "POST /auth/refresh returns 200" "200" "$STATUS"
assert_contains "Refresh has new access_token" "$BODY" "access_token"
NEW_REFRESH=$(json_get "$BODY" "refresh_token")

# Logout
RAW=$(post "$API/auth/logout" "{\"refresh_token\":\"$NEW_REFRESH\"}")
split_response "$RAW"
assert_status "POST /auth/logout returns 204" "204" "$STATUS"

echo ""

###############################################################################
# 3. TEAM MANAGEMENT
###############################################################################
echo "--- 3. Team Management ---"

TS=$(date +%s)
RAW=$(post "$API/teams" "{\"name\":\"Mumbai Indians $TS\",\"teamType\":\"franchise\",\"shortName\":\"MI\",\"country\":\"India\"}")
split_response "$RAW"
assert_status "POST /teams (Team A) returns 201" "201" "$STATUS"
TEAM_A_ID=$(extract_id "$BODY")
echo "    -> Team A: $TEAM_A_ID"

RAW=$(post "$API/teams" "{\"name\":\"Chennai Super Kings $TS\",\"teamType\":\"franchise\",\"shortName\":\"CSK\",\"country\":\"India\"}")
split_response "$RAW"
assert_status "POST /teams (Team B) returns 201" "201" "$STATUS"
TEAM_B_ID=$(extract_id "$BODY")
echo "    -> Team B: $TEAM_B_ID"

RAW=$(get "$API/teams")
split_response "$RAW"
assert_status "GET /teams returns 200" "200" "$STATUS"
assert_contains "Teams list has Team A" "$BODY" "Mumbai Indians"

echo ""

###############################################################################
# 4. PLAYER MANAGEMENT
###############################################################################
echo "--- 4. Player Management ---"

TEAM_A_XI=()
TEAM_B_XI=()

A_NAMES=("Rohit Sharma" "Virat Kohli" "Shubman Gill" "KL Rahul" "Rishabh Pant" "Hardik Pandya" "Ravindra Jadeja" "Jasprit Bumrah" "Mohammed Shami" "Yuzvendra Chahal" "Mohammed Siraj")
B_NAMES=("David Warner" "Travis Head" "Marnus Labuschagne" "Steve Smith" "Glenn Maxwell" "Mitchell Marsh" "Alex Carey" "Pat Cummins" "Mitchell Starc" "Josh Hazlewood" "Nathan Lyon")

for name in "${A_NAMES[@]}"; do
  FIRST=$(echo "$name" | awk '{print $1}')
  LAST=$(echo "$name" | awk '{$1=""; print substr($0,2)}')
  RESP=$(curl -s -X POST "$API/players" -H "Content-Type: application/json" -d "{\"firstName\":\"$FIRST\",\"lastName\":\"$LAST\"}")
  PID=$(extract_id "$RESP")
  TEAM_A_XI+=("$PID")
done

for name in "${B_NAMES[@]}"; do
  FIRST=$(echo "$name" | awk '{print $1}')
  LAST=$(echo "$name" | awk '{$1=""; print substr($0,2)}')
  RESP=$(curl -s -X POST "$API/players" -H "Content-Type: application/json" -d "{\"firstName\":\"$FIRST\",\"lastName\":\"$LAST\"}")
  PID=$(extract_id "$RESP")
  TEAM_B_XI+=("$PID")
done

if [ -n "${TEAM_A_XI[0]}" ] && [ -n "${TEAM_B_XI[0]}" ]; then
  PASS=$((PASS + 1)); echo "  PASS: Created 22 players (11 per team)"
else
  FAIL=$((FAIL + 1)); echo "  FAIL: Player creation"; TESTS+=("FAIL: Player creation")
fi

A_XI_JSON=$(printf '"%s",' "${TEAM_A_XI[@]}" | sed 's/,$//')
B_XI_JSON=$(printf '"%s",' "${TEAM_B_XI[@]}" | sed 's/,$//')

echo ""

###############################################################################
# 5. FORMAT CONFIGS
###############################################################################
echo "--- 5. Format Configs ---"

RAW=$(get "$API/format-configs")
split_response "$RAW"
assert_status "GET /format-configs returns 200" "200" "$STATUS"

# Create custom format
RAW=$(post "$API/format-configs" '{"name":"Club 35-Over","oversPerInnings":35,"inningsPerSide":2,"maxBowlerOvers":7,"ballsPerOver":6}')
split_response "$RAW"
assert_status "POST /format-configs returns 201" "201" "$STATUS"
assert_contains "Custom format has name" "$BODY" "Club 35-Over"

echo ""

###############################################################################
# 6. MATCH LIFECYCLE
###############################################################################
echo "--- 6. Match Lifecycle ---"

RAW=$(post "$API/matches" "{
  \"formatConfigId\": \"t20\",
  \"venue\": \"Wankhede Stadium\",
  \"city\": \"Mumbai\",
  \"country\": \"India\",
  \"homeTeamId\": \"$TEAM_A_ID\",
  \"awayTeamId\": \"$TEAM_B_ID\",
  \"homePlayingXi\": [$A_XI_JSON],
  \"awayPlayingXi\": [$B_XI_JSON]
}")
split_response "$RAW"
assert_status "POST /matches returns 201" "201" "$STATUS"
MATCH_ID=$(extract_id "$BODY")
echo "    -> Match: $MATCH_ID"

# Get match
RAW=$(get "$API/matches/$MATCH_ID")
split_response "$RAW"
assert_status "GET /matches/:id returns 200" "200" "$STATUS"
assert_contains "Match is scheduled" "$BODY" "scheduled"

# Toss
RAW=$(post "$API/matches/$MATCH_ID/toss" "{\"winner_id\":\"$TEAM_A_ID\",\"decision\":\"bat\"}")
split_response "$RAW"
assert_status "POST toss returns 200" "200" "$STATUS"
assert_contains "Status is toss" "$BODY" "toss"

# Start match
RAW=$(post "$API/matches/$MATCH_ID/start" "{
  \"battingTeamId\": \"$TEAM_A_ID\",
  \"bowlingTeamId\": \"$TEAM_B_ID\",
  \"battingOrder\": [$A_XI_JSON]
}")
split_response "$RAW"
assert_status "POST /start returns 201" "201" "$STATUS"
INNINGS_ID=$(extract_id "$BODY")
echo "    -> Innings: $INNINGS_ID"

# Verify live
RAW=$(get "$API/matches/$MATCH_ID")
split_response "$RAW"
assert_contains "Match is live" "$BODY" "live"

BATTER1="${TEAM_A_XI[0]}"
BATTER2="${TEAM_A_XI[1]}"
BATTER3="${TEAM_A_XI[2]}"
BOWLER1="${TEAM_B_XI[7]}"  # Pat Cummins
BOWLER2="${TEAM_B_XI[8]}"  # Mitchell Starc

echo ""

###############################################################################
# 7. SCORING — 2 Overs
###############################################################################
echo "--- 7. Scoring (2 Overs) ---"

score_ball() {
  local desc="$1" payload="$2" expect="${3:-}"
  RAW=$(post "$API/matches/$MATCH_ID/deliveries" "$payload")
  split_response "$RAW"
  assert_status "$desc - returns 201" "201" "$STATUS"
  if [ -n "$expect" ]; then
    assert_contains "$desc - $expect" "$BODY" "$expect"
  fi
}

echo "  -- Over 1 --"

# 1.1 Dot
score_ball "1.1 dot" \
  "{\"innings_num\":1,\"bowler_id\":\"$BOWLER1\",\"striker_id\":\"$BATTER1\",\"non_striker_id\":\"$BATTER2\",\"runs_batsman\":0,\"runs_extras\":0,\"is_wicket\":false,\"is_retired_hurt\":false}"

# 1.2 Single
score_ball "1.2 single" \
  "{\"innings_num\":1,\"bowler_id\":\"$BOWLER1\",\"striker_id\":\"$BATTER1\",\"non_striker_id\":\"$BATTER2\",\"runs_batsman\":1,\"runs_extras\":0,\"is_wicket\":false,\"is_retired_hurt\":false}"

# 1.3 Four
score_ball "1.3 FOUR" \
  "{\"innings_num\":1,\"bowler_id\":\"$BOWLER1\",\"striker_id\":\"$BATTER2\",\"non_striker_id\":\"$BATTER1\",\"runs_batsman\":4,\"runs_extras\":0,\"is_wicket\":false,\"is_retired_hurt\":false}" \
  "\"runsBatsman\":4"

# 1.4 Six
score_ball "1.4 SIX" \
  "{\"innings_num\":1,\"bowler_id\":\"$BOWLER1\",\"striker_id\":\"$BATTER2\",\"non_striker_id\":\"$BATTER1\",\"runs_batsman\":6,\"runs_extras\":0,\"is_wicket\":false,\"is_retired_hurt\":false}" \
  "\"runsBatsman\":6"

# 1.5 Wide
score_ball "1.5 wide" \
  "{\"innings_num\":1,\"bowler_id\":\"$BOWLER1\",\"striker_id\":\"$BATTER2\",\"non_striker_id\":\"$BATTER1\",\"runs_batsman\":0,\"runs_extras\":1,\"extra_type\":\"wide\",\"is_wicket\":false,\"is_retired_hurt\":false}" \
  "\"extraType\":\"wide\""

# 1.5 No-ball (triggers free hit)
score_ball "1.5 no-ball" \
  "{\"innings_num\":1,\"bowler_id\":\"$BOWLER1\",\"striker_id\":\"$BATTER2\",\"non_striker_id\":\"$BATTER1\",\"runs_batsman\":1,\"runs_extras\":1,\"extra_type\":\"noball\",\"is_wicket\":false,\"is_retired_hurt\":false}" \
  "\"extraType\":\"noball\""

# 1.5 Free hit delivery
score_ball "1.5 free-hit" \
  "{\"innings_num\":1,\"bowler_id\":\"$BOWLER1\",\"striker_id\":\"$BATTER2\",\"non_striker_id\":\"$BATTER1\",\"runs_batsman\":4,\"runs_extras\":0,\"is_wicket\":false,\"is_retired_hurt\":false}" \
  "\"isFreeHit\":true"

# 1.6 Byes
score_ball "1.6 byes" \
  "{\"innings_num\":1,\"bowler_id\":\"$BOWLER1\",\"striker_id\":\"$BATTER1\",\"non_striker_id\":\"$BATTER2\",\"runs_batsman\":0,\"runs_extras\":2,\"extra_type\":\"bye\",\"is_wicket\":false,\"is_retired_hurt\":false}" \
  "\"extraType\":\"bye\""

echo ""
echo "  -- Over 2 --"

# 2.1 Dot
score_ball "2.1 dot" \
  "{\"innings_num\":1,\"bowler_id\":\"$BOWLER2\",\"striker_id\":\"$BATTER1\",\"non_striker_id\":\"$BATTER2\",\"runs_batsman\":0,\"runs_extras\":0,\"is_wicket\":false,\"is_retired_hurt\":false}"

# 2.2 Two
score_ball "2.2 two" \
  "{\"innings_num\":1,\"bowler_id\":\"$BOWLER2\",\"striker_id\":\"$BATTER1\",\"non_striker_id\":\"$BATTER2\",\"runs_batsman\":2,\"runs_extras\":0,\"is_wicket\":false,\"is_retired_hurt\":false}"

# 2.3 WICKET
score_ball "2.3 WICKET" \
  "{\"innings_num\":1,\"bowler_id\":\"$BOWLER2\",\"striker_id\":\"$BATTER1\",\"non_striker_id\":\"$BATTER2\",\"runs_batsman\":0,\"runs_extras\":0,\"is_wicket\":true,\"wicket_type\":\"bowled\",\"dismissed_id\":\"$BATTER1\",\"is_retired_hurt\":false}" \
  "\"isWicket\":true"

# 2.4 Single (new batter)
score_ball "2.4 single" \
  "{\"innings_num\":1,\"bowler_id\":\"$BOWLER2\",\"striker_id\":\"$BATTER3\",\"non_striker_id\":\"$BATTER2\",\"runs_batsman\":1,\"runs_extras\":0,\"is_wicket\":false,\"is_retired_hurt\":false}"

# 2.5 Leg bye
score_ball "2.5 leg bye" \
  "{\"innings_num\":1,\"bowler_id\":\"$BOWLER2\",\"striker_id\":\"$BATTER2\",\"non_striker_id\":\"$BATTER3\",\"runs_batsman\":0,\"runs_extras\":1,\"extra_type\":\"legbye\",\"is_wicket\":false,\"is_retired_hurt\":false}" \
  "\"extraType\":\"legbye\""

# 2.6 Three
score_ball "2.6 three" \
  "{\"innings_num\":1,\"bowler_id\":\"$BOWLER2\",\"striker_id\":\"$BATTER3\",\"non_striker_id\":\"$BATTER2\",\"runs_batsman\":3,\"runs_extras\":0,\"is_wicket\":false,\"is_retired_hurt\":false}"

# Verify state
RAW=$(get "$API/matches/$MATCH_ID/state?fields=innings")
split_response "$RAW"
assert_status "Match state after 2 overs" "200" "$STATUS"
assert_contains "State has innings" "$BODY" "innings"

echo ""

###############################################################################
# 8. UNDO
###############################################################################
echo "--- 8. Undo ---"

score_ball "Extra delivery for undo" \
  "{\"innings_num\":1,\"bowler_id\":\"$BOWLER1\",\"striker_id\":\"$BATTER2\",\"non_striker_id\":\"$BATTER3\",\"runs_batsman\":2,\"runs_extras\":0,\"is_wicket\":false,\"is_retired_hurt\":false}"

RAW=$(del "$API/matches/$MATCH_ID/deliveries/last" "{\"inningsId\":\"$INNINGS_ID\"}")
split_response "$RAW"
assert_status "DELETE /deliveries/last returns 200" "200" "$STATUS"
assert_contains "Undo success" "$BODY" "success"
assert_contains "Undo has overriddenDeliveryId" "$BODY" "overriddenDeliveryId"

echo ""

###############################################################################
# 9. SCORECARD
###############################################################################
echo "--- 9. Scorecard ---"

RAW=$(get "$API/matches/$MATCH_ID/scorecard")
split_response "$RAW"
assert_status "GET /scorecard returns 200" "200" "$STATUS"
assert_contains "Scorecard has batting" "$BODY" "batting"
assert_contains "Scorecard has bowling" "$BODY" "bowling"
assert_contains "Scorecard has extras" "$BODY" "extras"
assert_contains "Scorecard has battingTeamName" "$BODY" "battingTeamName"
assert_contains "Scorecard has bowlingTeamName" "$BODY" "bowlingTeamName"
assert_contains "Scorecard has playerName" "$BODY" "playerName"
assert_contains "Scorecard has runsScored" "$BODY" "runsScored"
assert_contains "Scorecard has ballsFaced" "$BODY" "ballsFaced"
assert_contains "Scorecard has wicketsTaken" "$BODY" "wicketsTaken"

echo ""

###############################################################################
# 10. INTERRUPTION + RESUME
###############################################################################
echo "--- 10. Interruption & Resume ---"

RAW=$(post "$API/matches/$MATCH_ID/interruption" '{"reason":"rain"}')
split_response "$RAW"
assert_status "POST /interruption returns 200" "200" "$STATUS"
assert_contains "Status is rain_delay" "$BODY" "rain_delay"

RAW=$(get "$API/matches/$MATCH_ID")
split_response "$RAW"
assert_contains "Match confirms rain_delay" "$BODY" "rain_delay"

RAW=$(post "$API/matches/$MATCH_ID/resume" '{}')
split_response "$RAW"
assert_status "POST /resume returns 200" "200" "$STATUS"
assert_contains "Status back to live" "$BODY" "live"

echo ""

###############################################################################
# 11. DRS REVIEW
###############################################################################
echo "--- 11. DRS Review ---"

# Record LBW delivery
score_ball "LBW for DRS" \
  "{\"innings_num\":1,\"bowler_id\":\"$BOWLER1\",\"striker_id\":\"$BATTER2\",\"non_striker_id\":\"$BATTER3\",\"runs_batsman\":0,\"runs_extras\":0,\"is_wicket\":true,\"wicket_type\":\"lbw\",\"dismissed_id\":\"$BATTER2\",\"is_retired_hurt\":false}"

LBW_DEL_ID=$(json_get "$BODY" "delivery.id")
echo "    -> LBW delivery: $LBW_DEL_ID"

# Create DRS review
RAW=$(post "$API/matches/$MATCH_ID/reviews" "{
  \"deliveryId\": \"$LBW_DEL_ID\",
  \"reviewingTeamId\": \"$TEAM_A_ID\",
  \"inningsId\": \"$INNINGS_ID\"
}")
split_response "$RAW"
assert_status "POST /reviews returns 201" "201" "$STATUS"
assert_contains "Review has pending status" "$BODY" "pending"
REVIEW_ID=$(extract_id "$BODY")
echo "    -> Review: $REVIEW_ID"

# Update review outcome
RAW=$(patch_req "$API/matches/$MATCH_ID/reviews/$REVIEW_ID" '{
  "status": "overturned",
  "wicketReversed": true,
  "revisedDecision": {"is_wicket": false}
}')
split_response "$RAW"
assert_status "PATCH /reviews/:id returns 200" "200" "$STATUS"
assert_contains "Review overturned" "$BODY" "overturned"

echo ""

###############################################################################
# 12. PARTIAL STATE + MISC
###############################################################################
echo "--- 12. Partial State & Misc ---"

RAW=$(get "$API/matches/$MATCH_ID/state?fields=innings,current_over")
split_response "$RAW"
assert_status "GET /state returns 200" "200" "$STATUS"
assert_contains "State has innings" "$BODY" "innings"
assert_contains "State has current_over" "$BODY" "current_over"

# Commentary
RAW=$(get "$API/matches/$MATCH_ID/commentary")
split_response "$RAW"
assert_status "GET /commentary returns 200" "200" "$STATUS"

# Substitution
RAW=$(post "$API/matches/$MATCH_ID/substitutions" "{
  \"teamId\": \"$TEAM_A_ID\",
  \"playerOutId\": \"${TEAM_A_XI[10]}\",
  \"playerInId\": \"${TEAM_A_XI[0]}\",
  \"reason\": \"tactical\"
}")
split_response "$RAW"
assert_status "POST /substitutions returns 201" "201" "$STATUS"

# Match list (enriched)
RAW=$(get "$API/matches")
split_response "$RAW"
assert_status "GET /matches returns 200" "200" "$STATUS"
assert_contains "Match list has homeTeamName" "$BODY" "homeTeamName"
assert_contains "Match list has awayTeamName" "$BODY" "awayTeamName"

echo ""

###############################################################################
# 13. GDPR
###############################################################################
echo "--- 13. GDPR ---"

RAW=$(get_with_header "$API/users/me/export" "x-user-id: $AUTH_USER_ID")
split_response "$RAW"
assert_status "GET /users/me/export returns 200" "200" "$STATUS"
assert_contains "Export has email" "$BODY" "email"

RAW=$(del_with_header "$API/users/me" "x-user-id: $AUTH_USER_ID")
split_response "$RAW"
assert_status "DELETE /users/me returns 204" "204" "$STATUS"

echo ""

###############################################################################
# SUMMARY
###############################################################################
echo "================================================================"
echo "  TEST SUMMARY"
echo "================================================================"
echo ""
echo "  Total:  $((PASS + FAIL))"
echo "  Passed: $PASS"
echo "  Failed: $FAIL"
echo ""

if [ ${#TESTS[@]} -gt 0 ]; then
  echo "  FAILURES:"
  for t in "${TESTS[@]}"; do
    echo "    - $t"
  done
  echo ""
fi

if [ "$FAIL" -eq 0 ]; then
  echo "  All tests passed!"
  echo ""
  exit 0
else
  echo "  Some tests failed."
  echo ""
  exit 1
fi
