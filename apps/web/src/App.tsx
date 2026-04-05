import { Routes, Route } from 'react-router-dom';
import { Layout } from './components/Layout';
import { HomePage } from './pages/HomePage';
import { ScoringPage } from './pages/ScoringPage';
import { ScorecardPage } from './pages/ScorecardPage';
import { CreateMatchPage } from './pages/CreateMatchPage';

export function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<HomePage />} />
        <Route path="/matches/new" element={<CreateMatchPage />} />
        <Route path="/matches/:id/score" element={<ScoringPage />} />
        <Route path="/matches/:id/scorecard" element={<ScorecardPage />} />
      </Route>
    </Routes>
  );
}
