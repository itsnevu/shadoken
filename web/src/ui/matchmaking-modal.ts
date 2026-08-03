// Matchmaking Search Modal component with countdown & timeout options
import './matchmaking-modal.css';

interface MatchmakingModalOptions {
  timeoutSeconds?: number;
  onCancel: () => void;
  onTimeoutSolo: () => void;
  onRetry: () => void;
}

export function showMatchmakingModal(opts: MatchmakingModalOptions): () => void {
  const root = document.createElement('div');
  root.className = 'mm-overlay';

  const timeout = opts.timeoutSeconds ?? 8;
  let remaining = timeout;
  let isDone = false;

  root.innerHTML = `
    <div class="mm-card">
      <div class="mm-spinner-ring" id="mm-spinner"></div>
      <h3 class="mm-title" id="mm-title">Searching for Opponents...</h3>
      <p class="mm-subtitle" id="mm-sub">Matching with live ninjas in the Genesis Arena.</p>
      <div class="mm-timer" id="mm-timer">00:0${remaining}</div>
      <div class="mm-actions" id="mm-actions">
        <button class="mm-btn mm-btn--secondary" type="button" id="mm-cancel-btn">Cancel</button>
      </div>
    </div>
  `;

  document.body.appendChild(root);

  const titleEl = root.querySelector('#mm-title') as HTMLElement;
  const subEl = root.querySelector('#mm-sub') as HTMLElement;
  const timerEl = root.querySelector('#mm-timer') as HTMLElement;
  const spinnerEl = root.querySelector('#mm-spinner') as HTMLElement;
  const actionsEl = root.querySelector('#mm-actions') as HTMLElement;
  const cancelBtn = root.querySelector('#mm-cancel-btn') as HTMLButtonElement;

  cancelBtn.addEventListener('click', () => {
    cleanup();
    opts.onCancel();
  });

  const interval = setInterval(() => {
    remaining--;
    if (remaining > 0) {
      timerEl.textContent = `00:0${remaining}`;
    } else if (!isDone) {
      isDone = true;
      clearInterval(interval);
      showTimeoutState();
    }
  }, 1000);

  function showTimeoutState() {
    spinnerEl.style.display = 'none';
    timerEl.style.display = 'none';
    titleEl.textContent = 'No Opponents Found';
    subEl.textContent = 'No active ninjas found in the arena room right now. Would you like to try searching again or practice solo?';

    actionsEl.innerHTML = `
      <button class="mm-btn mm-btn--secondary" type="button" id="mm-solo-btn">Solo Practice</button>
      <button class="mm-btn mm-btn--primary" type="button" id="mm-retry-btn">Try Again</button>
    `;

    const soloBtn = actionsEl.querySelector('#mm-solo-btn') as HTMLButtonElement;
    const retryBtn = actionsEl.querySelector('#mm-retry-btn') as HTMLButtonElement;

    soloBtn.addEventListener('click', () => {
      cleanup();
      opts.onTimeoutSolo();
    });

    retryBtn.addEventListener('click', () => {
      cleanup();
      opts.onRetry();
    });
  }

  function cleanup() {
    clearInterval(interval);
    if (document.body.contains(root)) {
      document.body.removeChild(root);
    }
  }

  return cleanup;
}
