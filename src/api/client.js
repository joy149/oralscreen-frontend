const BASE_URL = import.meta.env.VITE_API_BASE_URL || 'https://qualifier-pagan-unwatched.ngrok-free.dev';

function resolveApiUrl(url) {
  if (!url || /^https?:\/\//i.test(url)) return url || null;
  return `${BASE_URL}${url.startsWith('/') ? url : `/${url}`}`;
}

const DEFAULT_SEX_OPTIONS = [,
  { value: 'MALE', label: 'Male' },
  { value: 'FEMALE', label: 'Female' },
  { value: 'TRANSGENDER', label: 'Transgender' },
  { value: 'PREFER_NOT_TO_SAY', label: 'Prefer not to say' }
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

function errorMessage(body, fallback) {
  if (Array.isArray(body?.issues) && body.issues.length > 0) {
    return `${body.issues.join('. ')}. Please take and upload a clearer, well-lit photo.`;
  }

  return body?.message || fallback;
}

async function request(path, options = {}) {
  const isFormData = options.body instanceof FormData;
  const mandatoryHeaders = {
    'ngrok-skip-browser-warning': '69420',
  };
  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: isFormData
      ? { ...mandatoryHeaders, ...options.headers }
      : { 
          'Content-Type': 'application/json', 
          ...mandatoryHeaders, 
          ...(options.headers || {}) 
        },
  });

  if (!res.ok) {
    let body = null;
    try {
      body = await res.json();
    } catch (_) {
      // response wasn't JSON (e.g. a raw 500 stack trace) — swallow it,
      // the caller still gets a usable ApiError with a status code.
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

function doctorRequest(path, token, options = {}) {
  return request(path, {
    ...options,
    headers: {
      ...(options.headers || {}),
      Authorization: `Bearer ${token}`,
    },
  });
}

async function doctorBlobRequest(path, token) {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { 
      Authorization: `Bearer ${token}`,
      'ngrok-skip-browser-warning': '69420' 
    },
  });

  if (!res.ok) {
    let body = null;
    try {
      body = await res.json();
    } catch (_) {
      // Binary endpoints may return an empty or plain-text error body.
    }
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
function uploadImage(questionnaireId, file, onProgress) {
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

    xhr.open('POST', `${BASE_URL}/api/questionnaires/${questionnaireId}/images`);
    
    // Add the ngrok header here, AFTER open() and BEFORE send()
    xhr.setRequestHeader('ngrok-skip-browser-warning', '69420');
    
    xhr.send(formData);
  });
}

export const api = {
  /**
   * Find-or-create by phone number.
   * Expected backend contract (per phone-only login decision):
   *  - { phoneNumber } only, patient exists  -> 200 with Patient
   *  - { phoneNumber } only, patient missing -> 404 with { code: 'PATIENT_NOT_FOUND' }
   *  - { phoneNumber, name, age?, sex? }, patient missing -> 201 created Patient
   * Adjust the 404/code check below if the backend contract ends up different.
   */
  findOrCreatePatient: (data) =>
    request('/api/patients', { method: 'POST', body: JSON.stringify(data) }),

  getPatient: (id) => request(`/api/patients/${id}`),

  getSexOptions: async () => {
    const candidates = ['/api/patients/gender/options'];

    for (const path of candidates) {
      try {
        const payload = await request(path);
        return normalizeOptionsPayload(payload);
      } catch (err) {
        if (!(err instanceof ApiError) || err.status !== 404) {
          throw err;
        }
      }
    }

    return DEFAULT_SEX_OPTIONS;
  },

  submitQuestionnaire: (data) =>
    request('/api/questionnaires', { method: 'POST', body: JSON.stringify(data) }),

  updateQuestionnaire: (id, data) =>
    request(`/api/questionnaires/${id}`, { method: 'PUT', body: JSON.stringify(data) }),

  getQuestionnaire: (id) => request(`/api/questionnaires/${id}`),

  uploadImage,

  triggerAssessment: (questionnaireId) =>
    request(`/api/questionnaires/${questionnaireId}/assess`, { method: 'POST' }),

  getAssessment: (id) => request(`/api/assessments/${id}`),

  checkDoctor: (phoneNumber) =>
    request('/api/doctor/auth/check', {
      method: 'POST',
      body: JSON.stringify({ phoneNumber }),
    }),

  getDoctor: (doctorId) => request(`/api/doctors/${doctorId}`),

  registerDoctor: (data) =>
    request('/api/doctor/auth/register', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  loginDoctor: (phoneNumber) =>
    request('/api/doctor/auth/login', {
      method: 'POST',
      body: JSON.stringify({ phoneNumber }),
    }),

  getDoctorQueue: (token) => doctorRequest('/api/doctor/queue', token),

  getDoctorAssessment: (id, token) =>
    doctorRequest(`/api/assessments/${id}`, token),

  getDoctorImageBlob: (imageId, token) =>
    doctorBlobRequest(`/api/images/${imageId}/content`, token),

  submitDoctorReview: (id, data, token) =>
    doctorRequest(`/api/doctor/assessments/${id}/review`, token, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  resolveApiUrl,
};
