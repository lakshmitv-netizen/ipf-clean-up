import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { IndustryProvider } from './contexts/IndustryContext';
import { PlanWorkflowProvider } from './contexts/PlanWorkflowContext';
import { UserProvider } from './contexts/UserContext';
import { NotificationsProvider } from './contexts/NotificationsContext';
import { PlanningGridSessionProvider } from './contexts/PlanningGridSessionContext';
import Header from './components/Header';
import ForecastingGrid from './components/ForecastingGrid';
import PlanningForecastingPage from './pages/PlanningForecastingPage';
import PlanningForecastingListPage from './pages/PlanningForecastingListPage';
import HomePage from './pages/HomePage';
import IndustryUrlSync from './components/IndustryUrlSync';
import ErrorBoundary from './components/ErrorBoundary';
import './styles/App.css';

// Grid wrapper component for consistent layout
const GridPage: React.FC = () => (
  <div className="app">
    <Header />
    <div className="main-content">
      <ErrorBoundary>
        <ForecastingGrid />
      </ErrorBoundary>
    </div>
  </div>
);

function App() {
  console.log('App component rendering');
  return (
    <UserProvider>
      <NotificationsProvider>
      <IndustryProvider>
        <PlanningGridSessionProvider>
        <PlanWorkflowProvider>
        <Router>
          <IndustryUrlSync />
          <Routes>
            <Route path="/home" element={<HomePage />} />
            <Route path="/home/manufacturing" element={<GridPage />} />
            <Route path="/home/consumergoods" element={<GridPage />} />
            <Route path="/home/grid-264" element={<GridPage />} />
            <Route path="/planning-forecasting-list" element={<PlanningForecastingListPage />} />
            <Route path="/planning-forecasting" element={<PlanningForecastingPage />} />
            <Route path="/grid" element={<GridPage />} />
            <Route path="/" element={<Navigate to="/home" replace />} />
          </Routes>
        </Router>
        </PlanWorkflowProvider>
        </PlanningGridSessionProvider>
      </IndustryProvider>
      </NotificationsProvider>
    </UserProvider>
  );
}

export default App;

