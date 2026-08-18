import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import App from './App';

/**
 * Every screen is stubbed. The point of this suite is the routing table and the provider
 * nesting — which path renders which screen, which paths sit behind the doctor guard, and
 * that the lazy clinician/admin chunks are suspended rather than eagerly bundled. The
 * screens' own behaviour is covered by their own suites.
 */
vi.mock('./screens/PhoneEntry', () => ({ default: () => <p>PhoneEntry</p> }));
vi.mock('./screens/QuestionnaireForm', () => ({ default: () => <p>QuestionnaireForm</p> }));
vi.mock('./screens/PhotoUpload', () => ({ default: () => <p>PhotoUpload</p> }));
vi.mock('./screens/AssessmentPending', () => ({ default: () => <p>AssessmentPending</p> }));
vi.mock('./screens/PatientProfile', () => ({ default: () => <p>PatientProfile</p> }));
vi.mock('./screens/PastAssessments', () => ({ default: () => <p>PastAssessments</p> }));
vi.mock('./screens/PastAssessmentDetail', () => ({ default: () => <p>PastAssessmentDetail</p> }));
vi.mock('./screens/doctor/DoctorLogin', () => ({ default: () => <p>DoctorLogin</p> }));
vi.mock('./screens/doctor/DoctorQueue', () => ({ default: () => <p>DoctorQueue</p> }));
vi.mock('./screens/doctor/DoctorCase', () => ({ default: () => <p>DoctorCase</p> }));
vi.mock('./screens/admin/AdminDashboard', () => ({ default: () => <p>AdminDashboard</p> }));

// The guard's own behaviour is covered in DoctorRoute.test.jsx; here it just has to be
// distinguishable from an unguarded route.
vi.mock('./components/doctor/DoctorRoute', async () => {
  const { Outlet } = await import('react-router-dom');
  return {
    default: () => (
      <>
        <span data-testid="doctor-guard" />
        <Outlet />
      </>
    ),
  };
});

vi.mock('./config/firebase', () => ({
  firebaseSignOut: vi.fn(),
  getFirebaseToken: vi.fn().mockResolvedValue(null),
}));

function renderAt(path) {
  window.history.pushState({}, '', path);
  return render(<App />);
}

describe('the patient routes', () => {
  it.each([
    ['/', 'PhoneEntry'],
    ['/questionnaire', 'QuestionnaireForm'],
    ['/questionnaire/q1', 'QuestionnaireForm'],
    ['/questionnaire/q1/photos', 'PhotoUpload'],
    ['/questionnaire/q1/assessment', 'AssessmentPending'],
    ['/profile', 'PatientProfile'],
    ['/assessments', 'PastAssessments'],
    ['/assessments/a1', 'PastAssessmentDetail'],
  ])('renders %s as %s', async (path, screenName) => {
    renderAt(path);

    expect(await screen.findByText(screenName)).toBeInTheDocument();
  });

  it('puts none of them behind the doctor guard', async () => {
    renderAt('/assessments');

    await screen.findByText('PastAssessments');
    expect(screen.queryByTestId('doctor-guard')).not.toBeInTheDocument();
  });
});

describe('the clinician and admin routes', () => {
  it.each([
    ['/doctor/login', 'DoctorLogin'],
    ['/doctor/admin', 'AdminDashboard'],
  ])('renders %s as %s without the guard', async (path, screenName) => {
    renderAt(path);

    expect(await screen.findByText(screenName)).toBeInTheDocument();
    expect(screen.queryByTestId('doctor-guard')).not.toBeInTheDocument();
  });

  it.each([
    ['/doctor', 'DoctorQueue'],
    ['/doctor/case/a1', 'DoctorCase'],
  ])('puts %s behind the doctor guard', async (path, screenName) => {
    renderAt(path);

    expect(await screen.findByText(screenName)).toBeInTheDocument();
    expect(screen.getByTestId('doctor-guard')).toBeInTheDocument();
  });
});

/**
 * Code splitting is asserted against the source rather than at runtime: Vitest resolves
 * every mocked module up front, so React.lazy's promise is already settled on the first
 * render and a suspended chunk is indistinguishable from an eager one in jsdom. The
 * guarantee lives in how the module is imported, so that is what gets checked.
 */
describe('code splitting', () => {
  const source = readFileSync(resolve(process.cwd(), 'src/App.jsx'), 'utf8');

  it.each(['DoctorLogin', 'DoctorQueue', 'DoctorCase', 'AdminDashboard'])(
    'loads %s lazily so it stays out of the patient bundle',
    (screenName) => {
      // The admin dashboard alone pulls in ~180 KB of chart.js, which every patient would
      // otherwise download before reaching the phone-entry screen.
      expect(source).toMatch(
        new RegExp(`const ${screenName} = lazy\\(\\(\\) => import\\(`)
      );
    }
  );

  it.each(['PhoneEntry', 'QuestionnaireForm', 'PhotoUpload', 'AssessmentPending'])(
    'imports %s eagerly — it is on the patient critical path',
    (screenName) => {
      expect(source).toMatch(new RegExp(`^import ${screenName} from`, 'm'));
    }
  );

  it('wraps the routes in a Suspense fallback for the lazy chunks', () => {
    renderAt('/');

    expect(source).toContain('<Suspense fallback=');
    expect(screen.getByText('PhoneEntry')).toBeInTheDocument();
  });
});
