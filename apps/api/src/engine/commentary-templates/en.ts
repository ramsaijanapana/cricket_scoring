/**
 * English commentary templates.
 * Extracted from commentary-engine.ts for multi-language support.
 */

export type CommentaryCategory = 'dot' | 'runs' | 'four' | 'six' | 'wicket' | 'wide' | 'noball' | 'extras';

export interface CommentaryTemplate {
  full: string;
  short: string;
  emoji?: string;
}

export const templates: Record<CommentaryCategory, CommentaryTemplate[]> = {
  dot: [
    { full: '{over_ball} — Dot ball. Well bowled, the batsman is beaten.', short: 'Dot ball', emoji: '\u26AB' },
    { full: '{over_ball} — Defended solidly back to the bowler.', short: 'Defended', emoji: '\uD83D\uDEE1\uFE0F' },
    { full: '{over_ball} — No run. Good length delivery, left alone.', short: 'No run' },
  ],
  runs: [
    { full: '{over_ball} — {runs} run(s) taken. Score: {total}/{wickets}.', short: '{runs} run(s)', emoji: '\uD83C\uDFC3' },
    { full: '{over_ball} — Pushed into the gap for {runs}. {total}/{wickets}.', short: '{runs} runs' },
  ],
  four: [
    { full: '{over_ball} — FOUR! Brilliant shot races to the boundary. {total}/{wickets}.', short: 'FOUR!', emoji: '4\uFE0F\u20E3\uD83D\uDD25' },
    { full: '{over_ball} — FOUR! Cracked through the covers, no stopping that.', short: 'FOUR! Through covers', emoji: '4\uFE0F\u20E3\uD83D\uDCA5' },
    { full: '{over_ball} — FOUR! Driven elegantly past the fielder.', short: 'FOUR! Elegant drive', emoji: '4\uFE0F\u20E3\u2728' },
  ],
  six: [
    { full: '{over_ball} — SIX! Massive hit, that has gone all the way! {total}/{wickets}.', short: 'SIX!', emoji: '6\uFE0F\u20E3\uD83D\uDE80' },
    { full: '{over_ball} — SIX! Into the stands! What a shot!', short: 'SIX! Into the stands', emoji: '6\uFE0F\u20E3\uD83D\uDCAB' },
    { full: '{over_ball} — SIX! Launched over long-on, enormous hit!', short: 'SIX! Over long-on', emoji: '6\uFE0F\u20E3\uD83C\uDFCF' },
  ],
  wicket: [
    { full: '{over_ball} — OUT! Wicket falls! {total}/{wickets}.', short: 'OUT!', emoji: '\u274C\uD83C\uDFCF' },
    { full: '{over_ball} — WICKET! A crucial breakthrough! {total}/{wickets}.', short: 'WICKET! Breakthrough', emoji: '\uD83C\uDFAF\u274C' },
    { full: '{over_ball} — Gone! That is the end of the partnership. {total}/{wickets}.', short: 'WICKET! Partnership broken', emoji: '\uD83D\uDC94\u274C' },
  ],
  wide: [
    { full: '{over_ball} — Wide ball. Extra run conceded.', short: 'Wide', emoji: '\u2194\uFE0F' },
    { full: '{over_ball} — Called wide. Straying down the leg side.', short: 'Wide ball' },
  ],
  noball: [
    { full: '{over_ball} — No ball! Overstepped the crease. Free hit coming up.', short: 'No ball! Free hit', emoji: '\uD83D\uDEAB\uD83E\uDDB6' },
    { full: '{over_ball} — No ball called. Front foot violation.', short: 'No ball' },
  ],
  extras: [
    { full: '{over_ball} — {runs} byes. Went past the keeper.', short: '{runs} byes', emoji: '\uD83D\uDC4B' },
    { full: '{over_ball} — {runs} leg byes. Off the pads.', short: '{runs} leg byes' },
  ],
};
