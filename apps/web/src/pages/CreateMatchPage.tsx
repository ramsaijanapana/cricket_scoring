import { useState, useReducer, useRef, useEffect, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, type CreateMatchInput } from '../lib/api';
import type { Team } from '@cricket/shared';

// ─── Constants ──────────────────────────────────────────────────────────────

const QUICK_OVERS = [5, 10, 15, 20] as const;

const BALL_TYPES = [
  { value: 'tennis', label: 'Tennis' },
  { value: 'tape', label: 'Tape' },
  { value: 'hard_tennis', label: 'Hard Tennis' },
  { value: 'leather', label: 'Leather' },
  { value: 'other', label: 'Other' },
] as const;

const QUICK_BALL_TYPES = ['tennis', 'tape', 'leather'] as const;

const FORMATS = [
  { value: 't20', label: 'T20', overs: 20, powerplay: 6 },
  { value: 'odi', label: 'ODI', overs: 50, powerplay: 10 },
  { value: 'test', label: 'Test', overs: 0, powerplay: 0 },
  { value: 't10', label: 'T10', overs: 10, powerplay: 2 },
  { value: 'hundred', label: 'The Hundred', overs: 20, powerplay: 5 },
  { value: 'custom', label: 'Custom', overs: 20, powerplay: 6 },
] as const;

const WIZARD_STEPS = ['Format', 'Teams', 'Toss', 'Venue', 'Review'] as const;

// ─── Wizard State ───────────────────────────────────────────────────────────

interface WizardState {
  format: string;
  overs: number;
  ballType: string;
  powerplayOvers: number;
  teamAName: string;
  teamBName: string;
  teamAId: string | null;
  teamBId: string | null;
  teamAPlayers: string[];
  teamBPlayers: string[];
  tossWinner: 'A' | 'B' | null;
  tossChoice: 'bat' | 'bowl' | null;
  venue: string;
  city: string;
  country: string;
}

type WizardAction =
  | { type: 'SET_FORMAT'; format: string }
  | { type: 'SET_OVERS'; overs: number }
  | { type: 'SET_BALL_TYPE'; ballType: string }
  | { type: 'SET_POWERPLAY'; powerplayOvers: number }
  | { type: 'SET_TEAM_A_NAME'; name: string }
  | { type: 'SET_TEAM_B_NAME'; name: string }
  | { type: 'SET_TEAM_A_ID'; id: string | null }
  | { type: 'SET_TEAM_B_ID'; id: string | null }
  | { type: 'SET_TEAM_A_PLAYERS'; players: string[] }
  | { type: 'SET_TEAM_B_PLAYERS'; players: string[] }
  | { type: 'SET_TOSS_WINNER'; winner: 'A' | 'B' }
  | { type: 'SET_TOSS_CHOICE'; choice: 'bat' | 'bowl' }
  | { type: 'SET_VENUE'; venue: string }
  | { type: 'SET_CITY'; city: string }
  | { type: 'SET_COUNTRY'; country: string };

const initialWizardState: WizardState = {
  format: 't20',
  overs: 20,
  ballType: 'leather',
  powerplayOvers: 6,
  teamAName: '',
  teamBName: '',
  teamAId: null,
  teamBId: null,
  teamAPlayers: [],
  teamBPlayers: [],
  tossWinner: null,
  tossChoice: null,
  venue: '',
  city: '',
  country: '',
};

function wizardReducer(state: WizardState, action: WizardAction): WizardState {
  switch (action.type) {
    case 'SET_FORMAT': {
      const fmt = FORMATS.find((f) => f.value === action.format);
      return {
        ...state,
        format: action.format,
        overs: fmt?.overs ?? state.overs,
        powerplayOvers: fmt?.powerplay ?? state.powerplayOvers,
      };
    }
    case 'SET_OVERS':
      return { ...state, overs: action.overs };
    case 'SET_BALL_TYPE':
      return { ...state, ballType: action.ballType };
    case 'SET_POWERPLAY':
      return { ...state, powerplayOvers: action.powerplayOvers };
    case 'SET_TEAM_A_NAME':
      return { ...state, teamAName: action.name };
    case 'SET_TEAM_B_NAME':
      return { ...state, teamBName: action.name };
    case 'SET_TEAM_A_ID':
      return { ...state, teamAId: action.id };
    case 'SET_TEAM_B_ID':
      return { ...state, teamBId: action.id };
    case 'SET_TEAM_A_PLAYERS':
      return { ...state, teamAPlayers: action.players };
    case 'SET_TEAM_B_PLAYERS':
      return { ...state, teamBPlayers: action.players };
    case 'SET_TOSS_WINNER':
      return { ...state, tossWinner: action.winner };
    case 'SET_TOSS_CHOICE':
      return { ...state, tossChoice: action.choice };
    case 'SET_VENUE':
      return { ...state, venue: action.venue };
    case 'SET_CITY':
      return { ...state, city: action.city };
    case 'SET_COUNTRY':
      return { ...state, country: action.country };
    default:
      return state;
  }
}

// ─── Shared Sub-Components ──────────────────────────────────────────────────

function Spinner() {
  return (
    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" aria-hidden="true">
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
        fill="none"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
      />
    </svg>
  );
}

function ErrorBanner({ message }: { message: string }) {
  return (
    <div
      className="mt-4 p-3 rounded-xl bg-cricket-red/10 border border-cricket-red/20 animate-scale-in"
      role="alert"
    >
      <p className="text-cricket-red text-sm text-center font-medium">{message}</p>
    </div>
  );
}

function Pill({
  selected,
  onClick,
  children,
  ariaLabel,
}: {
  selected: boolean;
  onClick: () => void;
  children: ReactNode;
  ariaLabel: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      aria-pressed={selected}
      className={`px-4 py-2 rounded-lg font-semibold text-sm transition-all duration-200 ${
        selected
          ? 'bg-cricket-green/15 text-cricket-green border border-cricket-green/30 shadow-glow-green'
          : 'surface-interactive'
      }`}
    >
      {children}
    </button>
  );
}

function SectionCard({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-2xl border border-white/[0.06] bg-white/[0.02] p-5 ${className}`}>
      {children}
    </div>
  );
}

// ─── Team Search Dropdown ───────────────────────────────────────────────────

function TeamSearchInput({
  value,
  onChange,
  onSelectTeam,
  teams,
  placeholder,
  ariaLabel,
}: {
  value: string;
  onChange: (name: string) => void;
  onSelectTeam: (team: Team | null) => void;
  teams: Team[];
  placeholder: string;
  ariaLabel: string;
}) {
  const [showDropdown, setShowDropdown] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const filtered = value.trim()
    ? teams.filter((t) => t.name.toLowerCase().includes(value.toLowerCase()))
    : [];

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <input
        type="text"
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          onSelectTeam(null);
          setShowDropdown(true);
        }}
        onFocus={() => setShowDropdown(true)}
        placeholder={placeholder}
        aria-label={ariaLabel}
        className="input w-full"
      />
      {showDropdown && filtered.length > 0 && (
        <ul
          className="absolute z-20 mt-1 w-full max-h-40 overflow-y-auto rounded-lg border border-white/[0.1] bg-surface-900 shadow-lg"
          role="listbox"
          aria-label={`${ariaLabel} suggestions`}
        >
          {filtered.slice(0, 8).map((t) => (
            <li
              key={t.id}
              role="option"
              aria-selected={false}
              className="px-3 py-2 text-sm text-theme-secondary hover:bg-white/[0.06] cursor-pointer transition-colors"
              onClick={() => {
                onChange(t.name);
                onSelectTeam(t);
                setShowDropdown(false);
              }}
            >
              {t.name}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ─── Playing XI Editor ──────────────────────────────────────────────────────

function PlayingXIEditor({
  players,
  onChange,
  teamLabel,
}: {
  players: string[];
  onChange: (players: string[]) => void;
  teamLabel: string;
}) {
  const addPlayer = () => {
    if (players.length < 11) {
      onChange([...players, '']);
    }
  };

  const updatePlayer = (index: number, name: string) => {
    const updated = [...players];
    updated[index] = name;
    onChange(updated);
  };

  const removePlayer = (index: number) => {
    onChange(players.filter((_, i) => i !== index));
  };

  return (
    <div className="mt-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-theme-muted font-medium">
          Playing XI ({players.length}/11) — optional
        </span>
        {players.length < 11 && (
          <button
            type="button"
            onClick={addPlayer}
            aria-label={`Add player to ${teamLabel}`}
            className="text-xs text-cricket-green hover:text-cricket-green/80 font-medium transition-colors"
          >
            + Add player
          </button>
        )}
      </div>
      <div className="space-y-1.5">
        {players.map((p, i) => (
          <div key={i} className="flex items-center gap-2">
            <span className="text-[10px] text-theme-muted w-4 text-right shrink-0">
              {i + 1}
            </span>
            <input
              type="text"
              value={p}
              onChange={(e) => updatePlayer(i, e.target.value)}
              placeholder={`Player ${i + 1}`}
              aria-label={`${teamLabel} player ${i + 1} name`}
              className="input flex-1 text-sm py-1.5"
            />
            <button
              type="button"
              onClick={() => removePlayer(i)}
              aria-label={`Remove player ${i + 1} from ${teamLabel}`}
              className="text-theme-muted hover:text-cricket-red text-sm transition-colors p-1"
            >
              &times;
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Step Indicator ─────────────────────────────────────────────────────────

function StepIndicator({
  steps,
  currentStep,
  onStepClick,
}: {
  steps: readonly string[];
  currentStep: number;
  onStepClick: (step: number) => void;
}) {
  return (
    <nav className="flex items-center justify-between mb-8" aria-label="Wizard progress">
      {steps.map((label, i) => {
        const isCompleted = i < currentStep;
        const isCurrent = i === currentStep;
        const isClickable = i <= currentStep;

        return (
          <div key={label} className="flex items-center flex-1 last:flex-none">
            <button
              type="button"
              onClick={() => isClickable && onStepClick(i)}
              disabled={!isClickable}
              aria-label={`Step ${i + 1}: ${label}${isCurrent ? ' (current)' : ''}${isCompleted ? ' (completed)' : ''}`}
              aria-current={isCurrent ? 'step' : undefined}
              className={`flex items-center justify-center w-8 h-8 rounded-full text-xs font-bold transition-all duration-300 shrink-0 ${
                isCurrent
                  ? 'bg-cricket-green text-white shadow-glow-green'
                  : isCompleted
                    ? 'bg-cricket-green/20 text-cricket-green cursor-pointer hover:bg-cricket-green/30'
                    : 'bg-white/[0.04] text-theme-muted'
              }`}
            >
              {isCompleted ? (
                <svg
                  className="w-3.5 h-3.5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={3}
                  aria-hidden="true"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              ) : (
                i + 1
              )}
            </button>
            {i < steps.length - 1 && (
              <div
                className={`flex-1 h-0.5 mx-2 rounded-full transition-colors duration-300 ${
                  i < currentStep ? 'bg-cricket-green/40' : 'bg-white/[0.06]'
                }`}
              />
            )}
          </div>
        );
      })}
    </nav>
  );
}

// ─── Wizard Steps ───────────────────────────────────────────────────────────

function StepFormat({
  state,
  dispatch,
}: {
  state: WizardState;
  dispatch: React.Dispatch<WizardAction>;
}) {
  return (
    <div>
      <h3 className="text-lg font-bold mb-1">Match Format</h3>
      <p className="text-theme-tertiary text-sm mb-5">Choose the format and ball type</p>

      <div className="mb-5">
        <label className="label">Format</label>
        <div className="grid grid-cols-3 gap-2">
          {FORMATS.map((f) => (
            <button
              key={f.value}
              type="button"
              onClick={() => dispatch({ type: 'SET_FORMAT', format: f.value })}
              aria-label={`Format: ${f.label}`}
              aria-pressed={state.format === f.value}
              className={`py-3 px-2 rounded-xl font-semibold text-sm transition-all duration-200 ${
                state.format === f.value
                  ? 'bg-cricket-green/15 text-cricket-green border border-cricket-green/30 shadow-glow-green'
                  : 'surface-interactive'
              }`}
            >
              {f.label}
              <span
                className={`block text-[10px] mt-0.5 font-normal ${
                  state.format === f.value ? 'text-cricket-green/70' : 'text-theme-muted'
                }`}
              >
                {f.overs ? `${f.overs} overs` : 'Unlimited'}
              </span>
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-5">
        <div>
          <label className="label">Overs per innings</label>
          <input
            type="number"
            min={1}
            max={100}
            value={state.overs || ''}
            onChange={(e) =>
              dispatch({ type: 'SET_OVERS', overs: parseInt(e.target.value) || 0 })
            }
            disabled={state.format === 'test'}
            aria-label="Overs per innings"
            className="input w-full"
          />
        </div>
        <div>
          <label className="label">Powerplay overs</label>
          <input
            type="number"
            min={0}
            max={state.overs}
            value={state.powerplayOvers}
            onChange={(e) =>
              dispatch({
                type: 'SET_POWERPLAY',
                powerplayOvers: parseInt(e.target.value) || 0,
              })
            }
            disabled={state.format === 'test'}
            aria-label="Powerplay overs"
            className="input w-full"
          />
        </div>
      </div>

      <div>
        <label className="label">Ball type</label>
        <div className="flex flex-wrap gap-2">
          {BALL_TYPES.map((b) => (
            <Pill
              key={b.value}
              selected={state.ballType === b.value}
              onClick={() => dispatch({ type: 'SET_BALL_TYPE', ballType: b.value })}
              ariaLabel={`Ball type: ${b.label}`}
            >
              {b.label}
            </Pill>
          ))}
        </div>
      </div>
    </div>
  );
}

function StepTeams({
  state,
  dispatch,
  teams,
}: {
  state: WizardState;
  dispatch: React.Dispatch<WizardAction>;
  teams: Team[];
}) {
  return (
    <div>
      <h3 className="text-lg font-bold mb-1">Teams</h3>
      <p className="text-theme-tertiary text-sm mb-5">
        Search existing teams or type a new name. Playing XI is optional.
      </p>

      <div className="space-y-5">
        <SectionCard>
          <label className="label">Team A (Home)</label>
          <TeamSearchInput
            value={state.teamAName}
            onChange={(name) => dispatch({ type: 'SET_TEAM_A_NAME', name })}
            onSelectTeam={(t) => dispatch({ type: 'SET_TEAM_A_ID', id: t?.id ?? null })}
            teams={teams}
            placeholder="Search or create team..."
            ariaLabel="Team A name"
          />
          <PlayingXIEditor
            players={state.teamAPlayers}
            onChange={(players) => dispatch({ type: 'SET_TEAM_A_PLAYERS', players })}
            teamLabel="Team A"
          />
        </SectionCard>

        <SectionCard>
          <label className="label">Team B (Away)</label>
          <TeamSearchInput
            value={state.teamBName}
            onChange={(name) => dispatch({ type: 'SET_TEAM_B_NAME', name })}
            onSelectTeam={(t) => dispatch({ type: 'SET_TEAM_B_ID', id: t?.id ?? null })}
            teams={teams}
            placeholder="Search or create team..."
            ariaLabel="Team B name"
          />
          <PlayingXIEditor
            players={state.teamBPlayers}
            onChange={(players) => dispatch({ type: 'SET_TEAM_B_PLAYERS', players })}
            teamLabel="Team B"
          />
        </SectionCard>
      </div>
    </div>
  );
}

function StepToss({
  state,
  dispatch,
}: {
  state: WizardState;
  dispatch: React.Dispatch<WizardAction>;
}) {
  const teamALabel = state.teamAName || 'Team A';
  const teamBLabel = state.teamBName || 'Team B';

  return (
    <div>
      <h3 className="text-lg font-bold mb-1">Toss</h3>
      <p className="text-theme-tertiary text-sm mb-5">Who won the toss?</p>

      <div className="mb-6">
        <label className="label">Toss winner</label>
        <div className="flex gap-3">
          {([['A', teamALabel], ['B', teamBLabel]] as const).map(([val, label]) => (
            <button
              key={val}
              type="button"
              onClick={() => dispatch({ type: 'SET_TOSS_WINNER', winner: val })}
              aria-label={`Toss winner: ${label}`}
              aria-pressed={state.tossWinner === val}
              className={`flex-1 py-3 rounded-xl font-semibold text-sm transition-all duration-200 ${
                state.tossWinner === val
                  ? 'bg-cricket-green/15 text-cricket-green border border-cricket-green/30'
                  : 'surface-interactive'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {state.tossWinner && (
        <div className="animate-fade-in">
          <label className="label">Chose to</label>
          <div className="flex gap-3">
            {(['bat', 'bowl'] as const).map((choice) => (
              <button
                key={choice}
                type="button"
                onClick={() => dispatch({ type: 'SET_TOSS_CHOICE', choice })}
                aria-label={`Toss choice: ${choice}`}
                aria-pressed={state.tossChoice === choice}
                className={`flex-1 py-3 rounded-xl font-semibold text-sm capitalize transition-all duration-200 ${
                  state.tossChoice === choice
                    ? 'bg-cricket-green/15 text-cricket-green border border-cricket-green/30'
                    : 'surface-interactive'
                }`}
              >
                {choice}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function StepVenue({
  state,
  dispatch,
}: {
  state: WizardState;
  dispatch: React.Dispatch<WizardAction>;
}) {
  return (
    <div>
      <h3 className="text-lg font-bold mb-1">Venue</h3>
      <p className="text-theme-tertiary text-sm mb-5">All fields are optional</p>

      <div className="space-y-4">
        <div>
          <label className="label">Ground name</label>
          <input
            type="text"
            value={state.venue}
            onChange={(e) => dispatch({ type: 'SET_VENUE', venue: e.target.value })}
            placeholder="e.g., Wankhede Stadium"
            aria-label="Ground name"
            className="input w-full"
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">City</label>
            <input
              type="text"
              value={state.city}
              onChange={(e) => dispatch({ type: 'SET_CITY', city: e.target.value })}
              placeholder="e.g., Mumbai"
              aria-label="City"
              className="input w-full"
            />
          </div>
          <div>
            <label className="label">Country</label>
            <input
              type="text"
              value={state.country}
              onChange={(e) => dispatch({ type: 'SET_COUNTRY', country: e.target.value })}
              placeholder="e.g., India"
              aria-label="Country"
              className="input w-full"
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function StepReview({ state }: { state: WizardState }) {
  const fmt = FORMATS.find((f) => f.value === state.format);
  const ball = BALL_TYPES.find((b) => b.value === state.ballType);
  const teamALabel = state.teamAName || 'Team A';
  const teamBLabel = state.teamBName || 'Team B';

  const rows: [string, string][] = [
    ['Format', fmt?.label ?? state.format],
    ['Overs', state.format === 'test' ? 'Unlimited' : String(state.overs)],
    ['Ball type', ball?.label ?? state.ballType],
    ['Powerplay', String(state.powerplayOvers)],
    ['Home team', teamALabel],
    ['Away team', teamBLabel],
  ];

  if (state.tossWinner) {
    rows.push([
      'Toss',
      `${state.tossWinner === 'A' ? teamALabel : teamBLabel} won, chose to ${state.tossChoice ?? '...'}`,
    ]);
  }

  if (state.venue) rows.push(['Venue', state.venue]);
  if (state.city) rows.push(['City', state.city]);
  if (state.country) rows.push(['Country', state.country]);

  return (
    <div>
      <h3 className="text-lg font-bold mb-1">Review</h3>
      <p className="text-theme-tertiary text-sm mb-5">Confirm your match setup</p>

      <SectionCard>
        <dl className="divide-y divide-white/[0.06]">
          {rows.map(([label, value]) => (
            <div key={label} className="flex justify-between py-2.5 first:pt-0 last:pb-0">
              <dt className="text-theme-tertiary text-sm">{label}</dt>
              <dd className="text-theme-secondary text-sm font-medium">{value}</dd>
            </div>
          ))}
        </dl>
      </SectionCard>

      {(state.teamAPlayers.filter(Boolean).length > 0 ||
        state.teamBPlayers.filter(Boolean).length > 0) && (
        <div className="mt-4 grid grid-cols-2 gap-3">
          {[
            { label: teamALabel, players: state.teamAPlayers },
            { label: teamBLabel, players: state.teamBPlayers },
          ].map(
            ({ label, players }) =>
              players.filter(Boolean).length > 0 && (
                <SectionCard key={label}>
                  <h4 className="text-xs font-semibold text-theme-tertiary mb-2">
                    {label} XI
                  </h4>
                  <ol className="space-y-1">
                    {players.filter(Boolean).map((p, i) => (
                      <li key={i} className="text-sm text-theme-secondary">
                        {i + 1}. {p}
                      </li>
                    ))}
                  </ol>
                </SectionCard>
              ),
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main Page ──────────────────────────────────────────────────────────────

export function CreateMatchPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // Quick Match state
  const [qTeamA, setQTeamA] = useState('Team A');
  const [qTeamB, setQTeamB] = useState('Team B');
  const [qOvers, setQOvers] = useState(20);
  const [qCustomOvers, setQCustomOvers] = useState('');
  const [qIsCustomOvers, setQIsCustomOvers] = useState(false);
  const [qBallType, setQBallType] = useState('tennis');

  // Wizard state
  const [showWizard, setShowWizard] = useState(false);
  const [wizardStep, setWizardStep] = useState(0);
  const [slideDirection, setSlideDirection] = useState<'left' | 'right'>('right');
  const [isAnimating, setIsAnimating] = useState(false);
  const [wizardState, dispatch] = useReducer(wizardReducer, initialWizardState);

  // Fetch existing teams for wizard
  const teamsQuery = useQuery({
    queryKey: ['teams'],
    queryFn: api.getTeams,
    enabled: showWizard,
  });

  // Quick Match mutation
  const quickMutation = useMutation({
    mutationFn: async () => {
      const teamA = await api.createTeam({ name: qTeamA || 'Team A', teamType: 'club' });
      const teamB = await api.createTeam({ name: qTeamB || 'Team B', teamType: 'club' });

      const effectiveOvers = qIsCustomOvers ? parseInt(qCustomOvers) || 20 : qOvers;
      const formatId = effectiveOvers <= 10 ? 't10' : effectiveOvers <= 20 ? 't20' : 'odi';

      const input: CreateMatchInput = {
        formatConfigId: formatId,
        homeTeamId: teamA.id,
        awayTeamId: teamB.id,
        homePlayingXi: [],
        awayPlayingXi: [],
      };

      return api.createMatch(input);
    },
    onSuccess: (match) => {
      queryClient.invalidateQueries({ queryKey: ['matches'] });
      navigate(`/matches/${match.id}/score`);
    },
  });

  // Wizard mutation
  const wizardMutation = useMutation({
    mutationFn: async () => {
      let homeTeamId = wizardState.teamAId;
      let awayTeamId = wizardState.teamBId;

      if (!homeTeamId) {
        const teamA = await api.createTeam({
          name: wizardState.teamAName || 'Team A',
          teamType: 'club',
        });
        homeTeamId = teamA.id;
      }

      if (!awayTeamId) {
        const teamB = await api.createTeam({
          name: wizardState.teamBName || 'Team B',
          teamType: 'club',
        });
        awayTeamId = teamB.id;
      }

      const input: CreateMatchInput = {
        formatConfigId: wizardState.format,
        venue: wizardState.venue || undefined,
        city: wizardState.city || undefined,
        homeTeamId,
        awayTeamId,
        homePlayingXi: wizardState.teamAPlayers.filter(Boolean),
        awayPlayingXi: wizardState.teamBPlayers.filter(Boolean),
      };

      return api.createMatch(input);
    },
    onSuccess: (match) => {
      queryClient.invalidateQueries({ queryKey: ['matches'] });
      navigate(`/matches/${match.id}/score`);
    },
  });

  // Step navigation with animation
  const goToStep = (target: number) => {
    if (target === wizardStep || isAnimating) return;
    setSlideDirection(target > wizardStep ? 'right' : 'left');
    setIsAnimating(true);
    setTimeout(() => {
      setWizardStep(target);
      setIsAnimating(false);
    }, 150);
  };

  const nextStep = () => {
    if (wizardStep < WIZARD_STEPS.length - 1) goToStep(wizardStep + 1);
  };

  const prevStep = () => {
    if (wizardStep > 0) goToStep(wizardStep - 1);
  };

  // Determine animation CSS
  const stepAnimClass = isAnimating
    ? slideDirection === 'right'
      ? 'translate-x-8 opacity-0'
      : '-translate-x-8 opacity-0'
    : 'translate-x-0 opacity-100';

  // Render wizard step content
  const renderWizardStep = () => {
    switch (wizardStep) {
      case 0:
        return <StepFormat state={wizardState} dispatch={dispatch} />;
      case 1:
        return (
          <StepTeams
            state={wizardState}
            dispatch={dispatch}
            teams={teamsQuery.data ?? []}
          />
        );
      case 2:
        return <StepToss state={wizardState} dispatch={dispatch} />;
      case 3:
        return <StepVenue state={wizardState} dispatch={dispatch} />;
      case 4:
        return <StepReview state={wizardState} />;
      default:
        return null;
    }
  };

  const isLastStep = wizardStep === WIZARD_STEPS.length - 1;

  return (
    <div className="max-w-lg mx-auto animate-fade-in pb-12">
      {/* Page header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight">Create Match</h1>
        <p className="text-theme-tertiary text-sm mt-1">
          Start scoring in seconds or set up a full match
        </p>
      </div>

      {/* ────────────────────── Quick Match ────────────────────── */}
      <SectionCard className="mb-6 border-cricket-green/20 bg-cricket-green/[0.02]">
        <div className="flex items-center gap-2 mb-4">
          <div className="w-2 h-2 rounded-full bg-cricket-green animate-pulse" />
          <h2 className="text-base font-bold">Quick Match</h2>
          <span className="text-[10px] text-theme-muted font-medium ml-auto">
            Start in &lt; 30s
          </span>
        </div>

        {/* Team names */}
        <div className="flex items-center gap-3 mb-4">
          <div className="flex-1">
            <input
              type="text"
              value={qTeamA}
              onChange={(e) => setQTeamA(e.target.value)}
              placeholder="Team A"
              aria-label="Quick match home team name"
              className="input text-center w-full font-semibold"
            />
          </div>
          <span className="text-theme-muted font-bold text-xs tracking-widest shrink-0">VS</span>
          <div className="flex-1">
            <input
              type="text"
              value={qTeamB}
              onChange={(e) => setQTeamB(e.target.value)}
              placeholder="Team B"
              aria-label="Quick match away team name"
              className="input text-center w-full font-semibold"
            />
          </div>
        </div>

        {/* Overs selector */}
        <div className="mb-4">
          <label className="label">Overs</label>
          <div className="flex flex-wrap gap-2">
            {QUICK_OVERS.map((o) => (
              <Pill
                key={o}
                selected={!qIsCustomOvers && qOvers === o}
                onClick={() => {
                  setQOvers(o);
                  setQIsCustomOvers(false);
                }}
                ariaLabel={`${o} overs`}
              >
                {o}
              </Pill>
            ))}
            <input
              type="number"
              min={1}
              max={100}
              value={qIsCustomOvers ? qCustomOvers : ''}
              placeholder="Other"
              onChange={(e) => {
                setQCustomOvers(e.target.value);
                setQIsCustomOvers(true);
              }}
              onFocus={() => setQIsCustomOvers(true)}
              aria-label="Custom overs"
              className="input w-20 text-center text-sm py-2"
            />
          </div>
        </div>

        {/* Ball type */}
        <div className="mb-5">
          <label className="label">Ball type</label>
          <div className="flex flex-wrap gap-2">
            {BALL_TYPES.filter((b) =>
              (QUICK_BALL_TYPES as readonly string[]).includes(b.value),
            ).map((b) => (
              <Pill
                key={b.value}
                selected={qBallType === b.value}
                onClick={() => setQBallType(b.value)}
                ariaLabel={`Ball type: ${b.label}`}
              >
                {b.label}
              </Pill>
            ))}
          </div>
        </div>

        {/* Start Scoring button */}
        <button
          type="button"
          onClick={() => quickMutation.mutate()}
          disabled={quickMutation.isPending}
          aria-label="Start scoring quick match"
          className="btn-primary w-full text-base font-bold bg-cricket-green hover:bg-cricket-green/90 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {quickMutation.isPending ? (
            <span className="flex items-center justify-center gap-2">
              <Spinner />
              Starting...
            </span>
          ) : (
            'Start Scoring'
          )}
        </button>

        {quickMutation.isError && (
          <ErrorBanner message={(quickMutation.error as Error).message} />
        )}
      </SectionCard>

      {/* ────────────────────── Wizard Toggle ────────────────────── */}
      {!showWizard ? (
        <div className="text-center">
          <button
            type="button"
            onClick={() => setShowWizard(true)}
            aria-label="Set up a proper match with wizard"
            className="text-sm text-cricket-green hover:text-cricket-green/80 font-medium transition-colors inline-flex items-center gap-1.5"
          >
            <svg
              className="w-4 h-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
              aria-hidden="true"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m6-6H6" />
            </svg>
            Set up a proper match
          </button>
        </div>
      ) : (
        /* ────────────────────── Full Wizard ────────────────────── */
        <div className="animate-fade-in">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-base font-bold">Full Match Setup</h2>
            <button
              type="button"
              onClick={() => setShowWizard(false)}
              aria-label="Close wizard"
              className="text-theme-muted hover:text-theme-secondary text-xs transition-colors"
            >
              Close
            </button>
          </div>

          <SectionCard>
            {/* Step indicator */}
            <StepIndicator
              steps={WIZARD_STEPS}
              currentStep={wizardStep}
              onStepClick={goToStep}
            />

            {/* Step content with slide transition */}
            <div className="overflow-hidden">
              <div
                className={`transform transition-all duration-150 ease-in-out ${stepAnimClass}`}
              >
                {renderWizardStep()}
              </div>
            </div>

            {/* Navigation buttons */}
            <div className="flex items-center justify-between mt-8 pt-5 border-t border-white/[0.06]">
              <button
                type="button"
                onClick={prevStep}
                disabled={wizardStep === 0}
                aria-label="Previous step"
                className="btn-outline text-sm disabled:opacity-30 disabled:cursor-not-allowed"
              >
                Back
              </button>

              {isLastStep ? (
                <button
                  type="button"
                  onClick={() => wizardMutation.mutate()}
                  disabled={wizardMutation.isPending}
                  aria-label="Start match"
                  className="btn-primary text-sm font-bold bg-cricket-green hover:bg-cricket-green/90 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {wizardMutation.isPending ? (
                    <span className="flex items-center justify-center gap-2">
                      <Spinner />
                      Creating...
                    </span>
                  ) : (
                    'Start Match'
                  )}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={nextStep}
                  aria-label="Next step"
                  className="btn-primary text-sm"
                >
                  Next
                </button>
              )}
            </div>

            {wizardMutation.isError && (
              <ErrorBanner message={(wizardMutation.error as Error).message} />
            )}
          </SectionCard>
        </div>
      )}
    </div>
  );
}
