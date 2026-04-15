/**
 * ChoreCoins – Main application component
 *
 * A Solana-devnet chore-reward tracker for families. Parents select a child,
 * click a completed chore, and the app generates a ready-to-run `spl-token
 * transfer` command. Running that command in a terminal sends SPL tokens from
 * the parent's wallet to the child's devnet wallet. Balances are read directly
 * from the Solana devnet RPC so they reflect the actual on-chain state.
 *
 * Data flow:
 *   1. Parent configures a token mint address (stored in localStorage).
 *   2. Each child has a Solana devnet public key (stored in localStorage via
 *      the `kids` state array).
 *   3. Clicking a chore opens a modal with the `spl-token transfer` command.
 *   4. After the parent runs the command, clicking "Done" records the payment
 *      locally and optimistically increments the child's displayed balance.
 *   5. A refresh button re-fetches all balances from the devnet RPC.
 */

import { useState, useEffect, useCallback } from "react";

// ─── Solana devnet helpers ───────────────────────────────────────────────────

/** Solana devnet JSON-RPC endpoint. No API key is required for devnet. */
const DEVNET_RPC = "https://api.devnet.solana.com";

/**
 * Fetches the SPL token balance for a given wallet on Solana devnet.
 *
 * Uses the `getTokenAccountsByOwner` RPC method, which returns all token
 * accounts owned by `walletAddress` that hold tokens of `mintAddress`. We
 * read the `amount` field (raw integer units, not adjusted for decimals) from
 * the first matching account.
 *
 * @param {string} walletAddress - Base58-encoded Solana public key of the owner.
 * @param {string} mintAddress   - Base58-encoded SPL token mint address.
 * @returns {Promise<number|null>} Raw token amount, 0 if no account exists, or
 *   null on network/parse error.
 */
async function fetchTokenBalance(walletAddress, mintAddress) {
  if (!walletAddress || !mintAddress) return null;
  try {
    const res = await fetch(DEVNET_RPC, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0", id: 1,
        method: "getTokenAccountsByOwner",
        params: [
          walletAddress,
          { mint: mintAddress },
          { encoding: "jsonParsed" }
        ]
      })
    });
    const data = await res.json();
    const accounts = data?.result?.value;
    if (!accounts || accounts.length === 0) return 0;
    // `amount` is a string of the raw integer balance (before decimal adjustment)
    return parseInt(accounts[0].account.data.parsed.info.tokenAmount.amount, 10);
  } catch {
    return null;
  }
}

// ─── Seed data ───────────────────────────────────────────────────────────────

/**
 * Default chore list shown on first load. Each entry defines the display name,
 * coin reward, and emoji icon shown on the chore button.
 */
const DEFAULT_CHORES = [
  { id: 1, name: "Wash dishes",        coins: 5,  icon: "🍽️" },
  { id: 2, name: "Take out trash",      coins: 3,  icon: "🗑️" },
  { id: 3, name: "Vacuum living room",  coins: 8,  icon: "🧹" },
  { id: 4, name: "Fold laundry",        coins: 6,  icon: "👕" },
  { id: 5, name: "Clean bathroom",      coins: 10, icon: "🚿" },
  { id: 6, name: "Mow the lawn",        coins: 15, icon: "🌿" },
  { id: 7, name: "Feed pets",           coins: 3,  icon: "🐾" },
  { id: 8, name: "Set the table",       coins: 2,  icon: "🥄" },
];

/**
 * Color themes for kid cards. Each palette has five roles:
 *   - bg:     card background
 *   - accent: primary highlight (balance text, active borders)
 *   - light:  avatar background / tag fill
 *   - text:   main text color
 *
 * Cards are assigned colors by index (`kids.length % COLORS.length`) so each
 * new child automatically gets a distinct color.
 */
const COLORS = [
  { bg: "#FFF3E0", accent: "#FF8C42", light: "#FFE0B2", text: "#BF360C" },
  { bg: "#E8F5E9", accent: "#4CAF50", light: "#C8E6C9", text: "#1B5E20" },
  { bg: "#E3F2FD", accent: "#2196F3", light: "#BBDEFB", text: "#0D47A1" },
  { bg: "#FCE4EC", accent: "#E91E8C", light: "#F8BBD0", text: "#880E4F" },
  { bg: "#EDE7F6", accent: "#7C4DFF", light: "#D1C4E9", text: "#311B92" },
  { bg: "#FFF8E1", accent: "#FFC107", light: "#FFECB3", text: "#FF6F00" },
];

// ─── Styles ──────────────────────────────────────────────────────────────────
// All styles are injected as a single <style> tag at render time. This keeps
// the component fully self-contained as a single .jsx file with no external
// CSS dependencies (aside from the Google Fonts import).
const css = `
  @import url('https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;800;900&family=Lilita+One&display=swap');

  * { box-sizing: border-box; margin: 0; padding: 0; }

  body {
    font-family: 'Nunito', sans-serif;
    background: #FFFBF5;
    min-height: 100vh;
  }

  .app {
    max-width: 1100px;
    margin: 0 auto;
    padding: 24px 16px 60px;
  }

  .header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 32px;
    flex-wrap: wrap;
    gap: 12px;
  }

  .logo {
    font-family: 'Lilita One', cursive;
    font-size: 2rem;
    color: #FF8C42;
    letter-spacing: -0.5px;
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .logo-sub {
    font-family: 'Nunito', sans-serif;
    font-size: 0.8rem;
    font-weight: 700;
    color: #999;
    letter-spacing: 2px;
    text-transform: uppercase;
    margin-left: 2px;
  }

  .mint-bar {
    display: flex;
    align-items: center;
    gap: 8px;
    background: white;
    border: 2px solid #FFE0B2;
    border-radius: 12px;
    padding: 8px 14px;
    flex: 1;
    max-width: 420px;
  }

  .mint-bar input {
    border: none;
    outline: none;
    font-family: 'Nunito', sans-serif;
    font-size: 0.85rem;
    color: #444;
    width: 100%;
    background: transparent;
  }

  .mint-label {
    font-size: 0.72rem;
    font-weight: 800;
    color: #FF8C42;
    text-transform: uppercase;
    letter-spacing: 1px;
    white-space: nowrap;
  }

  .section-title {
    font-family: 'Lilita One', cursive;
    font-size: 1.3rem;
    color: #333;
    margin-bottom: 16px;
    display: flex;
    align-items: center;
    gap: 8px;
  }

  /* Kids grid */
  .kids-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
    gap: 16px;
    margin-bottom: 36px;
  }

  .kid-card {
    border-radius: 20px;
    padding: 20px;
    position: relative;
    cursor: pointer;
    transition: transform 0.15s, box-shadow 0.15s;
    border: 3px solid transparent;
  }

  .kid-card:hover { transform: translateY(-3px); box-shadow: 0 8px 24px rgba(0,0,0,0.1); }
  .kid-card.selected { border-color: currentColor; box-shadow: 0 8px 24px rgba(0,0,0,0.15); }

  .kid-avatar {
    width: 52px;
    height: 52px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 1.6rem;
    margin-bottom: 10px;
  }

  .kid-name {
    font-weight: 900;
    font-size: 1.1rem;
    margin-bottom: 2px;
  }

  .kid-wallet {
    font-size: 0.7rem;
    font-weight: 600;
    opacity: 0.6;
    font-family: monospace;
    word-break: break-all;
    margin-bottom: 10px;
    cursor: text;
    text-decoration: underline dotted;
  }

  .kid-wallet-input {
    width: 100%;
    font-size: 0.7rem;
    font-family: monospace;
    font-weight: 600;
    border: 1.5px solid currentColor;
    border-radius: 6px;
    padding: 3px 6px;
    margin-bottom: 10px;
    outline: none;
    background: rgba(255,255,255,0.6);
    color: inherit;
    opacity: 0.85;
  }

  .kid-balance {
    font-family: 'Lilita One', cursive;
    font-size: 1.8rem;
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .kid-balance-label {
    font-size: 0.7rem;
    font-weight: 700;
    opacity: 0.5;
    text-transform: uppercase;
    letter-spacing: 1px;
  }

  .balance-loading {
    font-size: 0.8rem;
    opacity: 0.5;
    font-style: italic;
  }

  .add-kid-card {
    border-radius: 20px;
    border: 3px dashed #E0D6C8;
    padding: 20px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    gap: 8px;
    transition: border-color 0.15s, background 0.15s;
    min-height: 160px;
    color: #BBB;
  }

  .add-kid-card:hover { border-color: #FF8C42; color: #FF8C42; background: #FFF8F3; }

  .add-icon { font-size: 2rem; }
  .add-text { font-weight: 800; font-size: 0.9rem; }

  /* Chores */
  .chores-panel {
    background: white;
    border-radius: 24px;
    padding: 24px;
    box-shadow: 0 2px 20px rgba(0,0,0,0.06);
    margin-bottom: 36px;
  }

  .chores-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 20px;
    flex-wrap: wrap;
    gap: 10px;
  }

  .selected-kid-tag {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 14px;
    border-radius: 99px;
    font-weight: 800;
    font-size: 0.9rem;
  }

  .chores-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
    gap: 12px;
  }

  .chore-btn {
    background: #FFFBF5;
    border: 2px solid #F0E8DC;
    border-radius: 16px;
    padding: 16px;
    cursor: pointer;
    text-align: left;
    transition: all 0.15s;
    display: flex;
    align-items: center;
    gap: 12px;
    font-family: 'Nunito', sans-serif;
  }

  .chore-btn:hover { border-color: #FF8C42; background: #FFF3E8; transform: translateY(-1px); }
  .chore-btn:active { transform: scale(0.97); }
  .chore-btn.paying { opacity: 0.5; pointer-events: none; }

  .chore-icon { font-size: 1.6rem; flex-shrink: 0; }

  .chore-info { flex: 1; }
  .chore-name { font-weight: 700; font-size: 0.9rem; color: #333; margin-bottom: 2px; }
  .chore-coins { font-weight: 900; font-size: 1rem; color: #FF8C42; }

  .no-kid-msg {
    text-align: center;
    padding: 32px;
    color: #BBB;
    font-weight: 700;
    font-size: 1rem;
  }

  /* History */
  .history-panel {
    background: white;
    border-radius: 24px;
    padding: 24px;
    box-shadow: 0 2px 20px rgba(0,0,0,0.06);
  }

  .history-list { display: flex; flex-direction: column; gap: 8px; }

  .history-item {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px 16px;
    border-radius: 12px;
    background: #FAFAF8;
    font-size: 0.9rem;
  }

  .history-icon { font-size: 1.3rem; }
  .history-detail { flex: 1; }
  .history-name { font-weight: 700; color: #333; }
  .history-meta { font-size: 0.78rem; color: #999; font-weight: 600; }
  .history-amount { font-family: 'Lilita One', cursive; font-size: 1.1rem; color: #FF8C42; }

  .empty-history {
    text-align: center;
    padding: 24px;
    color: #CCC;
    font-weight: 700;
  }

  /* Modal */
  .modal-overlay {
    position: fixed; inset: 0;
    background: rgba(0,0,0,0.4);
    display: flex; align-items: center; justify-content: center;
    z-index: 100;
    padding: 16px;
  }

  .modal {
    background: white;
    border-radius: 24px;
    padding: 28px;
    width: 100%;
    max-width: 440px;
    box-shadow: 0 20px 60px rgba(0,0,0,0.2);
  }

  .modal-title {
    font-family: 'Lilita One', cursive;
    font-size: 1.4rem;
    color: #333;
    margin-bottom: 20px;
  }

  .form-group { margin-bottom: 16px; }

  .form-label {
    display: block;
    font-weight: 800;
    font-size: 0.8rem;
    color: #888;
    text-transform: uppercase;
    letter-spacing: 1px;
    margin-bottom: 6px;
  }

  .form-input {
    width: 100%;
    padding: 12px 14px;
    border: 2px solid #EEE;
    border-radius: 12px;
    font-family: 'Nunito', sans-serif;
    font-size: 0.95rem;
    font-weight: 600;
    outline: none;
    transition: border-color 0.15s;
  }

  .form-input:focus { border-color: #FF8C42; }

  .emoji-picker {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-top: 4px;
  }

  .emoji-option {
    width: 40px; height: 40px;
    border-radius: 10px;
    border: 2px solid #EEE;
    display: flex; align-items: center; justify-content: center;
    font-size: 1.3rem;
    cursor: pointer;
    transition: all 0.1s;
  }

  .emoji-option:hover, .emoji-option.selected { border-color: #FF8C42; background: #FFF3E8; }

  .modal-actions {
    display: flex;
    gap: 10px;
    margin-top: 24px;
  }

  .btn {
    flex: 1;
    padding: 12px;
    border-radius: 12px;
    border: none;
    font-family: 'Nunito', sans-serif;
    font-weight: 800;
    font-size: 0.95rem;
    cursor: pointer;
    transition: all 0.15s;
  }

  .btn-primary { background: #FF8C42; color: white; }
  .btn-primary:hover { background: #F07030; transform: translateY(-1px); }
  .btn-secondary { background: #F5F0EA; color: #888; }
  .btn-secondary:hover { background: #EDE8E0; }

  .btn-danger { background: #FFE8E8; color: #E53935; }
  .btn-danger:hover { background: #FFCDD2; }

  /* Toast */
  .toast-container {
    position: fixed;
    bottom: 24px;
    right: 24px;
    display: flex;
    flex-direction: column;
    gap: 8px;
    z-index: 200;
  }

  .toast {
    background: #333;
    color: white;
    padding: 12px 18px;
    border-radius: 14px;
    font-weight: 700;
    font-size: 0.9rem;
    display: flex;
    align-items: center;
    gap: 8px;
    box-shadow: 0 4px 20px rgba(0,0,0,0.2);
    animation: slideIn 0.2s ease;
    max-width: 300px;
  }

  .toast.success { background: #2E7D32; }
  .toast.error { background: #C62828; }

  @keyframes slideIn {
    from { transform: translateX(40px); opacity: 0; }
    to { transform: translateX(0); opacity: 1; }
  }

  .refresh-btn {
    background: none;
    border: none;
    cursor: pointer;
    font-size: 0.85rem;
    color: #FF8C42;
    font-weight: 800;
    font-family: 'Nunito', sans-serif;
    padding: 4px 8px;
    border-radius: 8px;
    transition: background 0.1s;
  }
  .refresh-btn:hover { background: #FFF3E8; }

  .cmd-label {
    font-size: 0.82rem;
    font-weight: 700;
    color: #999;
    margin-bottom: 10px;
  }

  .cmd-block {
    background: #1E1E2E;
    border-radius: 12px;
    padding: 16px;
    margin-bottom: 4px;
    overflow-x: auto;
  }

  .cmd-block code {
    font-family: 'Courier New', monospace;
    font-size: 0.8rem;
    color: #A6E3A1;
    white-space: pre;
    word-break: break-all;
  }

  .delete-kid-btn {
    position: absolute;
    top: 10px; right: 10px;
    background: none;
    border: none;
    cursor: pointer;
    font-size: 0.8rem;
    opacity: 0;
    transition: opacity 0.15s;
    padding: 4px;
    border-radius: 6px;
  }
  .kid-card:hover .delete-kid-btn { opacity: 0.4; }
  .delete-kid-btn:hover { opacity: 1 !important; background: rgba(0,0,0,0.08); }
`;

/** Emoji options available when adding or editing a child profile. */
const KID_EMOJIS = ["🧒", "👦", "👧", "🧑", "🐱", "🐶", "🦊", "🐼", "🦁", "🐸", "🐧", "🦄"];

// ─── Main App ─────────────────────────────────────────────────────────────────

/**
 * Root application component for ChoreCoins.
 *
 * Manages all application state including the list of children, the chore
 * catalog, payment history, and UI modal/toast state. No external state
 * management library is used — everything lives in React's built-in useState
 * and useEffect hooks.
 *
 * Persistence strategy:
 *   - `mint-address`   → localStorage (survives page refresh)
 *   - `chore-history`  → localStorage (last 50 entries)
 *   - Kids list        → component state only; pre-populated from VITE_ env
 *     vars at build time, then editable at runtime (not persisted to avoid
 *     storing wallet addresses in localStorage by default).
 */
export default function App() {
  // The SPL token mint address shared by all kids. Pre-populated from the
  // VITE_MINT_ADDRESS env var at build time; falls back to localStorage so
  // a manually-entered value persists across reloads.
  const [mintAddress, setMintAddress] = useState(
    () => import.meta.env.VITE_MINT_ADDRESS || localStorage.getItem("mint-address") || ""
  );

  // Each kid has: id, name, emoji avatar, Solana devnet wallet address,
  // on-chain token balance (null = not yet fetched), and a color palette index.
  const [kids, setKids] = useState([
    { id: 1, name: "Andrew Jr", emoji: "🧒", wallet: import.meta.env.VITE_WALLET_ANDREW_JR || "", balance: null, color: 0 },
    { id: 2, name: "Emily",     emoji: "👧", wallet: import.meta.env.VITE_WALLET_EMILY     || "", balance: null, color: 1 },
    { id: 3, name: "Paul",      emoji: "👦", wallet: import.meta.env.VITE_WALLET_PAUL      || "", balance: null, color: 2 },
    { id: 4, name: "Opa",       emoji: "🐼", wallet: import.meta.env.VITE_WALLET_OPA       || "", balance: null, color: 3 },
  ]);

  const [chores, setChores] = useState(DEFAULT_CHORES);

  // The `id` of the currently selected kid, or null if none is selected.
  // Clicking a chore while a kid is selected triggers the payment flow.
  const [selectedKid, setSelectedKid] = useState(null);

  // Payment history stored in localStorage. Capped at 50 entries.
  const [history, setHistory] = useState(() => {
    try { return JSON.parse(localStorage.getItem("chore-history") || "[]"); }
    catch { return []; }
  });

  // `paying` holds the chore id currently being processed (used to show a
  // loading state on the chore button). Currently set synchronously, but
  // kept for future async payment flows.
  const [paying, setPaying] = useState(null);

  // Modal visibility flags
  const [showAddKid, setShowAddKid] = useState(false);
  const [showAddChore, setShowAddChore] = useState(false);

  // Active toast notifications: [{ id, msg, type }]
  const [toasts, setToasts] = useState([]);
  const [loadingBalances, setLoadingBalances] = useState(false);

  // The kid id whose wallet address field is currently in edit mode.
  const [editingWallet, setEditingWallet] = useState(null);

  // Controlled form state for the "Add Kid" modal
  const [newKid, setNewKid] = useState({ name: "", wallet: "", emoji: "🧒" });

  // Controlled form state for the "Add Chore" modal
  const [newChore, setNewChore] = useState({ name: "", coins: 5, icon: "⭐" });

  /**
   * Pushes a transient toast notification that auto-dismisses after 3.5 s.
   *
   * @param {string} msg       - Message text to display.
   * @param {"success"|"error"} [type="success"] - Visual style of the toast.
   */
  const addToast = useCallback((msg, type = "success") => {
    const id = Date.now();
    setToasts(t => [...t, { id, msg, type }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 3500);
  }, []);

  /**
   * Re-fetches token balances for all kids from Solana devnet in parallel.
   * Kids without a wallet address are skipped and their balance is unchanged.
   */
  const refreshBalances = useCallback(async () => {
    if (!mintAddress) return;
    setLoadingBalances(true);
    const updated = await Promise.all(kids.map(async kid => {
      if (!kid.wallet) return kid;
      const bal = await fetchTokenBalance(kid.wallet, mintAddress);
      return { ...kid, balance: bal };
    }));
    setKids(updated);
    setLoadingBalances(false);
  }, [kids, mintAddress]);

  // Fetch balances once when the mint address is first set (e.g. on page load
  // when the value is restored from localStorage or an env var).
  useEffect(() => {
    if (mintAddress) refreshBalances();
  }, [mintAddress]); // eslint-disable-line react-hooks/exhaustive-deps

  // Persist payment history to localStorage whenever it changes.
  useEffect(() => {
    localStorage.setItem("chore-history", JSON.stringify(history));
  }, [history]);

  // Persist the mint address to localStorage so it survives a page refresh
  // even when no VITE_MINT_ADDRESS env var is set.
  useEffect(() => {
    localStorage.setItem("mint-address", mintAddress);
  }, [mintAddress]);

  // commandModal holds the data for the "run this CLI command" modal:
  // { command: string, chore: object, kid: object } — or null when closed.
  const [commandModal, setCommandModal] = useState(null);

  /**
   * Initiates the payment flow for a chore assigned to the selected kid.
   *
   * Validates that both a kid is selected, the kid has a wallet address, and
   * a mint address is configured. If all checks pass, it builds the
   * `spl-token transfer` CLI command string and opens the command modal.
   *
   * The `--fund-recipient` and `--allow-unfunded-recipient` flags ensure the
   * transfer succeeds even if the child's wallet has never held this token
   * before (i.e. no associated token account exists yet).
   *
   * @param {{ id: number, name: string, coins: number, icon: string }} chore
   */
  const payChore = (chore) => {
    if (!selectedKid) return;
    const kid = kids.find(k => k.id === selectedKid);
    if (!kid?.wallet) {
      addToast("Add a wallet address for this kid first", "error");
      return;
    }
    if (!mintAddress) {
      addToast("Set your token mint address first", "error");
      return;
    }
    const command = `spl-token transfer ${mintAddress} ${chore.coins} ${kid.wallet} --fund-recipient --allow-unfunded-recipient`;
    setCommandModal({ command, chore, kid });
  };

  /**
   * Called when the parent clicks "Done" in the command modal, confirming they
   * have run the CLI transfer. Records the payment in history and optimistically
   * increments the child's displayed balance without waiting for an RPC round-trip.
   */
  const confirmPayment = () => {
    const { chore, kid } = commandModal;
    const entry = {
      id: Date.now(),
      kidId: kid.id,
      kidName: kid.name,
      kidEmoji: kid.emoji,
      choreName: chore.name,
      choreIcon: chore.icon,
      coins: chore.coins,
      time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    };
    // Keep only the 50 most recent history entries to bound localStorage growth.
    setHistory(h => [entry, ...h].slice(0, 50));
    // Optimistic balance update — avoids an extra RPC call for a known delta.
    setKids(prev => prev.map(k =>
      k.id === kid.id
        ? { ...k, balance: (k.balance ?? 0) + chore.coins }
        : k
    ));
    addToast(`${chore.icon} ${kid.name} earned ${chore.coins} coins for "${chore.name}"!`);
    setCommandModal(null);
  };

  /**
   * Adds a new child to the kids list from the "Add Kid" modal form.
   * Color is assigned by cycling through the COLORS palette.
   */
  const addKid = () => {
    if (!newKid.name.trim()) return;
    const colorIdx = kids.length % COLORS.length;
    setKids(prev => [...prev, {
      id: Date.now(),
      name: newKid.name.trim(),
      emoji: newKid.emoji,
      wallet: newKid.wallet.trim(),
      balance: null,
      color: colorIdx,
    }]);
    setNewKid({ name: "", wallet: "", emoji: "🧒" });
    setShowAddKid(false);
    addToast(`👋 ${newKid.name} added!`);
  };

  /**
   * Removes a child by id. If the removed kid was selected, clears the selection.
   *
   * @param {number} id - The kid's id.
   */
  const removeKid = (id) => {
    setKids(prev => prev.filter(k => k.id !== id));
    if (selectedKid === id) setSelectedKid(null);
  };

  /**
   * Saves an edited wallet address for a kid and exits inline-edit mode.
   *
   * @param {number} id     - The kid's id.
   * @param {string} value  - The new wallet address (will be trimmed).
   */
  const saveWallet = (id, value) => {
    setKids(prev => prev.map(k => k.id === id ? { ...k, wallet: value.trim() } : k));
    setEditingWallet(null);
  };

  /**
   * Adds a new chore to the chore list from the "Add Chore" modal form.
   */
  const addChore = () => {
    if (!newChore.name.trim()) return;
    setChores(prev => [...prev, { id: Date.now(), ...newChore, name: newChore.name.trim() }]);
    setNewChore({ name: "", coins: 5, icon: "⭐" });
    setShowAddChore(false);
    addToast("✅ Chore added!");
  };

  const selectedKidObj = kids.find(k => k.id === selectedKid);

  return (
    <>
      <style>{css}</style>
      <div className="app">

        {/* Header — logo on the left, mint address input on the right */}
        <div className="header">
          <div>
            <div className="logo">🪙 ChoreCoins</div>
            <div className="logo-sub">Devnet Rewards Tracker</div>
          </div>
          <div className="mint-bar">
            <span className="mint-label">Mint</span>
            <input
              value={mintAddress}
              onChange={e => setMintAddress(e.target.value.trim())}
              placeholder="Paste your SPL token mint address…"
            />
            {mintAddress && (
              <button className="refresh-btn" onClick={refreshBalances} title="Refresh balances">
                {loadingBalances ? "⏳" : "↻"}
              </button>
            )}
          </div>
        </div>

        {/* Kids — grid of color-coded cards; click to select, hover to delete */}
        <div className="section-title">👨‍👩‍👧‍👦 Kids</div>
        <div className="kids-grid">
          {kids.map(kid => {
            const c = COLORS[kid.color % COLORS.length];
            return (
              <div
                key={kid.id}
                className={`kid-card${selectedKid === kid.id ? " selected" : ""}`}
                style={{ background: c.bg, color: c.text }}
                onClick={() => setSelectedKid(selectedKid === kid.id ? null : kid.id)}
              >
                <button className="delete-kid-btn" onClick={e => { e.stopPropagation(); removeKid(kid.id); }}>✕</button>
                <div className="kid-avatar" style={{ background: c.light }}>{kid.emoji}</div>
                <div className="kid-name">{kid.name}</div>

                {/* Wallet address: click to switch to inline edit mode */}
                {editingWallet === kid.id ? (
                  <input
                    className="kid-wallet-input"
                    defaultValue={kid.wallet}
                    autoFocus
                    placeholder="Paste wallet address…"
                    onClick={e => e.stopPropagation()}
                    onBlur={e => saveWallet(kid.id, e.target.value)}
                    onKeyDown={e => {
                      if (e.key === "Enter") saveWallet(kid.id, e.target.value);
                      if (e.key === "Escape") setEditingWallet(null);
                    }}
                  />
                ) : (
                  <div
                    className="kid-wallet"
                    title="Click to edit wallet address"
                    onClick={e => { e.stopPropagation(); setEditingWallet(kid.id); }}
                  >
                    {/* Show truncated address (first 8 + last 6 chars) for readability */}
                    {kid.wallet ? `${kid.wallet.slice(0, 8)}…${kid.wallet.slice(-6)}` : "Tap to set wallet"}
                  </div>
                )}

                <div className="kid-balance-label">Balance</div>
                {kid.balance === null
                  ? <div className="balance-loading">{kid.wallet && mintAddress ? "loading…" : "—"}</div>
                  : <div className="kid-balance" style={{ color: c.accent }}>{kid.balance} <span style={{ fontSize: "0.9rem" }}>🪙</span></div>
                }
              </div>
            );
          })}
          <div className="add-kid-card" onClick={() => setShowAddKid(true)}>
            <div className="add-icon">＋</div>
            <div className="add-text">Add Kid</div>
          </div>
        </div>

        {/* Chores — only actionable when a kid is selected */}
        <div className="chores-panel">
          <div className="chores-header">
            <div className="section-title" style={{ margin: 0 }}>📋 Chores</div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              {selectedKidObj && (
                <div className="selected-kid-tag" style={{
                  background: COLORS[selectedKidObj.color % COLORS.length].light,
                  color: COLORS[selectedKidObj.color % COLORS.length].text,
                }}>
                  {selectedKidObj.emoji} Paying {selectedKidObj.name}
                </div>
              )}
              <button className="btn btn-secondary" style={{ flex: "none", padding: "8px 16px" }} onClick={() => setShowAddChore(true)}>
                + Add Chore
              </button>
            </div>
          </div>

          {!selectedKid
            ? <div className="no-kid-msg">👆 Select a kid above to assign chores</div>
            : (
              <div className="chores-grid">
                {chores.map(chore => (
                  <button
                    key={chore.id}
                    className={`chore-btn${paying === chore.id ? " paying" : ""}`}
                    onClick={() => payChore(chore)}
                  >
                    <span className="chore-icon">{paying === chore.id ? "⏳" : chore.icon}</span>
                    <div className="chore-info">
                      <div className="chore-name">{chore.name}</div>
                      <div className="chore-coins">+{chore.coins} 🪙</div>
                    </div>
                  </button>
                ))}
              </div>
            )
          }
        </div>

        {/* Payment history — last 50 payments, newest first */}
        <div className="history-panel">
          <div className="section-title">📜 Recent Payments</div>
          {history.length === 0
            ? <div className="empty-history">No payments yet — mark a chore done to get started!</div>
            : (
              <div className="history-list">
                {history.map(item => (
                  <div key={item.id} className="history-item">
                    <span className="history-icon">{item.choreIcon}</span>
                    <div className="history-detail">
                      <div className="history-name">{item.kidEmoji} {item.kidName} — {item.choreName}</div>
                      <div className="history-meta">Today at {item.time}</div>
                    </div>
                    <div className="history-amount">+{item.coins} 🪙</div>
                  </div>
                ))}
              </div>
            )
          }
        </div>
      </div>

      {/* ── Modals ───────────────────────────────────────────────────────────── */}

      {/* Add Kid modal */}
      {showAddKid && (
        <div className="modal-overlay" onClick={() => setShowAddKid(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-title">Add a Kid</div>
            <div className="form-group">
              <label className="form-label">Name</label>
              <input className="form-input" value={newKid.name} onChange={e => setNewKid(n => ({ ...n, name: e.target.value }))} placeholder="e.g. Taylor" autoFocus />
            </div>
            <div className="form-group">
              <label className="form-label">Wallet Address (devnet)</label>
              <input className="form-input" value={newKid.wallet} onChange={e => setNewKid(n => ({ ...n, wallet: e.target.value }))} placeholder="Solana public key…" style={{ fontFamily: "monospace", fontSize: "0.82rem" }} />
            </div>
            <div className="form-group">
              <label className="form-label">Avatar</label>
              <div className="emoji-picker">
                {KID_EMOJIS.map(em => (
                  <div key={em} className={`emoji-option${newKid.emoji === em ? " selected" : ""}`} onClick={() => setNewKid(n => ({ ...n, emoji: em }))}>{em}</div>
                ))}
              </div>
            </div>
            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={() => setShowAddKid(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={addKid}>Add Kid</button>
            </div>
          </div>
        </div>
      )}

      {/* Add Chore modal */}
      {showAddChore && (
        <div className="modal-overlay" onClick={() => setShowAddChore(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-title">Add a Chore</div>
            <div className="form-group">
              <label className="form-label">Chore Name</label>
              <input className="form-input" value={newChore.name} onChange={e => setNewChore(c => ({ ...c, name: e.target.value }))} placeholder="e.g. Clean bedroom" autoFocus />
            </div>
            <div className="form-group">
              <label className="form-label">Coins to Award</label>
              <input className="form-input" type="number" min="1" max="100" value={newChore.coins} onChange={e => setNewChore(c => ({ ...c, coins: parseInt(e.target.value) || 1 }))} />
            </div>
            <div className="form-group">
              <label className="form-label">Icon</label>
              <div className="emoji-picker">
                {["⭐","🧺","🪣","🛏️","🧴","📚","🌱","🐠","🚗","🎯","🍳","🗂️"].map(em => (
                  <div key={em} className={`emoji-option${newChore.icon === em ? " selected" : ""}`} onClick={() => setNewChore(c => ({ ...c, icon: em }))}>{em}</div>
                ))}
              </div>
            </div>
            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={() => setShowAddChore(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={addChore}>Add Chore</button>
            </div>
          </div>
        </div>
      )}

      {/* Command modal — shows the spl-token CLI command to run in a terminal */}
      {commandModal && (
        <div className="modal-overlay" onClick={confirmPayment}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-title">
              {commandModal.chore.icon} Pay {commandModal.kid.emoji} {commandModal.kid.name}
            </div>
            <p className="cmd-label">Run this command in your terminal to transfer tokens:</p>
            <div className="cmd-block">
              <code>{commandModal.command}</code>
            </div>
            <div className="modal-actions">
              <button
                className="btn btn-secondary"
                onClick={() => {
                  navigator.clipboard.writeText(commandModal.command);
                  addToast("📋 Command copied!");
                }}
              >
                Copy
              </button>
              {/* "Done" confirms the transfer was executed and records the payment */}
              <button className="btn btn-primary" onClick={confirmPayment}>Done</button>
            </div>
          </div>
        </div>
      )}

      {/* Toast notifications — stacked in the bottom-right corner */}
      <div className="toast-container">
        {toasts.map(t => (
          <div key={t.id} className={`toast ${t.type}`}>{t.msg}</div>
        ))}
      </div>
    </>
  );
}
