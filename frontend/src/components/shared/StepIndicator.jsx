import { Icon } from './Icon';
import './StepIndicator.css';

/**
 * Horizontal progress indicator for multi-step flows.
 * @param {string[]} steps - ordered step labels
 * @param {number} currentStep - zero-based index of the active step
 */
export function StepIndicator({ steps = [], currentStep = 0 }) {
  return (
    <ol className="qf-steps" aria-label="Progress">
      {steps.map((label, index) => {
        const state = index < currentStep ? 'done' : index === currentStep ? 'active' : 'upcoming';
        return (
          <li key={label} className={`qf-steps__item qf-steps__item--${state}`} aria-current={index === currentStep ? 'step' : undefined}>
            <span className="qf-steps__marker">
              {state === 'done' ? <Icon name="check" size={13} /> : index + 1}
            </span>
            <span className="qf-steps__label">{label}</span>
          </li>
        );
      })}
    </ol>
  );
}
