import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { User, UserRound, History, LogOut, PlusCircle } from 'lucide-react';
import { usePatient } from '../../context/PatientContext';
import './AccountMenu.css';

export default function AccountMenu() {
  const navigate = useNavigate();
  const { clearPatient } = usePatient();
  const [open, setOpen] = useState(false);
  const containerRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    function handleOutsideClick(event) {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setOpen(false);
      }
    }
    function handleEscape(event) {
      if (event.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', handleOutsideClick);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [open]);

  function go(path) {
    setOpen(false);
    navigate(path);
  }

  function handleLogout() {
    setOpen(false);
    clearPatient();
    navigate('/', { replace: true });
  }

  return (
    <div className="account-menu" ref={containerRef}>
      <button
        type="button"
        className="account-menu__trigger"
        onClick={() => setOpen((prev) => !prev)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Account menu"
        title="Account"
      >
        <User size={18} />
      </button>

      {open && (
        <div className="account-menu__dropdown" role="menu">
          <button type="button" role="menuitem" className="account-menu__item" onClick={() => go('/questionnaire')}>
            <PlusCircle size={16} />
            <span>New assessment</span>
          </button>
          <div className="account-menu__divider" />
          <button type="button" role="menuitem" className="account-menu__item" onClick={() => go('/profile')}>
            <UserRound size={16} />
            <span>Profile</span>
          </button>
          <button type="button" role="menuitem" className="account-menu__item" onClick={() => go('/assessments')}>
            <History size={16} />
            <span>Past Assessments</span>
          </button>
          <div className="account-menu__divider" />
          <button type="button" role="menuitem" className="account-menu__item account-menu__item--danger" onClick={handleLogout}>
            <LogOut size={16} />
            <span>Log out</span>
          </button>
        </div>
      )}
    </div>
  );
}
