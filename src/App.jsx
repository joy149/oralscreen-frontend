import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { PatientProvider } from './context/PatientContext';
import Landing from './screens/Landing';
import PhoneEntry from './screens/PhoneEntry';
import PatientHome from './screens/PatientHome';
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
                {/* `/` is the public landing page unconditionally, including for a patient
                    with a live session — it is the product's front door, and a front door
                    that shows a different product to half its visitors is two front doors.
                    It used to fork to `PatientHome` on `usePatient()`, which meant one URL
                    answered as two screens and `PatientHome` could not carry the same
                    `!patient` guard as every other patient screen. `Landing` reads the
                    session itself now, and swaps its calls to action rather than the page. */}
                <Route path="/" element={<Landing />} />
                <Route path="/home" element={<PatientHome />} />
                <Route path="/start" element={<PhoneEntry />} />
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
