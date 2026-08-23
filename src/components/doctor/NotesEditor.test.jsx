import { useState } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import NotesEditor from './NotesEditor';

/* jsdom has no document.execCommand, so every edit here falls through to the
   controlled-value path. That is the branch worth pinning anyway: the toolbar
   has to produce the right plain text whether or not the browser gives us an
   undoable insert. */
function Harness({ initial = '' }) {
  const [value, setValue] = useState(initial);
  return (
    <NotesEditor
      id="notes"
      value={value}
      onChange={setValue}
      placeholder="Add your observations or follow-up recommendation"
    />
  );
}

function editor() {
  return screen.getByRole('textbox');
}

describe('NotesEditor', () => {
  it('appends a quick phrase on its own line', async () => {
    const user = userEvent.setup();
    render(<Harness initial="Ulcer reviewed." />);

    await user.click(screen.getByRole('button', { name: /Refer to Oral Medicine/ }));

    await waitFor(() => {
      expect(editor()).toHaveValue('Ulcer reviewed.\nRefer to Oral Medicine.');
    });
  });

  it('does not open with a blank first line when the note is empty', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(screen.getByRole('button', { name: /Biopsy recommended/ }));

    await waitFor(() => expect(editor()).toHaveValue('Biopsy recommended.'));
  });

  it('bullets every line the selection touches', async () => {
    const user = userEvent.setup();
    render(<Harness initial={'Margins clean\nNo induration'} />);

    editor().setSelectionRange(0, editor().value.length);
    await user.click(screen.getByRole('button', { name: 'Bullet list' }));

    await waitFor(() => {
      expect(editor()).toHaveValue('• Margins clean\n• No induration');
    });
  });

  it('renumbers when a bulleted note is switched to an ordered list', async () => {
    const user = userEvent.setup();
    render(<Harness initial={'• Margins clean\n• No induration'} />);

    editor().setSelectionRange(0, editor().value.length);
    await user.click(screen.getByRole('button', { name: 'Numbered list' }));

    await waitFor(() => {
      expect(editor()).toHaveValue('1. Margins clean\n2. No induration');
    });
  });

  it('strips the markers when the same list button is pressed again', async () => {
    const user = userEvent.setup();
    render(<Harness initial={'• Margins clean\n• No induration'} />);

    editor().setSelectionRange(0, editor().value.length);
    await user.click(screen.getByRole('button', { name: 'Bullet list' }));

    await waitFor(() => {
      expect(editor()).toHaveValue('Margins clean\nNo induration');
    });
  });

  it('leaves blank lines alone when listing a block', async () => {
    const user = userEvent.setup();
    render(<Harness initial={'Margins clean\n\nNo induration'} />);

    editor().setSelectionRange(0, editor().value.length);
    await user.click(screen.getByRole('button', { name: 'Numbered list' }));

    await waitFor(() => {
      expect(editor()).toHaveValue('1. Margins clean\n\n2. No induration');
    });
  });

  it('continues the list on Enter', async () => {
    const user = userEvent.setup();
    render(<Harness initial="• Margins clean" />);

    editor().focus();
    editor().setSelectionRange(15, 15);
    await user.keyboard('{Enter}');

    await waitFor(() => expect(editor()).toHaveValue('• Margins clean\n• '));
  });

  it('increments the marker when continuing an ordered list', async () => {
    const user = userEvent.setup();
    render(<Harness initial={'1. Margins clean\n2. No induration'} />);

    editor().focus();
    editor().setSelectionRange(33, 33);
    await user.keyboard('{Enter}');

    await waitFor(() => {
      expect(editor()).toHaveValue('1. Margins clean\n2. No induration\n3. ');
    });
  });

  it('ends the list when Enter is pressed on an empty item', async () => {
    const user = userEvent.setup();
    render(<Harness initial={'• Margins clean\n• '} />);

    editor().focus();
    editor().setSelectionRange(18, 18);
    await user.keyboard('{Enter}');

    await waitFor(() => expect(editor()).toHaveValue('• Margins clean\n'));
  });

  it('leaves Enter alone outside a list', async () => {
    const user = userEvent.setup();
    render(<Harness initial="Margins clean" />);

    editor().focus();
    editor().setSelectionRange(13, 13);
    await user.keyboard('{Enter}');

    await waitFor(() => expect(editor()).toHaveValue('Margins clean\n'));
  });

  /* The note is submitted with Cmd/Ctrl+Enter from DoctorCase, so the editor
     must not swallow that into a list marker. */
  it('ignores Enter held with a modifier', async () => {
    const user = userEvent.setup();
    render(<Harness initial="• Margins clean" />);

    editor().focus();
    editor().setSelectionRange(15, 15);
    await user.keyboard('{Meta>}{Enter}{/Meta}');

    // Whatever the browser does with the keystroke itself, no marker is added.
    expect(editor().value).not.toContain('\n•');
  });

  it('counts the trimmed note', () => {
    render(<Harness initial="  Margins clean  " />);

    expect(screen.getByText('13 characters')).toBeInTheDocument();
  });

  it('describes the textarea with the shortcut hint', () => {
    render(<Harness />);

    expect(editor()).toHaveAccessibleDescription(/Enter continues a list/);
  });
});
