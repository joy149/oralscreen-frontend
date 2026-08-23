import { useNavigate } from 'react-router-dom';
import { useDoctorSession } from '../../context/DoctorSessionContext';
import oralscreenLogo from '../../assets/oralscreen-mark.png';
import ClinicianThemeToggle from './ClinicianThemeToggle';
import useClinicianTheme from './useClinicianTheme';
import './DoctorShell.css';

export default function DoctorShell({ children }) {
  const navigate = useNavigate();
  const { session, endSession } = useDoctorSession();
  const { theme, toggleTheme } = useClinicianTheme();

  function signOut() {
    endSession();
    navigate('/doctor/login', { replace: true });
  }

  return (
    <div className="doctor-shell">
      <header className="doctor-shell__header">
        <button className="doctor-shell__brand" type="button" onClick={() => navigate('/doctor')}>
          <img src={oralscreenLogo} alt="" className="doctor-shell__logo" />
          OralScreen <span>Clinical</span>
        </button>
        <div className="doctor-shell__account">
          <span>{session?.name}</span>
          <ClinicianThemeToggle theme={theme} onToggle={toggleTheme} />
          <button type="button" className="doctor-shell__signout" onClick={signOut}>
            Sign out
          </button>
        </div>
      </header>
      <main className="doctor-shell__main">{children}</main>
    </div>
  );
}
