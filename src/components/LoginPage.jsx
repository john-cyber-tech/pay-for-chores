/**
 * LoginPage.jsx
 *
 * Full-screen login UI. Handles three flows:
 *   1. First run  — no parent PIN exists yet; guides the parent through setup.
 *   2. Parent login — PIN entry for the parent.
 *   3. Kid login    — kid picks their avatar from a grid, then enters their PIN.
 *
 * To swap in Google OAuth later:
 *   - Add a "Sign in with Google" button in the parent flow.
 *   - On OAuth callback, call setSession({ role: 'parent', name: '...' }).
 *   - The kid PIN flow can stay as-is (no Google account needed for kids).
 */

import { useState } from 'react';
import {
  isFirstRun,
  setupParentPin,
  loginAsParent,
  loginAsKid,
  kidHasPin,
} from '../auth/authService.js';
import { useAuth } from '../auth/AuthContext.jsx';

// ─── Styles ──────────────────────────────────────────────────────────────────

const css = `
  @import url('https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;800;900&family=Lilita+One&display=swap');

  .login-page {
    min-height: 100vh;
    background: linear-gradient(135deg, #FFF8F0 0%, #FFF3E0 50%, #FFF8F0 100%);
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: 'Nunito', sans-serif;
    padding: 24px;
  }

  .login-card {
    background: white;
    border-radius: 28px;
    padding: 40px 36px;
    width: 100%;
    max-width: 440px;
    box-shadow: 0 24px 64px rgba(0,0,0,0.12);
  }

  .login-logo {
    font-family: 'Lilita One', cursive;
    font-size: 2rem;
    color: #FF8C42;
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 4px;
  }

  .login-logo-sub {
    font-size: 0.72rem;
    font-weight: 800;
    color: #BBB;
    letter-spacing: 2px;
    text-transform: uppercase;
    margin-bottom: 32px;
    margin-left: 2px;
  }

  .login-heading {
    font-family: 'Lilita One', cursive;
    font-size: 1.35rem;
    color: #333;
    margin-bottom: 6px;
  }

  .login-sub {
    font-size: 0.88rem;
    color: #999;
    font-weight: 600;
    margin-bottom: 28px;
  }

  .role-tabs {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
    margin-bottom: 28px;
  }

  .role-tab {
    padding: 14px;
    border-radius: 14px;
    border: 2.5px solid #EEE;
    background: white;
    cursor: pointer;
    font-family: 'Nunito', sans-serif;
    font-weight: 800;
    font-size: 0.95rem;
    color: #999;
    text-align: center;
    transition: all 0.15s;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
  }

  .role-tab .tab-icon { font-size: 1.6rem; }
  .role-tab:hover { border-color: #FF8C42; color: #FF8C42; }
  .role-tab.active { border-color: #FF8C42; background: #FFF3E8; color: #FF8C42; }

  .login-label {
    display: block;
    font-weight: 800;
    font-size: 0.78rem;
    color: #AAA;
    text-transform: uppercase;
    letter-spacing: 1px;
    margin-bottom: 8px;
  }

  .login-input {
    width: 100%;
    padding: 14px 16px;
    border: 2.5px solid #EEE;
    border-radius: 14px;
    font-family: 'Nunito', sans-serif;
    font-size: 1rem;
    font-weight: 700;
    outline: none;
    transition: border-color 0.15s;
    margin-bottom: 20px;
    letter-spacing: 0.1em;
  }

  .login-input:focus { border-color: #FF8C42; }

  .login-btn {
    width: 100%;
    padding: 15px;
    background: #FF8C42;
    color: white;
    border: none;
    border-radius: 14px;
    font-family: 'Nunito', sans-serif;
    font-weight: 900;
    font-size: 1rem;
    cursor: pointer;
    transition: all 0.15s;
    margin-top: 4px;
  }

  .login-btn:hover { background: #F07030; transform: translateY(-1px); }
  .login-btn:active { transform: scale(0.98); }
  .login-btn:disabled { background: #DDD; color: #AAA; cursor: not-allowed; transform: none; }

  .login-error {
    background: #FFF0F0;
    border: 2px solid #FFCDD2;
    border-radius: 12px;
    color: #C62828;
    font-weight: 700;
    font-size: 0.88rem;
    padding: 12px 16px;
    margin-bottom: 16px;
    text-align: center;
  }

  .login-info {
    background: #FFF8F0;
    border: 2px solid #FFE0B2;
    border-radius: 12px;
    color: #E65100;
    font-weight: 700;
    font-size: 0.88rem;
    padding: 12px 16px;
    margin-bottom: 16px;
    text-align: center;
  }

  /* Kid picker */
  .kid-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(110px, 1fr));
    gap: 10px;
    margin-bottom: 24px;
  }

  .kid-pick-btn {
    border: 2.5px solid #EEE;
    border-radius: 16px;
    padding: 14px 8px;
    background: white;
    cursor: pointer;
    text-align: center;
    transition: all 0.15s;
    font-family: 'Nunito', sans-serif;
  }

  .kid-pick-btn:hover { border-color: #FF8C42; background: #FFF8F3; }
  .kid-pick-btn.selected { border-color: #FF8C42; background: #FFF3E8; }

  .kid-pick-emoji { font-size: 2rem; margin-bottom: 4px; }
  .kid-pick-name { font-weight: 800; font-size: 0.85rem; color: #444; }
  .kid-pick-npin { font-size: 0.7rem; color: #CCC; font-weight: 700; }

  .back-link {
    background: none;
    border: none;
    font-family: 'Nunito', sans-serif;
    font-weight: 800;
    font-size: 0.88rem;
    color: #BBB;
    cursor: pointer;
    padding: 0;
    margin-bottom: 20px;
    display: flex;
    align-items: center;
    gap: 4px;
  }
  .back-link:hover { color: #888; }

  .divider {
    text-align: center;
    color: #DDD;
    font-weight: 700;
    font-size: 0.82rem;
    margin: 20px 0;
    position: relative;
  }
  .divider::before, .divider::after {
    content: '';
    position: absolute;
    top: 50%;
    width: 40%;
    height: 1px;
    background: #EEE;
  }
  .divider::before { left: 0; }
  .divider::after { right: 0; }
`;

// ─── Component ────────────────────────────────────────────────────────────────

/**
 * @param {{ kids: Array<{ id, name, emoji }> }} props
 */
export default function LoginPage({ kids }) {
  const { setSession } = useAuth();

  // 'parent' | 'kid'
  const [role, setRole] = useState('parent');

  // Kid flow: null = picking kid, number = kid selected, showing PIN entry
  const [selectedKid, setSelectedKid] = useState(null);

  const [pin, setPin]           = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [error, setError]       = useState('');
  const [busy, setBusy]         = useState(false);

  // First-run setup: parent needs to create their PIN
  const firstRun = isFirstRun();

  const clearError = () => setError('');

  // ── Parent flow ────────────────────────────────────────────────────────────

  const handleParentSetup = async () => {
    if (pin.length < 4) return setError('PIN must be at least 4 characters.');
    if (pin !== confirmPin) return setError('PINs do not match.');
    setBusy(true);
    await setupParentPin(pin);
    setSession({ role: 'parent', name: 'Parent' });
    setBusy(false);
  };

  const handleParentLogin = async () => {
    if (!pin) return setError('Enter your PIN.');
    setBusy(true);
    const ok = await loginAsParent(pin);
    if (ok) {
      setSession({ role: 'parent', name: 'Parent' });
    } else {
      setError('Wrong PIN. Try again.');
    }
    setBusy(false);
  };

  // ── Kid flow ───────────────────────────────────────────────────────────────

  const handleKidLogin = async () => {
    if (!pin) return setError('Enter your PIN.');
    setBusy(true);
    const kid = kids.find(k => k.id === selectedKid);
    const ok = await loginAsKid(selectedKid, kid.name, pin);
    if (ok) {
      setSession({ role: 'kid', kidId: selectedKid, name: kid.name });
    } else {
      setError('Wrong PIN. Ask a parent if you forgot it.');
    }
    setBusy(false);
  };

  const selectKid = (kid) => {
    if (!kidHasPin(kid.id)) {
      setError(`${kid.name} doesn't have a PIN yet. Ask a parent to set one.`);
      return;
    }
    clearError();
    setPin('');
    setSelectedKid(kid.id);
  };

  const backToKidPicker = () => {
    setSelectedKid(null);
    setPin('');
    clearError();
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  const renderParentForm = () => {
    if (firstRun) {
      return (
        <>
          <div className="login-heading">Welcome to ChoreCoins!</div>
          <div className="login-sub">Set a PIN to secure the parent account.</div>
          <label className="login-label">Create PIN</label>
          <input
            className="login-input"
            type="password"
            inputMode="numeric"
            placeholder="Min. 4 characters"
            value={pin}
            onChange={e => { setPin(e.target.value); clearError(); }}
            onKeyDown={e => e.key === 'Enter' && handleParentSetup()}
            autoFocus
          />
          <label className="login-label">Confirm PIN</label>
          <input
            className="login-input"
            type="password"
            inputMode="numeric"
            placeholder="Repeat PIN"
            value={confirmPin}
            onChange={e => { setConfirmPin(e.target.value); clearError(); }}
            onKeyDown={e => e.key === 'Enter' && handleParentSetup()}
          />
          {error && <div className="login-error">{error}</div>}
          <button className="login-btn" onClick={handleParentSetup} disabled={busy}>
            {busy ? 'Setting up…' : 'Create PIN & Get Started'}
          </button>
        </>
      );
    }

    return (
      <>
        <div className="login-heading">Welcome back!</div>
        <div className="login-sub">Enter your parent PIN to continue.</div>
        <label className="login-label">PIN</label>
        <input
          className="login-input"
          type="password"
          inputMode="numeric"
          placeholder="Enter your PIN"
          value={pin}
          onChange={e => { setPin(e.target.value); clearError(); }}
          onKeyDown={e => e.key === 'Enter' && handleParentLogin()}
          autoFocus
        />
        {error && <div className="login-error">{error}</div>}
        <button className="login-btn" onClick={handleParentLogin} disabled={busy}>
          {busy ? 'Checking…' : 'Log In'}
        </button>
      </>
    );
  };

  const renderKidForm = () => {
    // Step 2: PIN entry for selected kid
    if (selectedKid !== null) {
      const kid = kids.find(k => k.id === selectedKid);
      return (
        <>
          <button className="back-link" onClick={backToKidPicker}>← Back</button>
          <div className="login-heading">{kid.emoji} Hey, {kid.name}!</div>
          <div className="login-sub">Enter your PIN to log in.</div>
          <label className="login-label">PIN</label>
          <input
            className="login-input"
            type="password"
            inputMode="numeric"
            placeholder="Enter your PIN"
            value={pin}
            onChange={e => { setPin(e.target.value); clearError(); }}
            onKeyDown={e => e.key === 'Enter' && handleKidLogin()}
            autoFocus
          />
          {error && <div className="login-error">{error}</div>}
          <button className="login-btn" onClick={handleKidLogin} disabled={busy}>
            {busy ? 'Checking…' : 'Log In'}
          </button>
        </>
      );
    }

    // Step 1: Kid picker grid
    return (
      <>
        <div className="login-heading">Who are you?</div>
        <div className="login-sub">Pick your name to log in.</div>
        {error && <div className="login-error">{error}</div>}
        <div className="kid-grid">
          {kids.map(kid => (
            <button
              key={kid.id}
              className="kid-pick-btn"
              onClick={() => selectKid(kid)}
            >
              <div className="kid-pick-emoji">{kid.emoji}</div>
              <div className="kid-pick-name">{kid.name}</div>
              {!kidHasPin(kid.id) && (
                <div className="kid-pick-npin">No PIN set</div>
              )}
            </button>
          ))}
        </div>
      </>
    );
  };

  const handleRoleChange = (r) => {
    setRole(r);
    setSelectedKid(null);
    setPin('');
    setConfirmPin('');
    clearError();
  };

  return (
    <>
      <style>{css}</style>
      <div className="login-page">
        <div className="login-card">
          <div className="login-logo">🪙 ChoreCoins</div>
          <div className="login-logo-sub">Devnet Rewards Tracker</div>

          {/* Role selector — hidden during first-run setup */}
          {!firstRun && (
            <div className="role-tabs">
              <button
                className={`role-tab${role === 'parent' ? ' active' : ''}`}
                onClick={() => handleRoleChange('parent')}
              >
                <span className="tab-icon">👨‍👧‍👦</span>
                Parent
              </button>
              <button
                className={`role-tab${role === 'kid' ? ' active' : ''}`}
                onClick={() => handleRoleChange('kid')}
              >
                <span className="tab-icon">🧒</span>
                Kid
              </button>
            </div>
          )}

          {role === 'parent' ? renderParentForm() : renderKidForm()}
        </div>
      </div>
    </>
  );
}
