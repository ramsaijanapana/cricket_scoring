import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MatchHeader } from './MatchHeader';
import { OverStrip } from './OverStrip';
import { ScoringPad } from './ScoringPad';
import { WicketModal } from './WicketModal';
import type { BallDisplay } from '../../stores/scoring-store';

vi.mock('framer-motion', async () => {
  const React = await import('react');
  const motion = new Proxy({}, {
    get: (_target, prop) => {
      const Tag = String(prop);
      return React.forwardRef(({ children, ...props }: any, ref: any) => {
        const { whileTap, animate, initial, exit, variants, custom, layout, transition, ...rest } = props;
        return React.createElement(Tag, { ...rest, ref }, children);
      });
    },
  });
  return {
    motion,
    AnimatePresence: ({ children }: { children: ReactNode }) => children,
  };
});

describe('MatchHeader', () => {
  it('renders score and overs', () => {
    render(
      <MatchHeader
        battingTeamName="India"
        score="120/3"
        overs="15.2"
        computedRunRate="7.83"
        isChasing={false}
        requiredRunRate={null}
        reduceMotion
      />,
    );
    expect(screen.getByText('India')).toBeInTheDocument();
    expect(screen.getByText('120/3')).toBeInTheDocument();
    expect(screen.getByText('(15.2 ov)')).toBeInTheDocument();
    expect(screen.getByText('7.83')).toBeInTheDocument();
  });

  it('shows target and need when chasing', () => {
    render(
      <MatchHeader
        battingTeamName="Australia"
        score="85/2"
        overs="10.0"
        targetScore={180}
        currentRuns={85}
        computedRunRate="8.50"
        isChasing
        requiredRunRate={9.5}
        reduceMotion
      />,
    );
    expect(screen.getByText(/Target: 180/)).toBeInTheDocument();
    expect(screen.getByText(/Need: 95/)).toBeInTheDocument();
    expect(screen.getByText('9.50')).toBeInTheDocument();
  });
});

describe('OverStrip', () => {
  it('shows ball labels and run total', () => {
    const balls: BallDisplay[] = [
      { label: '1', type: 'run' },
      { label: '4', type: 'four' },
      { label: 'W', type: 'wicket' },
    ];
    render(<OverStrip balls={balls} runs={5} reduceMotion />);
    expect(screen.getByText('This Over (3)')).toBeInTheDocument();
    expect(screen.getByText('5 runs')).toBeInTheDocument();
    expect(screen.getByText('1')).toBeInTheDocument();
    expect(screen.getByText('4')).toBeInTheDocument();
    expect(screen.getByText('W')).toBeInTheDocument();
  });

  it('shows empty state when no balls bowled', () => {
    render(<OverStrip balls={[]} runs={0} reduceMotion />);
    expect(screen.getByText('No balls yet')).toBeInTheDocument();
    expect(screen.getByText('0 runs')).toBeInTheDocument();
  });
});

describe('ScoringPad', () => {
  it('calls onRecordRuns when run button clicked', () => {
    const onRecordRuns = vi.fn();
    render(
      <ScoringPad
        extrasMode="normal"
        onExtrasModeChange={vi.fn()}
        onRecordRuns={onRecordRuns}
        onWicketClick={vi.fn()}
        isPending={false}
        pendingBowlerChange={false}
        scoringDisabled={false}
        wicketShake={false}
        reduceMotion
      />,
    );
    fireEvent.click(screen.getByLabelText('Score 4 runs'));
    expect(onRecordRuns).toHaveBeenCalledWith(4);
  });

  it('disables run buttons when scoring is blocked', () => {
    render(
      <ScoringPad
        extrasMode="normal"
        onExtrasModeChange={vi.fn()}
        onRecordRuns={vi.fn()}
        onWicketClick={vi.fn()}
        isPending={false}
        pendingBowlerChange
        scoringDisabled={false}
        wicketShake={false}
        reduceMotion
      />,
    );
    expect(screen.getByLabelText('Score 1 run')).toBeDisabled();
    expect(screen.getByLabelText('Score 4 runs')).toBeDisabled();
  });

  it('toggles extras mode via modifier buttons', () => {
    const onExtrasModeChange = vi.fn();
    render(
      <ScoringPad
        extrasMode="normal"
        onExtrasModeChange={onExtrasModeChange}
        onRecordRuns={vi.fn()}
        onWicketClick={vi.fn()}
        isPending={false}
        pendingBowlerChange={false}
        scoringDisabled={false}
        wicketShake={false}
        reduceMotion
      />,
    );
    fireEvent.click(screen.getByLabelText('Wide delivery modifier'));
    expect(onExtrasModeChange).toHaveBeenCalledWith('wide');
  });
});

describe('WicketModal', () => {
  const baseProps = {
    open: true,
    isFreeHit: false,
    wicketDismissalType: null as string | null,
    wicketRunOutRuns: 0,
    runOutDismissedId: null as string | null,
    currentStrikerId: 'p1',
    currentNonStrikerId: 'p2',
    allPlayerNames: { p1: 'Kohli', p2: 'Rohit' },
    reduceMotion: true,
    onClose: vi.fn(),
    onDismissalTypeSelect: vi.fn(),
    onDismissalTypeClear: vi.fn(),
    onRunOutDismissedIdChange: vi.fn(),
    onWicketRunOutRunsChange: vi.fn(),
    onRecordWicket: vi.fn(),
  };

  it('lists dismissal types when open', () => {
    render(<WicketModal {...baseProps} />);
    expect(screen.getByRole('dialog', { name: 'Wicket dismissal type selector' })).toBeInTheDocument();
    expect(screen.getByLabelText('Dismiss by bowled')).toBeInTheDocument();
    expect(screen.getByLabelText('Dismiss by caught')).toBeInTheDocument();
  });

  it('only shows run out on free hit', () => {
    render(<WicketModal {...baseProps} isFreeHit />);
    expect(screen.getByLabelText('Dismiss by run out')).toBeInTheDocument();
    expect(screen.queryByLabelText('Dismiss by bowled')).not.toBeInTheDocument();
  });

  it('records wicket immediately for bowled dismissal', () => {
    const onRecordWicket = vi.fn();
    render(<WicketModal {...baseProps} onRecordWicket={onRecordWicket} />);
    fireEvent.click(screen.getByLabelText('Dismiss by bowled'));
    expect(onRecordWicket).toHaveBeenCalledWith('bowled');
  });
});
