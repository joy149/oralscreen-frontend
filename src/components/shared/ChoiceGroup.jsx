import './ChoiceGroup.css';

/**
 * A segmented Yes/No control for reported clinical facts.
 *
 * Replaces the toggle switches this form used to use. A switch carries a
 * settings affordance ("turn this on"), which is the wrong mental model for
 * reporting a symptom, and it collapses "no" and "not answered" into the same
 * off state — a distinction that matters to the reviewing dentist.
 *
 * `value` is `true`, `false`, or `null` when the patient hasn't answered.
 */
export default function ChoiceGroup({ id, label, hint, value, onChange }) {
  return (
    <div className="choice-group" role="group" aria-labelledby={`${id}-label`}>
      <div className="choice-group__text">
        <span className="choice-group__label" id={`${id}-label`}>{label}</span>
        {hint && <span className="choice-group__hint">{hint}</span>}
      </div>

      <div className="choice-group__options">
        <button
          type="button"
          className={`choice-group__option${value === false ? ' is-selected' : ''}`}
          aria-pressed={value === false}
          onClick={() => onChange(false)}
        >
          No
        </button>
        <button
          type="button"
          className={`choice-group__option choice-group__option--yes${value === true ? ' is-selected' : ''}`}
          aria-pressed={value === true}
          onClick={() => onChange(true)}
        >
          Yes
        </button>
      </div>
    </div>
  );
}
