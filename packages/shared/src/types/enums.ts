// Match & Format
// context.md section 2 — all recognized formats
export type MatchFormat = 'test' | 'odi' | 't20' | 't10' | 'hundred' | 'firstclass' | 'lista' | 'custom';
// context.md section 5.3 — match statuses
export type MatchStatus = 'scheduled' | 'live' | 'innings_break' | 'rain_delay' | 'completed' | 'abandoned';
export type InningsStatus = 'not_started' | 'in_progress' | 'completed';
export type TossDecision = 'bat' | 'field';
export type TeamDesignation = 'home' | 'away';
export type TeamType = 'international' | 'domestic' | 'club' | 'custom';

// Player
export type BattingStyle = 'right_hand' | 'left_hand';
export type BowlingStyle =
  | 'right_arm_fast'
  | 'right_arm_medium'
  | 'right_arm_off_break'
  | 'right_arm_leg_break'
  | 'left_arm_fast'
  | 'left_arm_medium'
  | 'left_arm_orthodox'
  | 'left_arm_chinaman';
export type PlayerRole = 'batsman' | 'bowler' | 'all_rounder' | 'wicket_keeper';
export type TeamRole = 'captain' | 'vice_captain' | 'player' | 'wicket_keeper';

// Delivery
export type DismissalType =
  | 'bowled'
  | 'caught'
  | 'caught_and_bowled'
  | 'lbw'
  | 'run_out'
  | 'stumped'
  | 'hit_wicket'
  | 'retired_hurt'
  | 'retired_out'
  | 'obstructing_field'
  | 'timed_out'
  | 'handled_ball';

export type ShotType =
  | 'drive'
  | 'cut'
  | 'pull'
  | 'hook'
  | 'sweep'
  | 'reverse_sweep'
  | 'flick'
  | 'glance'
  | 'defence'
  | 'leave'
  | 'slog'
  | 'upper_cut'
  | 'scoop'
  | 'other';

export type BallLine = 'outside_off' | 'off_stump' | 'middle' | 'leg_stump' | 'outside_leg';
export type BallLength = 'full_toss' | 'yorker' | 'full' | 'good' | 'short' | 'bouncer';

export type ShotRegion =
  | 'point'
  | 'cover'
  | 'extra_cover'
  | 'mid_off'
  | 'straight'
  | 'mid_on'
  | 'mid_wicket'
  | 'square_leg'
  | 'fine_leg'
  | 'third_man'
  | 'long_off'
  | 'long_on'
  | 'deep_mid_wicket'
  | 'deep_square_leg';

export type MediaTagType = 'wicket' | 'boundary' | 'milestone' | 'review' | 'custom';

// context.md section 9 — user roles & permissions
export type UserRole = 'super_admin' | 'tournament_admin' | 'scorer' | 'team_manager' | 'analyst' | 'spectator' | 'broadcaster';

// Commentary modes — context.md section 7.2
export type CommentaryMode = 'auto' | 'manual' | 'assisted' | 'emoji' | 'rich';
