import { getFirebaseToken } from '../config/firebase';

// https only — Firebase ID tokens, questionnaire answers and photos all cross this link.
const DEFAULT_BASE_URL = 'https://oralscreen-api.ap-south-1.elasticbeanstalk.com';
const BASE_URL = import.meta.env.PROD
  ? (import.meta.env.VITE_API_BASE_URL || DEFAULT_BASE_URL)
  : '';

function resolveApiUrl(url) {
  if (!url || /^https?:\/\//i.test(url)) return url || null;
  const normalizedPath = url.startsWith('/') ? url : `/${url}`;
  return `${BASE_URL}${normalizedPath}`;
}

/**
 * Fallback for when `/api/patients/gender/options` is unavailable.
 *
 * The values are **display names**, matching what that endpoint returns and what the server
 * matches on (`GenderType.findByDisplayName`). They used to be enum names — `MALE` rather
 * than `Male` — so whenever the options call failed, every subsequent registration submitted
 * a `sex` the server resolved to null and silently dropped. Keep these strings identical to
 * `GenderType`'s display names.
 */
export const DEFAULT_SEX_OPTIONS = [
  { value: 'Male', label: 'Male' },
  { value: 'Female', label: 'Female' },
  { value: 'Transgender', label: 'Transgender' },
  { value: 'Prefer Not to Say', label: 'Prefer Not to Say' }
];

function normalizeOptionsPayload(payload) {
  if (Array.isArray(payload)) {
    return payload.map((item) =>
      typeof item === 'string' ? { value: item, label: item } : item
    );
  }

  return DEFAULT_SEX_OPTIONS;
}

export class ApiError extends Error {
  constructor(message, status, body) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
  }
}

/**
 * The API returns its message under `message` (GlobalExceptionHandler) or `error`
 * (the security filter chain and the 401 paths). Read both — only checking `message`
 * silently discarded every auth error and replaced it with "Request failed with status N".
 */
function errorMessage(body, fallback) {
  if (Array.isArray(body?.issues) && body.issues.length > 0) {
    return `${body.issues.join('. ')}. Please take and upload a clearer, well-lit photo.`;
  }

  return body?.message || body?.error || fallback;
}

async function parseErrorBody(res) {
  try {
    return await res.json();
  } catch (_) {
    // Not JSON (an HTML error page, or an empty body) — the caller still gets the status.
    return null;
  }
}

/**
 * Every call attaches a **freshly read** Firebase ID token. The SDK caches and auto-refreshes,
 * so this is cheap, and it means no caller can pin a token that expires mid-session.
 *
 * `authHeader` is spread last on purpose: it previously came before `options.headers`, which
 * let callers passing a stored token silently override the fresh one.
 */
async function request(path, options = {}) {
  const isFormData = options.body instanceof FormData;
  const mandatoryHeaders = {
    'ngrok-skip-browser-warning': '69420',
  };

  const skipAuth = options.skipAuth === true;
  const firebaseToken = skipAuth ? null : await getFirebaseToken();
  const authHeader = firebaseToken ? { Authorization: `Bearer ${firebaseToken}` } : {};

  const baseHeaders = isFormData ? {} : { 'Content-Type': 'application/json' };

  const res = await fetch(resolveApiUrl(path), {
    ...options,
    headers: {
      ...baseHeaders,
      ...mandatoryHeaders,
      ...(options.headers || {}),
      ...authHeader,
    },
  });

  if (!res.ok) {
    const body = await parseErrorBody(res);
    if (import.meta.env.DEV) {
      console.error(`[API] ${options.method || 'GET'} ${path} failed:`, res.status, body);
    }
    throw new ApiError(
      errorMessage(body, `Request failed with status ${res.status}`),
      res.status,
      body
    );
  }

  if (res.status === 204) return null;
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

/**
 * Admin calls carry the key the admin typed. There is no environment-variable fallback —
 * that is what put the key in the shipped bundle.
 */
function adminRequest(path, adminKey, options = {}) {
  if (!adminKey) {
    throw new ApiError('Admin key required', 401, null);
  }
  return request(path, {
    ...options,
    headers: { ...(options.headers || {}), 'X-Admin-Key': adminKey },
  });
}

/** Binary fetch (images). Same fresh-token rule as `request`. */
async function blobRequest(path) {
  const firebaseToken = await getFirebaseToken();
  const res = await fetch(resolveApiUrl(path), {
    headers: {
      'ngrok-skip-browser-warning': '69420',
      ...(firebaseToken ? { Authorization: `Bearer ${firebaseToken}` } : {}),
    },
  });

  if (!res.ok) {
    const body = await parseErrorBody(res);
    throw new ApiError(
      errorMessage(body, `Request failed with status ${res.status}`),
      res.status,
      body
    );
  }

  return res.blob();
}

/**
 * Uploads a single file with progress callbacks, via XHR (fetch has no
 * upload-progress event). Returns a promise resolving to the parsed JSON
 * upload DTO ({ id, questionnaireId, storageKey, imageQualityStatus,
 * uploadedAt }), or rejecting with an ApiError.
 */
async function uploadImage(questionnaireId, file, onProgress) {
  const firebaseToken = await getFirebaseToken();

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const formData = new FormData();
    formData.append('file', file);

    xhr.upload.addEventListener('progress', (event) => {
      if (event.lengthComputable && onProgress) {
        onProgress(Math.round((event.loaded / event.total) * 100));
      }
    });

    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          resolve(xhr.responseText ? JSON.parse(xhr.responseText) : null);
        } catch (_) {
          resolve(null);
        }
      } else {
        let body = null;
        try {
          body = JSON.parse(xhr.responseText);
        } catch (_) {
          // ignore
        }
        reject(
          new ApiError(
            errorMessage(body, `Upload failed with status ${xhr.status}`),
            xhr.status,
            body
          )
        );
      }
    });

    xhr.addEventListener('error', () => {
      reject(new ApiError('Network error during upload', 0));
    });

    xhr.open('POST', resolveApiUrl(`/api/questionnaires/${questionnaireId}/images`));

    // Add headers AFTER open() and BEFORE send()
    xhr.setRequestHeader('ngrok-skip-browser-warning', '69420');
    if (firebaseToken) {
      xhr.setRequestHeader('Authorization', `Bearer ${firebaseToken}`);
    }

    xhr.send(formData);
  });
}

export const api = {
  /**
   * Find-or-create by phone number.
   *
   * The server takes the phone from the verified Firebase token and ignores whatever is in
   * the body, so the two can never disagree. Contract:
   *  - no name, patient exists  -> 200 with Patient
   *  - no name, patient missing -> 404 with { code: 'PATIENT_NOT_FOUND' }
   *  - with name, patient missing -> 201 created Patient
   */
  findOrCreatePatient: (data) =>
    request('/api/patients', { method: 'POST', body: JSON.stringify(data) }),

  getPatient: (id) => request(`/api/patients/${id}`),

  getPatientAssessments: (id) => request(`/api/patients/${id}/assessments`),

  getSexOptions: async () => {
    try {
      return normalizeOptionsPayload(await request('/api/patients/gender/options'));
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) return DEFAULT_SEX_OPTIONS;
      throw err;
    }
  },

  submitQuestionnaire: (data) =>
    request('/api/questionnaires', { method: 'POST', body: JSON.stringify(data) }),

  updateQuestionnaire: (id, data) =>
    request(`/api/questionnaires/${id}`, { method: 'PUT', body: JSON.stringify(data) }),

  getQuestionnaire: (id) => request(`/api/questionnaires/${id}`),

  /**
   * The assessment for a questionnaire. This is what makes a result survive a page refresh:
   * the result screen is reached by navigation state, which is gone the moment the patient
   * reloads, backgrounds the PWA long enough, or opens the URL again later.
   */
  getQuestionnaireAssessment: (questionnaireId) =>
    request(`/api/questionnaires/${questionnaireId}/assessment`),

  uploadImage,

  triggerAssessment: (questionnaireId) =>
    request(`/api/questionnaires/${questionnaireId}/assess`, { method: 'POST' }),

  getAssessment: (id) => request(`/api/assessments/${id}`),

  // --- doctor ---------------------------------------------------------------
  // All of these read the phone from the verified token; nothing is sent in the body.
  // None take a token argument any more — see the note on `request`.

  checkDoctor: () => request('/api/doctor/auth/check', { method: 'POST' }),

  getDoctor: (doctorId) => request(`/api/doctors/${doctorId}`),

  registerDoctor: (data) =>
    request('/api/doctor/auth/register', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  loginDoctor: () => request('/api/doctor/auth/login', { method: 'POST' }),

  getDoctorQueue: () => request('/api/doctor/queue'),

  getDoctorAssessment: (id) => request(`/api/assessments/${id}`),

  getDoctorImageBlob: (imageId) => blobRequest(`/api/images/${imageId}/content`),

  submitDoctorReview: (id, data) =>
    request(`/api/doctor/assessments/${id}/review`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  // --- admin ----------------------------------------------------------------

  getPendingDoctors: (adminKey) => adminRequest('/api/admin/doctors', adminKey),

  approveDoctor: (doctorId, adminKey) =>
    adminRequest(`/api/admin/doctors/${doctorId}/approve`, adminKey, { method: 'POST' }),

  /**
   * Dashboard metrics. Deliberately the `/api/admin/**` copy rather than
   * `/api/doctors/metrics`: the console authenticates with the admin key alone and has no
   * Firebase token, so it can never hold ROLE_DOCTOR.
   */
  getAdminMetrics: (adminKey) => adminRequest('/api/admin/metrics', adminKey),

  resolveApiUrl,
};
