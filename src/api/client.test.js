import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const getFirebaseToken = vi.fn();

vi.mock('../config/firebase', () => ({
  getFirebaseToken: (...args) => getFirebaseToken(...args),
}));

let api;
let ApiError;
let DEFAULT_SEX_OPTIONS;

/** Builds a minimal Response stand-in; `body` is what `res.json()`/`res.text()` yield. */
function jsonResponse(body, { status = 200, ok = status < 400 } = {}) {
  const text = body === undefined ? '' : JSON.stringify(body);
  return {
    ok,
    status,
    json: async () => {
      if (body === undefined) throw new SyntaxError('Unexpected end of JSON input');
      return body;
    },
    text: async () => text,
    blob: async () => new Blob([text]),
  };
}

/** The headers the request under test actually sent. */
function sentHeaders(fetchMock, callIndex = 0) {
  return fetchMock.mock.calls[callIndex][1].headers;
}

beforeEach(async () => {
  vi.resetModules();
  // The client logs every failed request in DEV; the error-path tests below trigger that
  // deliberately, so keep it out of the test output.
  vi.spyOn(console, 'error').mockImplementation(() => {});
  getFirebaseToken.mockResolvedValue('fresh-token');
  const mod = await import('./client');
  api = mod.api;
  ApiError = mod.ApiError;
  DEFAULT_SEX_OPTIONS = mod.DEFAULT_SEX_OPTIONS;
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('resolveApiUrl', () => {
  it('leaves absolute http(s) URLs untouched', () => {
    expect(api.resolveApiUrl('https://example.test/api/x')).toBe('https://example.test/api/x');
    expect(api.resolveApiUrl('HTTP://example.test/y')).toBe('HTTP://example.test/y');
  });

  it('returns null for an empty or missing path', () => {
    expect(api.resolveApiUrl('')).toBeNull();
    expect(api.resolveApiUrl(undefined)).toBeNull();
  });

  it('prefixes a leading slash onto a bare relative path', () => {
    // In dev BASE_URL is '' (the Vite proxy handles it), so the result is the path alone.
    expect(api.resolveApiUrl('api/patients')).toBe('/api/patients');
    expect(api.resolveApiUrl('/api/patients')).toBe('/api/patients');
  });

  it('prefixes the configured base URL in a production build', async () => {
    vi.resetModules();
    vi.stubEnv('PROD', true);
    vi.stubEnv('VITE_API_BASE_URL', 'https://api.example.test');
    const { api: prodApi } = await import('./client');

    expect(prodApi.resolveApiUrl('/api/patients')).toBe('https://api.example.test/api/patients');
  });

  it('falls back to the default backend host when VITE_API_BASE_URL is unset', async () => {
    vi.resetModules();
    vi.stubEnv('PROD', true);
    vi.stubEnv('VITE_API_BASE_URL', '');
    const { api: prodApi } = await import('./client');

    expect(prodApi.resolveApiUrl('/api/x')).toBe(
      'https://oralscreen-api.ap-south-1.elasticbeanstalk.com/api/x'
    );
  });
});

describe('ApiError', () => {
  it('carries the status and parsed body alongside the message', () => {
    const err = new ApiError('nope', 418, { message: 'nope' });
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('ApiError');
    expect(err.status).toBe(418);
    expect(err.body).toEqual({ message: 'nope' });
  });
});

describe('request headers', () => {
  it('sends a JSON content type and the ngrok bypass header', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ id: 1 }));
    vi.stubGlobal('fetch', fetchMock);

    await api.findOrCreatePatient({ phoneNumber: '9876543210' });

    expect(sentHeaders(fetchMock)).toMatchObject({
      'Content-Type': 'application/json',
      'ngrok-skip-browser-warning': '69420',
      Authorization: 'Bearer fresh-token',
    });
  });

  it('attaches no Authorization header when there is no signed-in user', async () => {
    getFirebaseToken.mockResolvedValue(null);
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({}));
    vi.stubGlobal('fetch', fetchMock);

    await api.getPatient('p1');

    expect(sentHeaders(fetchMock).Authorization).toBeUndefined();
  });

  it('reads a fresh token on every call rather than reusing one', async () => {
    getFirebaseToken
      .mockResolvedValueOnce('token-a')
      .mockResolvedValueOnce('token-b');
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({}));
    vi.stubGlobal('fetch', fetchMock);

    await api.getPatient('p1');
    await api.getPatient('p1');

    expect(sentHeaders(fetchMock, 0).Authorization).toBe('Bearer token-a');
    expect(sentHeaders(fetchMock, 1).Authorization).toBe('Bearer token-b');
  });

  it('lets the fresh token win over an Authorization header passed by the caller', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({}));
    vi.stubGlobal('fetch', fetchMock);

    // adminRequest is the one call path that merges caller headers.
    await api.getAdminMetrics('admin-key');

    const headers = sentHeaders(fetchMock);
    expect(headers.Authorization).toBe('Bearer fresh-token');
    expect(headers['X-Admin-Key']).toBe('admin-key');
  });
});

describe('request responses', () => {
  it('parses a JSON body', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ id: 'q1' })));
    await expect(api.getQuestionnaire('q1')).resolves.toEqual({ id: 'q1' });
  });

  it('returns null for 204 No Content', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(undefined, { status: 204 })));
    await expect(api.getQuestionnaire('q1')).resolves.toBeNull();
  });

  it('returns null for a 200 with an empty body', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => '',
    }));
    await expect(api.getQuestionnaire('q1')).resolves.toBeNull();
  });
});

describe('request error handling', () => {
  it('prefers the `message` field from the global exception handler', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      jsonResponse({ message: 'Patient not found' }, { status: 404 })
    ));

    await expect(api.getPatient('nope')).rejects.toMatchObject({
      name: 'ApiError',
      message: 'Patient not found',
      status: 404,
    });
  });

  it('falls back to the `error` field the security filter chain returns', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      jsonResponse({ error: 'Unauthorized' }, { status: 401 })
    ));

    await expect(api.getPatient('p1')).rejects.toMatchObject({
      message: 'Unauthorized',
      status: 401,
    });
  });

  it('joins image-quality issues into photo guidance', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      jsonResponse({ issues: ['Too dark', 'Blurry'] }, { status: 422 })
    ));

    await expect(api.triggerAssessment('q1')).rejects.toThrow(
      'Too dark. Blurry. Please take and upload a clearer, well-lit photo.'
    );
  });

  it('ignores an empty issues array and uses the message instead', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      jsonResponse({ issues: [], message: 'Bad request' }, { status: 400 })
    ));

    await expect(api.triggerAssessment('q1')).rejects.toThrow('Bad request');
  });

  it('falls back to the status when the body is not JSON', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => {
        throw new SyntaxError('Unexpected token <');
      },
    }));

    await expect(api.getPatient('p1')).rejects.toMatchObject({
      message: 'Request failed with status 500',
      status: 500,
      body: null,
    });
  });
});

describe('adminRequest', () => {
  it('raises a 401 ApiError before any network call when the key is missing', () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    // Note: this throws *synchronously* — `adminRequest` is not async, unlike every other
    // `api.*` method, which returns a promise. A caller writing
    // `api.getPendingDoctors(key).catch(...)` gets an uncaught throw rather than a rejection.
    // Pinned here because the admin screens rely on `await` inside try/catch, which works
    // either way; changing `adminRequest` to async would also be safe for them.
    expect(() => api.getPendingDoctors('')).toThrowError(
      expect.objectContaining({ name: 'ApiError', message: 'Admin key required', status: 401 })
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sends X-Admin-Key and the request method for an approval', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ approved: true }));
    vi.stubGlobal('fetch', fetchMock);

    await api.approveDoctor('doc-7', 'secret');

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/admin/doctors/doc-7/approve',
      expect.objectContaining({ method: 'POST' })
    );
    expect(sentHeaders(fetchMock)['X-Admin-Key']).toBe('secret');
  });
});

describe('getSexOptions', () => {
  it('maps a string array into value/label pairs', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(['Male', 'Female'])));

    await expect(api.getSexOptions()).resolves.toEqual([
      { value: 'Male', label: 'Male' },
      { value: 'Female', label: 'Female' },
    ]);
  });

  it('passes an array of objects through unchanged', async () => {
    const payload = [{ value: 'Male', label: 'Male' }];
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(payload)));

    await expect(api.getSexOptions()).resolves.toEqual(payload);
  });

  it('falls back to display-name defaults when the payload is not an array', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ unexpected: true })));

    await expect(api.getSexOptions()).resolves.toEqual(DEFAULT_SEX_OPTIONS);
  });

  it('falls back to defaults when the endpoint is missing (404)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      jsonResponse({ message: 'no such endpoint' }, { status: 404 })
    ));

    await expect(api.getSexOptions()).resolves.toEqual(DEFAULT_SEX_OPTIONS);
  });

  it('rethrows non-404 failures rather than silently defaulting', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      jsonResponse({ message: 'boom' }, { status: 500 })
    ));

    await expect(api.getSexOptions()).rejects.toThrow('boom');
  });

  it('ships display names, not enum names — the server matches on display names', () => {
    expect(DEFAULT_SEX_OPTIONS.map((o) => o.value)).toEqual([
      'Male',
      'Female',
      'Transgender',
      'Prefer Not to Say',
    ]);
  });
});

describe('endpoint wiring', () => {
  const cases = [
    ['findOrCreatePatient', ['/api/patients', { a: 1 }], '/api/patients', 'POST'],
    ['getPatient', ['p1'], '/api/patients/p1', undefined],
    ['getPatientAssessments', ['p1'], '/api/patients/p1/assessments', undefined],
    ['getQuestionnaire', ['q1'], '/api/questionnaires/q1', undefined],
    ['getQuestionnaireAssessment', ['q1'], '/api/questionnaires/q1/assessment', undefined],
    ['triggerAssessment', ['q1'], '/api/questionnaires/q1/assess', 'POST'],
    ['getAssessment', ['a1'], '/api/assessments/a1', undefined],
    ['checkDoctor', [], '/api/doctor/auth/check', 'POST'],
    ['getDoctor', ['d1'], '/api/doctors/d1', undefined],
    ['loginDoctor', [], '/api/doctor/auth/login', 'POST'],
    ['getDoctorQueue', [], '/api/doctor/queue', undefined],
    ['getDoctorAssessment', ['a1'], '/api/assessments/a1', undefined],
  ];

  it.each(cases)('%s hits %s', async (method, args, expectedPath, expectedVerb) => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({}));
    vi.stubGlobal('fetch', fetchMock);

    const callArgs = method === 'findOrCreatePatient' ? [args[1]] : args;
    await api[method](...callArgs);

    expect(fetchMock.mock.calls[0][0]).toBe(expectedPath);
    expect(fetchMock.mock.calls[0][1].method).toBe(expectedVerb);
  });

  it('serialises bodies for the write endpoints', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({}));
    vi.stubGlobal('fetch', fetchMock);

    await api.submitQuestionnaire({ tobacco: true });
    await api.updateQuestionnaire('q1', { tobacco: false });
    await api.registerDoctor({ name: 'Dr A' });
    await api.submitDoctorReview('a1', { notes: 'ok' });

    expect(fetchMock.mock.calls[0][1].body).toBe('{"tobacco":true}');
    expect(fetchMock.mock.calls[1][0]).toBe('/api/questionnaires/q1');
    expect(fetchMock.mock.calls[1][1].method).toBe('PUT');
    expect(fetchMock.mock.calls[2][0]).toBe('/api/doctor/auth/register');
    expect(fetchMock.mock.calls[3][0]).toBe('/api/doctor/assessments/a1/review');
  });
});

describe('getDoctorImageBlob', () => {
  it('returns the blob with the fresh token attached', async () => {
    const blob = new Blob(['png-bytes']);
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, blob: async () => blob });
    vi.stubGlobal('fetch', fetchMock);

    await expect(api.getDoctorImageBlob('img-1')).resolves.toBe(blob);
    expect(fetchMock.mock.calls[0][0]).toBe('/api/images/img-1/content');
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe('Bearer fresh-token');
  });

  it('omits Authorization when signed out', async () => {
    getFirebaseToken.mockResolvedValue(null);
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, blob: async () => new Blob() });
    vi.stubGlobal('fetch', fetchMock);

    await api.getDoctorImageBlob('img-1');

    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBeUndefined();
  });

  it('throws an ApiError carrying the server message on failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      jsonResponse({ message: 'Image gone' }, { status: 404 })
    ));

    await expect(api.getDoctorImageBlob('img-1')).rejects.toMatchObject({
      message: 'Image gone',
      status: 404,
    });
  });

  it('falls back to the status when the error body is unreadable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      json: async () => {
        throw new Error('not json');
      },
    }));

    await expect(api.getDoctorImageBlob('img-1')).rejects.toThrow(
      'Request failed with status 503'
    );
  });
});

describe('uploadImage', () => {
  let instances;

  /** Minimal XMLHttpRequest double — fetch has no upload-progress event, so the real
   *  implementation uses XHR and the test has to drive its events by hand. */
  function installFakeXhr() {
    instances = [];
    class FakeXhr {
      constructor() {
        this.upload = { listeners: {}, addEventListener: (t, fn) => { this.upload.listeners[t] = fn; } };
        this.listeners = {};
        this.headers = {};
        this.status = 200;
        this.responseText = '';
        instances.push(this);
      }
      addEventListener(type, fn) { this.listeners[type] = fn; }
      open(method, url) { this.method = method; this.url = url; }
      setRequestHeader(k, v) { this.headers[k] = v; }
      send(body) { this.body = body; }
      emitProgress(loaded, total, lengthComputable = true) {
        this.upload.listeners.progress?.({ loaded, total, lengthComputable });
      }
      finish(status, responseText) {
        this.status = status;
        this.responseText = responseText;
        this.listeners.load?.();
      }
      failNetwork() { this.listeners.error?.(); }
    }
    vi.stubGlobal('XMLHttpRequest', FakeXhr);
  }

  beforeEach(installFakeXhr);

  it('POSTs the file as multipart to the questionnaire images endpoint', async () => {
    const file = new File(['x'], 'lesion.jpg', { type: 'image/jpeg' });
    const promise = api.uploadImage('q1', file);
    await vi.waitFor(() => expect(instances).toHaveLength(1));
    const xhr = instances[0];

    expect(xhr.method).toBe('POST');
    expect(xhr.url).toBe('/api/questionnaires/q1/images');
    expect(xhr.headers['ngrok-skip-browser-warning']).toBe('69420');
    expect(xhr.headers.Authorization).toBe('Bearer fresh-token');
    expect(xhr.body).toBeInstanceOf(FormData);
    expect(xhr.body.get('file')).toBe(file);

    xhr.finish(200, '{"id":"img-1"}');
    await expect(promise).resolves.toEqual({ id: 'img-1' });
  });

  it('reports upload progress as a whole percentage', async () => {
    const onProgress = vi.fn();
    const promise = api.uploadImage('q1', new File(['x'], 'a.jpg'), onProgress);
    await vi.waitFor(() => expect(instances).toHaveLength(1));

    instances[0].emitProgress(50, 200);
    expect(onProgress).toHaveBeenCalledWith(25);

    instances[0].finish(200, '{}');
    await promise;
  });

  it('skips progress reporting when the length is not computable', async () => {
    const onProgress = vi.fn();
    const promise = api.uploadImage('q1', new File(['x'], 'a.jpg'), onProgress);
    await vi.waitFor(() => expect(instances).toHaveLength(1));

    instances[0].emitProgress(50, 0, false);
    expect(onProgress).not.toHaveBeenCalled();

    instances[0].finish(200, '{}');
    await promise;
  });

  it('tolerates a missing progress callback', async () => {
    const promise = api.uploadImage('q1', new File(['x'], 'a.jpg'));
    await vi.waitFor(() => expect(instances).toHaveLength(1));

    expect(() => instances[0].emitProgress(1, 2)).not.toThrow();
    instances[0].finish(201, '{}');
    await promise;
  });

  it('resolves to null on a 2xx with an empty or unparseable body', async () => {
    const empty = api.uploadImage('q1', new File(['x'], 'a.jpg'));
    await vi.waitFor(() => expect(instances).toHaveLength(1));
    instances[0].finish(204, '');
    await expect(empty).resolves.toBeNull();

    const garbage = api.uploadImage('q1', new File(['x'], 'b.jpg'));
    await vi.waitFor(() => expect(instances).toHaveLength(2));
    instances[1].finish(200, '<html>not json</html>');
    await expect(garbage).resolves.toBeNull();
  });

  it('rejects with the server message on a non-2xx status', async () => {
    const promise = api.uploadImage('q1', new File(['x'], 'a.jpg'));
    await vi.waitFor(() => expect(instances).toHaveLength(1));
    instances[0].finish(413, '{"message":"File too large"}');

    await expect(promise).rejects.toMatchObject({
      name: 'ApiError',
      message: 'File too large',
      status: 413,
    });
  });

  it('falls back to the status when the error body is not JSON', async () => {
    const promise = api.uploadImage('q1', new File(['x'], 'a.jpg'));
    await vi.waitFor(() => expect(instances).toHaveLength(1));
    instances[0].finish(500, 'Internal Server Error');

    await expect(promise).rejects.toMatchObject({
      message: 'Upload failed with status 500',
      status: 500,
      body: null,
    });
  });

  it('rejects with a status-0 ApiError when the connection drops', async () => {
    const promise = api.uploadImage('q1', new File(['x'], 'a.jpg'));
    await vi.waitFor(() => expect(instances).toHaveLength(1));
    instances[0].failNetwork();

    await expect(promise).rejects.toMatchObject({
      message: 'Network error during upload',
      status: 0,
    });
  });

  it('sends no Authorization header when signed out', async () => {
    getFirebaseToken.mockResolvedValue(null);
    const promise = api.uploadImage('q1', new File(['x'], 'a.jpg'));
    await vi.waitFor(() => expect(instances).toHaveLength(1));

    expect(instances[0].headers.Authorization).toBeUndefined();
    instances[0].finish(200, '{}');
    await promise;
  });
});
