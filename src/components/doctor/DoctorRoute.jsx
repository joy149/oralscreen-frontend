import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useDoctorSession } from '../../context/DoctorSessionContext';

export default function DoctorRoute() {
  const { session } = useDoctorSession();
  const location = useLocation();

  if (!session) {
    return <Navigate to="/doctor/login" replace state={{ from: location.pathname }} />;
  }

  return <Outlet />;
}
