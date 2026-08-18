import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import ImageUploadRow from './ImageUploadRow';

function makeItem(overrides = {}) {
  return {
    id: 'i1',
    file: { name: 'lesion.jpg' },
    previewUrl: 'blob:preview',
    status: 'queued',
    progress: 0,
    persisted: false,
    ...overrides,
  };
}

function setup(itemOverrides = {}) {
  const onRetry = vi.fn();
  const onRemove = vi.fn();
  const utils = render(
    <ImageUploadRow item={makeItem(itemOverrides)} onRetry={onRetry} onRemove={onRemove} />
  );
  return { onRetry, onRemove, ...utils };
}

describe('ImageUploadRow', () => {
  it('shows the file name', () => {
    setup();

    expect(screen.getByText('lesion.jpg')).toBeInTheDocument();
  });

  it('renders the local preview with an empty alt — the name beside it is the label', () => {
    const { container } = setup();

    const img = container.querySelector('img');
    expect(img).toHaveAttribute('src', 'blob:preview');
    expect(img).toHaveAttribute('alt', '');
  });

  it('falls back to a placeholder tile when there is no preview', () => {
    const { container } = setup({ previewUrl: null });

    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('.upload-row__thumb--placeholder')).toBeInTheDocument();
  });

  it('carries the status as a class so each state is styleable', () => {
    const { container } = setup({ status: 'uploading' });

    expect(container.firstChild).toHaveClass('upload-row--uploading');
  });
});

describe('status text', () => {
  it('says it is waiting while queued', () => {
    setup({ status: 'queued' });

    expect(screen.getByText('Waiting to upload…')).toBeInTheDocument();
  });

  it('announces the upload in progress', () => {
    setup({ status: 'uploading' });

    expect(screen.getByRole('status')).toHaveTextContent('Uploading…');
  });

  it('confirms a completed upload', () => {
    setup({ status: 'success' });

    expect(screen.getByText('Uploaded')).toBeInTheDocument();
  });

  it('shows the server error message on failure', () => {
    setup({ status: 'failed', error: 'File too large' });

    expect(screen.getByText('File too large')).toBeInTheDocument();
  });

  it('falls back to generic copy when a failure carries no message', () => {
    setup({ status: 'failed' });

    expect(screen.getByText('Upload failed')).toBeInTheDocument();
  });
});

describe('actions', () => {
  it('offers retry only after a failure, labelled with the file name', async () => {
    const user = userEvent.setup();
    const { onRetry } = setup({ status: 'failed' });

    const retry = screen.getByRole('button', { name: 'Retry uploading lesion.jpg' });
    await user.click(retry);

    expect(onRetry).toHaveBeenCalledWith('i1');
  });

  it('offers no retry while queued, uploading or successful', () => {
    const { rerender } = render(
      <ImageUploadRow item={makeItem({ status: 'queued' })} onRetry={vi.fn()} onRemove={vi.fn()} />
    );
    expect(screen.queryByRole('button', { name: /Retry/ })).not.toBeInTheDocument();

    rerender(
      <ImageUploadRow item={makeItem({ status: 'success' })} onRetry={vi.fn()} onRemove={vi.fn()} />
    );
    expect(screen.queryByRole('button', { name: /Retry/ })).not.toBeInTheDocument();
  });

  it('offers remove, labelled with the file name', async () => {
    const user = userEvent.setup();
    const { onRemove } = setup({ status: 'queued' });

    await user.click(screen.getByRole('button', { name: 'Remove lesion.jpg' }));

    expect(onRemove).toHaveBeenCalledWith('i1');
  });

  it('hides remove mid-upload — there is a request in flight', () => {
    setup({ status: 'uploading' });

    expect(screen.queryByRole('button', { name: /Remove/ })).not.toBeInTheDocument();
  });

  it('hides remove once the image is persisted server-side', () => {
    setup({ status: 'success', persisted: true });

    expect(screen.queryByRole('button', { name: /Remove/ })).not.toBeInTheDocument();
  });

  it('still offers retry for a persisted-but-failed row', () => {
    setup({ status: 'failed', persisted: true });

    expect(screen.getByRole('button', { name: /Retry/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Remove/ })).not.toBeInTheDocument();
  });
});
