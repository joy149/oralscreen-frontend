import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { PatientProvider } from './context/PatientContext';
import PhoneEntry from './screens/PhoneEntry';
import QuestionnaireForm from './screens/QuestionnaireForm';
import PhotoUpload from './screens/PhotoUpload';
import AssessmentPending from './screens/AssessmentPending';

export default function App() {
  return (
    <PatientProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<PhoneEntry />} />
          <Route path="/questionnaire" element={<QuestionnaireForm />} />
          <Route path="/questionnaire/:questionnaireId" element={<QuestionnaireForm />} />
          <Route path="/questionnaire/:questionnaireId/photos" element={<PhotoUpload />} />
          <Route path="/questionnaire/:questionnaireId/assessment" element={<AssessmentPending />} />
        </Routes>
      </BrowserRouter>
    </PatientProvider>
  );
}
