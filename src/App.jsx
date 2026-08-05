import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { PatientProvider } from './context/PatientContext';
import PhoneEntry from './screens/PhoneEntry';
import QuestionnaireForm from './screens/QuestionnaireForm';
import PhotoUpload from './screens/PhotoUpload';
import AssessmentPending from './screens/AssessmentPending';
import PatientProfile from './screens/PatientProfile';
import PastAssessments from './screens/PastAssessments';
import PastAssessmentDetail from './screens/PastAssessmentDetail';
import DoctorRoute from './components/doctor/DoctorRoute';
import { DoctorSessionProvider } from './context/DoctorSessionContext';
import LoadingState from './components/shared/LoadingState';
import { ToastProvider } from './components/shared/Toast';

// Clinician and admin screens are split out of the patient bundle. The admin
// dashboard alone pulls in chart.js + react-chartjs-2 (~180 KB), which every
// patient was downloading before reaching the phone-entry screen.
const DoctorLogin = lazy(() => import('./screens/doctor/DoctorLogin'));
const DoctorQueue = lazy(() => import('./screens/doctor/DoctorQueue'));
const DoctorCase = lazy(() => import('./screens/doctor/DoctorCase'));
const AdminDashboard = lazy(() => import('./screens/admin/AdminDashboard'));

export default function App() {
  return (
    <PatientProvider>
      <DoctorSessionProvider>
        <ToastProvider>
          <BrowserRouter>
            <Suspense fallback={<LoadingState message="Loading…" />}>
              <Routes>
                <Route path="/" element={<PhoneEntry />} />
                <Route path="/questionnaire" element={<QuestionnaireForm />} />
                <Route path="/questionnaire/:questionnaireId" element={<QuestionnaireForm />} />
                <Route path="/questionnaire/:questionnaireId/photos" element={<PhotoUpload />} />
                <Route path="/questionnaire/:questionnaireId/assessment" element={<AssessmentPending />} />
                <Route path="/profile" element={<PatientProfile />} />
                <Route path="/assessments" element={<PastAssessments />} />
                <Route path="/assessments/:assessmentId" element={<PastAssessmentDetail />} />
                <Route path="/doctor/admin" element={<AdminDashboard />} />
                <Route path="/doctor/login" element={<DoctorLogin />} />
                <Route element={<DoctorRoute />}>
                  <Route path="/doctor" element={<DoctorQueue />} />
                  <Route path="/doctor/case/:assessmentId" element={<DoctorCase />} />
                </Route>
              </Routes>
            </Suspense>
          </BrowserRouter>
        </ToastProvider>
      </DoctorSessionProvider>
    </PatientProvider>
  );
}
