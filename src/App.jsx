import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { PatientProvider } from './context/PatientContext';
import PhoneEntry from './screens/PhoneEntry';
import QuestionnaireForm from './screens/QuestionnaireForm';
import PhotoUpload from './screens/PhotoUpload';
import AssessmentPending from './screens/AssessmentPending';
import DoctorRoute from './components/doctor/DoctorRoute';
import { DoctorSessionProvider } from './context/DoctorSessionContext';
import DoctorLogin from './screens/doctor/DoctorLogin';
import DoctorQueue from './screens/doctor/DoctorQueue';
import DoctorCase from './screens/doctor/DoctorCase';

export default function App() {
  return (
    <PatientProvider>
      <DoctorSessionProvider>
        <BrowserRouter>
        <Routes>
          <Route path="/" element={<PhoneEntry />} />
          <Route path="/questionnaire" element={<QuestionnaireForm />} />
          <Route path="/questionnaire/:questionnaireId" element={<QuestionnaireForm />} />
          <Route path="/questionnaire/:questionnaireId/photos" element={<PhotoUpload />} />
          <Route path="/questionnaire/:questionnaireId/assessment" element={<AssessmentPending />} />
          <Route path="/doctor/login" element={<DoctorLogin />} />
          <Route element={<DoctorRoute />}>
            <Route path="/doctor" element={<DoctorQueue />} />
            <Route path="/doctor/case/:assessmentId" element={<DoctorCase />} />
          </Route>
        </Routes>
        </BrowserRouter>
      </DoctorSessionProvider>
    </PatientProvider>
  );
}
