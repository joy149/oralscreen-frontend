import { useNavigate } from 'react-router-dom';
import { useDoctorSession } from '../../context/DoctorSessionContext';
import oralscreenLogo from '../../assets/oralscreen_icon.jpg';
import './DoctorShell.css';

export default function DoctorShell({ children }) {
  const navigate = useNavigate();
  const { session, endSession } = useDoctorSession();

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
          <button type="button" onClick={signOut}>Sign out</button>
        </div>
      </header>
      <main className="doctor-shell__main">{children}</main>
    </div>
  );
}
