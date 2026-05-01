import { NavLink, Route, Routes } from 'react-router-dom';
import HomePage from './pages/HomePage.jsx';
import LocalHealthPage from './pages/LocalHealthPage.jsx';
import DevicesPage from './pages/DevicesPage.jsx';

export default function App() {
  return (
    <>
      <nav>
        <NavLink to="/">Home</NavLink>
        <NavLink to="/local-health">Local health</NavLink>
        <NavLink to="/devices">Devices</NavLink>
      </nav>
      <main>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/local-health" element={<LocalHealthPage />} />
          <Route path="/devices" element={<DevicesPage />} />
        </Routes>
      </main>
    </>
  );
}
