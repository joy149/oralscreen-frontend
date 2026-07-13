import './ImageUploadRow.css';

/**
 * One row per selected file. `item` shape:
 * { id, file, previewUrl, localPreview, status: 'queued'|'uploading'|'success'|'failed', progress, error, upload, persisted }
 * `upload` is the successful upload DTO returned by the API.
 */
export default function ImageUploadRow({ item, onRetry, onRemove }) {
  const { file, previewUrl, status, error, persisted } = item;

  return (
    <div className={`upload-row upload-row--${status}`}>
      {previewUrl ? (
        <img src={previewUrl} alt="" className="upload-row__thumb" />
      ) : (
        <div className="upload-row__thumb upload-row__thumb--placeholder" aria-hidden="true">⌑</div>
      )}

      <div className="upload-row__body">
        <div className="upload-row__name">{file.name}</div>

        {status === 'uploading' && (
          <div className="upload-row__uploading" role="status">
            <span className="upload-row__spinner" aria-hidden="true" />
            Uploading…
          </div>
        )}

        {status === 'queued' && <div className="upload-row__status-text">Waiting to upload…</div>}
        {status === 'success' && <div className="upload-row__status-text upload-row__status-text--success">Uploaded</div>}
        {status === 'failed' && (
          <div className="upload-row__status-text upload-row__status-text--error">
            {error || 'Upload failed'}
          </div>
        )}
      </div>

      <div className="upload-row__actions">
        {status === 'failed' && (
          <button
            type="button"
            className="upload-row__icon-btn"
            onClick={() => onRetry(item.id)}
            aria-label={`Retry uploading ${file.name}`}
            title="Retry"
          >
            ↻
          </button>
        )}
        {!persisted && status !== 'uploading' && (
          <button
            type="button"
            className="upload-row__icon-btn"
            onClick={() => onRemove(item.id)}
            aria-label={`Remove ${file.name}`}
            title="Remove"
          >
            ✕
          </button>
        )}
      </div>
    </div>
  );
}
