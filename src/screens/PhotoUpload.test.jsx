import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import PhotoUpload from './PhotoUpload';
import { ApiError, api as apiMock } from '../api/client';
import { ToastProvider } from '../components/shared/Toast';
import { routerFuture } from '../test/utils';

const navigate = vi.fn();
const handleAuthError = vi.fn(() => false);

vi.mock('../api/client', async (importOriginal) => {
  const { mockApiModule } = await import('../test/apiMock.js');
  return mockApiModule(await importOriginal());
});

vi.mock('react-router-dom', async (importOriginal) => ({
  ...(await importOriginal()),
  useNavigate: () => navigate,
}));

vi.mock('../context/PatientContext', () => ({
  usePatient: () => ({ patient: { id: 'p1' }, setPatient: vi.fn(), clearPatient: vi.fn() }),
}));

vi.mock('../hooks/useSessionRecovery', () => ({ default: () => handleAuthError }));

function renderUpload(questionnaireId = 'q1') {
  const user = userEvent.setup();
  render(
    <MemoryRouter initialEntries={[`/questionnaire/${questionnaireId}/photos`]} future={routerFuture}>
      <ToastProvider>
        <Routes>
          <Route path="/questionnaire/:questionnaireId/photos" element={<PhotoUpload />} />
        </Routes>
      </ToastProvider>
    </MemoryRouter>
  );
  return { user };
}

function makeFile(name = 'lesion.jpg') {
  return new File(['bytes'], name, { type: 'image/jpeg' });
}

/** Picks files through the hidden gallery input. */
async function chooseFromGallery(user, ...files) {
  await user.upload(document.getElementById('photo-library-input'), files);
}

const continueButton = () => screen.getByRole('button', { name: /^Continue/ });

// The footer requirement line, the per-row "Uploading…" status and the toast layer all
// carry role="status", so target this one by its own class rather than by role.
const requirementText = () => document.querySelector('.photo-upload__requirement')?.textContent;

// The analysing screen's rotating message, likewise disambiguated.
const analysingStatus = () => document.querySelector('.assessment-loading__status')?.textContent;

beforeEach(() => {
  navigate.mockReset();
  handleAuthError.mockReturnValue(false);
  apiMock.getQuestionnaire.mockResolvedValue({});
  apiMock.uploadImage.mockResolvedValue({ id: 'img-1' });
  apiMock.resolveApiUrl.mockImplementation((url) => url);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('the initial screen', () => {
  it('explains that four angles help but one photo is enough', async () => {
    renderUpload();

    expect(screen.getByRole('heading', { level: 1, name: 'Add your photos' })).toBeInTheDocument();
    expect(screen.getByText(/One photo is enough to continue/)).toBeInTheDocument();
    await waitFor(() => expect(apiMock.getQuestionnaire).toHaveBeenCalledWith('q1'));
  });

  it('shows the four-angle checklist starting at zero', () => {
    renderUpload();

    expect(screen.getByText('0 of 4')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Capture 4 angles' })).toBeInTheDocument();
    for (const label of ['Front Teeth & Gums', 'Upper Arch', 'Lower Floor', 'Inner Cheek / Tongue']) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });

  it('shows photo-quality tips while nothing has been added', () => {
    renderUpload();

    expect(screen.getByText('Tips for accurate screening photos')).toBeInTheDocument();
  });

  it('blocks continuing and says what is required', () => {
    renderUpload();

    expect(continueButton()).toBeDisabled();
    expect(requirementText()).toBe('Capture at least one photo to continue.');
  });

  it('offers a way back to the questionnaire', async () => {
    const { user } = renderUpload();

    await user.click(screen.getByRole('button', { name: 'Back to questionnaire' }));

    expect(navigate).toHaveBeenCalledWith('/questionnaire/q1');
  });
});

describe('restoring photos already uploaded', () => {
  it.each(['images', 'imageAssets'])('reads them from the %s key', async (key) => {
    apiMock.getQuestionnaire.mockResolvedValue({
      [key]: [{ id: 'img-1', storageKey: 'q1/front.jpg', contentUrl: '/api/images/img-1/content' }],
    });

    renderUpload();

    expect(await screen.findByText('front.jpg')).toBeInTheDocument();
    expect(screen.getByText('Uploaded')).toBeInTheDocument();
  });

  it('names an upload with no storage key generically', async () => {
    apiMock.getQuestionnaire.mockResolvedValue({ images: [{ id: 'img-1' }] });

    renderUpload();

    expect(await screen.findByText('Uploaded photo')).toBeInTheDocument();
  });

  it('offers no remove button for a server-persisted photo', async () => {
    apiMock.getQuestionnaire.mockResolvedValue({ images: [{ id: 'img-1', storageKey: 'a/b.jpg' }] });

    renderUpload();

    await screen.findByText('b.jpg');
    expect(screen.queryByRole('button', { name: /Remove/ })).not.toBeInTheDocument();
  });

  it('lets a restored photo satisfy the continue requirement', async () => {
    apiMock.getQuestionnaire.mockResolvedValue({ images: [{ id: 'img-1', storageKey: 'a/b.jpg' }] });

    renderUpload();

    await screen.findByText('b.jpg');
    expect(await screen.findByRole('button', { name: 'Continue with 1 photo' })).toBeEnabled();
  });

  it('ignores a non-array images field rather than crashing', async () => {
    apiMock.getQuestionnaire.mockResolvedValue({ images: 'not-an-array' });

    renderUpload();

    await waitFor(() => expect(screen.getByText('Tips for accurate screening photos')).toBeInTheDocument());
  });

  it('still allows new uploads when the restore read fails', async () => {
    apiMock.getQuestionnaire.mockRejectedValue(new ApiError('boom', 500, null));
    const { user } = renderUpload();

    await chooseFromGallery(user, makeFile());

    expect(await screen.findByText('Uploaded')).toBeInTheDocument();
  });
});

describe('adding photos from the gallery', () => {
  it('uploads the chosen file and confirms with a toast', async () => {
    const { user } = renderUpload();

    await chooseFromGallery(user, makeFile('cheek.jpg'));

    expect(await screen.findByText('Uploaded')).toBeInTheDocument();
    expect(screen.getByText('cheek.jpg')).toBeInTheDocument();
    expect(await screen.findByText('Photo uploaded')).toBeInTheDocument();
    expect(apiMock.uploadImage).toHaveBeenCalledWith('q1', expect.any(File), expect.any(Function));
  });

  it('uploads several files one at a time', async () => {
    const { user } = renderUpload();

    await chooseFromGallery(user, makeFile('a.jpg'), makeFile('b.jpg'));

    await waitFor(() => expect(apiMock.uploadImage).toHaveBeenCalledTimes(2));
    expect(await screen.findAllByText('Uploaded')).toHaveLength(2);
  });

  it('enables continue once an upload succeeds and counts the photos', async () => {
    const { user } = renderUpload();

    await chooseFromGallery(user, makeFile());

    expect(await screen.findByRole('button', { name: 'Continue with 1 photo' })).toBeEnabled();

    await chooseFromGallery(user, makeFile('b.jpg'));
    expect(await screen.findByRole('button', { name: 'Continue with 2 photos' })).toBeEnabled();
  });

  it('holds continue while an upload is still in flight', async () => {
    let resolveUpload;
    apiMock.uploadImage.mockReturnValue(new Promise((r) => { resolveUpload = r; }));
    const { user } = renderUpload();

    await chooseFromGallery(user, makeFile());

    expect(continueButton()).toBeDisabled();
    expect(requirementText()).toBe('Waiting for uploads to finish…');

    resolveUpload({ id: 'img-1' });
    await screen.findByText('Uploaded');
  });

  it('leaves the angle checklist untouched — a gallery pick is untagged', async () => {
    const { user } = renderUpload();

    await chooseFromGallery(user, makeFile());

    await screen.findByText('Uploaded');
    expect(screen.getByText('0 of 4')).toBeInTheDocument();
  });

  it('hides the tips once there is something in the list', async () => {
    const { user } = renderUpload();

    await chooseFromGallery(user, makeFile());

    await waitFor(() =>
      expect(screen.queryByText('Tips for accurate screening photos')).not.toBeInTheDocument()
    );
  });
});

describe('when an upload fails', () => {
  beforeEach(() => {
    apiMock.uploadImage.mockRejectedValue(new ApiError('File too large', 413, null));
  });

  it('shows the server message and warns via a toast', async () => {
    const { user } = renderUpload();

    await chooseFromGallery(user, makeFile());

    expect(await screen.findByText('File too large')).toBeInTheDocument();
    expect(await screen.findByText('Photo upload failed — tap to retry')).toBeInTheDocument();
  });

  it('falls back to generic text for an error with no message', async () => {
    apiMock.uploadImage.mockRejectedValue(new Error(''));
    const { user } = renderUpload();

    await chooseFromGallery(user, makeFile());

    expect(await screen.findByText('Upload failed')).toBeInTheDocument();
  });

  it('blocks continuing until the failure is resolved', async () => {
    const { user } = renderUpload();

    await chooseFromGallery(user, makeFile());
    await screen.findByText('File too large');

    expect(continueButton()).toBeDisabled();
    expect(requirementText()).toBe('Re-upload or remove the failed photos before continuing.');
  });

  it('retries the same file on demand', async () => {
    const { user } = renderUpload();

    await chooseFromGallery(user, makeFile('a.jpg'));
    await screen.findByText('File too large');

    apiMock.uploadImage.mockResolvedValue({ id: 'img-1' });
    await user.click(screen.getByRole('button', { name: 'Retry uploading a.jpg' }));

    expect(await screen.findByText('Uploaded')).toBeInTheDocument();
    expect(apiMock.uploadImage).toHaveBeenCalledTimes(2);
  });

  it('removes the failed photo instead, unblocking the rest', async () => {
    apiMock.uploadImage
      .mockResolvedValueOnce({ id: 'img-1' })
      .mockRejectedValueOnce(new ApiError('File too large', 413, null));
    const { user } = renderUpload();

    await chooseFromGallery(user, makeFile('good.jpg'), makeFile('bad.jpg'));
    await screen.findByText('File too large');

    await user.click(screen.getByRole('button', { name: 'Remove bad.jpg' }));

    expect(screen.queryByText('bad.jpg')).not.toBeInTheDocument();
    expect(await screen.findByRole('button', { name: 'Continue with 1 photo' })).toBeEnabled();
  });

  it('revokes the local preview URL when a photo is removed', async () => {
    const revoke = vi.spyOn(URL, 'revokeObjectURL');
    const { user } = renderUpload();

    await chooseFromGallery(user, makeFile('a.jpg'));
    await screen.findByText('File too large');
    await user.click(screen.getByRole('button', { name: 'Remove a.jpg' }));

    expect(revoke).toHaveBeenCalled();
  });
});

describe('the camera', () => {
  /** Installs a getUserMedia that resolves to a fake stream. */
  function stubCamera({ deviceCount = 2, fail = false } = {}) {
    const stop = vi.fn();
    const stream = { getTracks: () => [{ stop }] };
    const getUserMedia = fail
      ? vi.fn().mockRejectedValue(new Error('NotAllowedError'))
      : vi.fn().mockResolvedValue(stream);

    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        getUserMedia,
        enumerateDevices: vi
          .fn()
          .mockResolvedValue(Array.from({ length: deviceCount }, () => ({ kind: 'videoinput' }))),
      },
    });
    return { getUserMedia, stop };
  }

  afterEach(() => {
    delete navigator.mediaDevices;
  });

  it('opens the live camera for the angle that was tapped', async () => {
    const { getUserMedia } = stubCamera();
    const { user } = renderUpload();

    await user.click(screen.getByRole('button', { name: /Upper Arch/ }));

    expect(await screen.findByRole('dialog', { name: /camera/i })).toBeInTheDocument();
    expect(getUserMedia).toHaveBeenCalledWith({
      video: { facingMode: { ideal: 'environment' } },
      audio: false,
    });
    expect(screen.getByRole('tab', { name: 'Upper Arch' })).toHaveAttribute('aria-selected', 'true');
  });

  it('shows the framing hint for the selected angle and lets it be changed', async () => {
    stubCamera();
    const { user } = renderUpload();

    await user.click(screen.getByRole('button', { name: /Front Teeth & Gums/ }));
    await screen.findByRole('dialog', { name: /camera/i });

    expect(screen.getByText(/Center front teeth & gums/)).toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: 'Lower Floor' }));
    expect(screen.getByText(/Open wide to capture floor of mouth/)).toBeInTheDocument();
  });

  it('stops the media tracks when the camera is closed', async () => {
    const { stop } = stubCamera();
    const { user } = renderUpload();

    await user.click(screen.getByRole('button', { name: /Front Teeth & Gums/ }));
    await screen.findByRole('dialog', { name: /camera/i });

    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    await waitFor(() => expect(stop).toHaveBeenCalled());
    expect(screen.queryByRole('dialog', { name: /camera/i })).not.toBeInTheDocument();
  });

  it('offers a flip control only when the device has more than one camera', async () => {
    stubCamera({ deviceCount: 1 });
    const { user } = renderUpload();

    await user.click(screen.getByRole('button', { name: /Front Teeth & Gums/ }));
    await screen.findByRole('dialog', { name: /camera/i });

    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Switch camera' })).not.toBeInTheDocument()
    );
  });

  it('flips between the rear and front cameras', async () => {
    const { getUserMedia } = stubCamera({ deviceCount: 2 });
    const { user } = renderUpload();

    await user.click(screen.getByRole('button', { name: /Front Teeth & Gums/ }));
    const flip = await screen.findByRole('button', { name: 'Switch camera' });

    await user.click(flip);

    await waitFor(() =>
      expect(getUserMedia).toHaveBeenLastCalledWith({
        video: { facingMode: { ideal: 'user' } },
        audio: false,
      })
    );
  });

  it('explains a denied permission and offers the OS picker instead', async () => {
    stubCamera({ fail: true });
    const { user } = renderUpload();

    await user.click(screen.getByRole('button', { name: /Front Teeth & Gums/ }));

    expect(
      await screen.findByText(/Camera access was unavailable/)
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open camera picker' })).toBeInTheDocument();
  });

  it('falls straight through to the file picker where getUserMedia does not exist', async () => {
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: undefined });
    const click = vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(() => {});
    const { user } = renderUpload();

    await user.click(screen.getByRole('button', { name: /Front Teeth & Gums/ }));

    expect(click).toHaveBeenCalled();
    expect(screen.queryByRole('dialog', { name: /camera/i })).not.toBeInTheDocument();
  });

  it('captures a frame, tags it with the angle and ticks the checklist', async () => {
    stubCamera();
    // jsdom has no video pipeline or canvas encoder — stand in for both.
    vi.spyOn(HTMLVideoElement.prototype, 'videoWidth', 'get').mockReturnValue(640);
    vi.spyOn(HTMLVideoElement.prototype, 'videoHeight', 'get').mockReturnValue(480);
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ drawImage: vi.fn() });
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((cb) =>
      cb(new Blob(['jpeg'], { type: 'image/jpeg' }))
    );
    const { user } = renderUpload();

    await user.click(screen.getByRole('button', { name: /Lower Floor/ }));
    await screen.findByRole('dialog', { name: /camera/i });
    await user.click(screen.getByRole('button', { name: 'Capture photo' }));

    expect(await screen.findByText('1 of 4')).toBeInTheDocument();
    expect(await screen.findByText('Uploaded')).toBeInTheDocument();
    const lowerFloor = screen.getByRole('button', { name: /Lower Floor/ });
    expect(within(lowerFloor).getByText('Retake')).toBeInTheDocument();
  });

  it('does nothing when the video has no frame yet', async () => {
    stubCamera();
    vi.spyOn(HTMLVideoElement.prototype, 'videoWidth', 'get').mockReturnValue(0);
    const { user } = renderUpload();

    await user.click(screen.getByRole('button', { name: /Front Teeth & Gums/ }));
    await screen.findByRole('dialog', { name: /camera/i });
    await user.click(screen.getByRole('button', { name: 'Capture photo' }));

    expect(screen.getByRole('dialog', { name: /camera/i })).toBeInTheDocument();
    expect(apiMock.uploadImage).not.toHaveBeenCalled();
  });

  it('does nothing when the canvas produces no blob', async () => {
    stubCamera();
    vi.spyOn(HTMLVideoElement.prototype, 'videoWidth', 'get').mockReturnValue(640);
    vi.spyOn(HTMLVideoElement.prototype, 'videoHeight', 'get').mockReturnValue(480);
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ drawImage: vi.fn() });
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((cb) => cb(null));
    const { user } = renderUpload();

    await user.click(screen.getByRole('button', { name: /Front Teeth & Gums/ }));
    await screen.findByRole('dialog', { name: /camera/i });
    await user.click(screen.getByRole('button', { name: 'Capture photo' }));

    expect(apiMock.uploadImage).not.toHaveBeenCalled();
  });
});

describe('running the assessment', () => {
  async function readyToContinue(user) {
    await chooseFromGallery(user, makeFile());
    await screen.findByRole('button', { name: 'Continue with 1 photo' });
  }

  it('shows the analysing screen and then hands the result to the result screen', async () => {
    let resolveAssess;
    apiMock.triggerAssessment.mockReturnValue(new Promise((r) => { resolveAssess = r; }));
    const { user } = renderUpload();
    await readyToContinue(user);

    await user.click(continueButton());

    expect(await screen.findByRole('heading', { name: 'Analyzing your screening' })).toBeInTheDocument();
    expect(analysingStatus()).toBe('Reviewing your photos...');

    resolveAssess({ aiRiskClassification: 'HIGH_RISK' });

    await waitFor(() =>
      expect(navigate).toHaveBeenCalledWith('/questionnaire/q1/assessment', {
        state: { assessment: { aiRiskClassification: 'HIGH_RISK' } },
      })
    );
  });

  it('cycles the reassurance messages while it waits', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    apiMock.triggerAssessment.mockReturnValue(new Promise(() => {}));
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(
      <MemoryRouter initialEntries={['/questionnaire/q1/photos']} future={routerFuture}>
        <ToastProvider>
          <Routes>
            <Route path="/questionnaire/:questionnaireId/photos" element={<PhotoUpload />} />
          </Routes>
        </ToastProvider>
      </MemoryRouter>
    );

    await chooseFromGallery(user, makeFile());
    await screen.findByRole('button', { name: 'Continue with 1 photo' });
    await user.click(screen.getByRole('button', { name: 'Continue with 1 photo' }));
    await screen.findByRole('heading', { name: 'Analyzing your screening' });

    act(() => vi.advanceTimersByTime(3500));
    expect(analysingStatus()).toBe('Checking symptoms...');

    vi.useRealTimers();
  });

  it('keeps the photos and offers a retry when the assessment fails', async () => {
    apiMock.triggerAssessment.mockRejectedValue(new ApiError('boom', 500, null));
    const { user } = renderUpload();
    await readyToContinue(user);

    await user.click(continueButton());

    expect(await screen.findByRole('heading', { name: "Couldn't run the assessment" })).toBeInTheDocument();
    expect(screen.getByText('Your photos are saved. Please try again.')).toBeInTheDocument();
    expect(await screen.findByText('Assessment could not be started. Please try again.')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('button', { name: 'Continue with 1 photo' })).toBeInTheDocument();
  });

  it('hands an expired session to the recovery hook instead of showing an error', async () => {
    handleAuthError.mockReturnValue(true);
    apiMock.triggerAssessment.mockRejectedValue(new ApiError('Unauthorized', 401, null));
    const { user } = renderUpload();
    await readyToContinue(user);

    await user.click(continueButton());

    await waitFor(() => expect(handleAuthError).toHaveBeenCalled());
    expect(screen.queryByRole('heading', { name: "Couldn't run the assessment" })).not.toBeInTheDocument();
  });
});
