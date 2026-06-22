import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import {
  LivePredictionChart,
  rateGaugePct,
  pressureLevel,
} from './LivePredictionChart';

vi.mock('framer-motion', async () => {
  const actual = await vi.importActual<typeof import('framer-motion')>('framer-motion');
  return {
    ...actual,
    useReducedMotion: () => false,
    AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    motion: {
      div: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
        <div {...props}>{children}</div>
      ),
      span: ({ children, ...props }: React.HTMLAttributes<HTMLSpanElement>) => (
        <span {...props}>{children}</span>
      ),
    },
  };
});

describe('LivePredictionChart helpers', () => {
  it('rateGaugePct clamps between 0 and 100', () => {
    expect(rateGaugePct(10, 20)).toBe(50);
    expect(rateGaugePct(-5, 20)).toBe(0);
    expect(rateGaugePct(30, 20)).toBe(100);
  });

  it('pressureLevel classifies chase situations', () => {
    expect(pressureLevel(8, 6)).toBe('ahead');
    expect(pressureLevel(8, 8)).toBe('close');
    expect(pressureLevel(8, 10)).toBe('pressure');
    expect(pressureLevel(8, 14)).toBe('critical');
  });
});

describe('LivePredictionChart', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const defaultProps = {
    team1: { name: 'Team A', probability: 40 },
    team2: { name: 'Team B', probability: 60 },
  };

  it('renders win probability for both teams', () => {
    render(<LivePredictionChart {...defaultProps} />);
    expect(screen.getByText('Team A')).toBeInTheDocument();
    expect(screen.getByText('Team B')).toBeInTheDocument();
    expect(screen.getByText('40.0%')).toBeInTheDocument();
    expect(screen.getByText('60.0%')).toBeInTheDocument();
  });

  it('renders required run rate gauge when rates provided', () => {
    render(
      <LivePredictionChart
        {...defaultProps}
        currentRunRate={7.5}
        requiredRunRate={10.2}
      />,
    );
    expect(screen.getByText('Run Rate Gauge')).toBeInTheDocument();
    expect(screen.getByText('CRR 7.50')).toBeInTheDocument();
    expect(screen.getByText('RRR 10.20')).toBeInTheDocument();
    expect(screen.getByText('Pressure')).toBeInTheDocument();
  });

  it('shows team fifty milestone toast when score crosses 50', () => {
    const { rerender } = render(
      <LivePredictionChart {...defaultProps} currentScore={45} />,
    );
    expect(screen.queryByText('Team fifty!')).not.toBeInTheDocument();

    rerender(<LivePredictionChart {...defaultProps} currentScore={52} />);
    expect(screen.getByText('Team fifty!')).toBeInTheDocument();
  });

  it('shows team century milestone toast when score crosses 100', () => {
    const { rerender } = render(
      <LivePredictionChart {...defaultProps} currentScore={95} />,
    );
    rerender(<LivePredictionChart {...defaultProps} currentScore={101} />);
    expect(screen.getByText('Team century!')).toBeInTheDocument();
  });

  it('shows chase pressure toast when RRR exceeds CRR', () => {
    render(
      <LivePredictionChart
        {...defaultProps}
        currentScore={80}
        currentRunRate={6}
        requiredRunRate={9}
      />,
    );
    expect(screen.getByText(/Chase pressure/)).toBeInTheDocument();
  });

  it('dismisses milestone toast after timeout', () => {
    const { rerender } = render(
      <LivePredictionChart {...defaultProps} currentScore={48} />,
    );
    rerender(<LivePredictionChart {...defaultProps} currentScore={52} />);
    expect(screen.getByText('Team fifty!')).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(4000);
    });

    rerender(<LivePredictionChart {...defaultProps} currentScore={52} />);
    expect(screen.queryByText('Team fifty!')).not.toBeInTheDocument();
  });

  it('respects reduceMotion prop', () => {
    render(
      <LivePredictionChart
        {...defaultProps}
        reduceMotion
        currentRunRate={8}
        requiredRunRate={8}
      />,
    );
    expect(screen.getByText('On track')).toBeInTheDocument();
  });
});
