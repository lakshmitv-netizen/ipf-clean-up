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
import SetupSalesforceGoPage from './pages/SetupSalesforceGoPage';
import CpmFeatureSetPage from './pages/CpmFeatureSetPage';
import CpmFeaturePage from './pages/CpmFeaturePage';
import DpeDefinitionPage from './pages/DpeDefinitionPage';
import PlanConfigurationListPage from './pages/PlanConfigurationListPage';
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
        <Router basename={import.meta.env.BASE_URL}>
          <IndustryUrlSync />
          <Routes>
            <Route path="/home" element={<HomePage />} />
            <Route path="/home/manufacturing" element={<GridPage />} />
            <Route path="/home/consumergoods" element={<GridPage />} />
            <Route path="/home/grid-264" element={<GridPage />} />
            <Route path="/planning-forecasting-list" element={<PlanningForecastingListPage />} />
            <Route path="/planning-forecasting" element={<PlanningForecastingPage />} />
            <Route path="/setup/salesforce-go" element={<SetupSalesforceGoPage />} />
            <Route path="/setup/cpm-feature-set" element={<CpmFeatureSetPage />} />
            <Route path="/setup/cpm-feature-page" element={<CpmFeaturePage />} />
            <Route path="/setup/dpe-definition" element={<DpeDefinitionPage />} />
            <Route path="/setup/plan-configuration-list" element={<PlanConfigurationListPage />} />
            <Route path="/grid" element={<GridPage />} />
            <Route path="/" element={<Navigate to="/home/grid-264" replace />} />
            <Route path="/home" element={<Navigate to="/home/grid-264" replace />} />
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

