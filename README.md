# ChoreCoins

A family chore-reward tracker that pays kids in real Solana SPL tokens on devnet. Parents select a child, click a completed chore, and the app generates a ready-to-run `spl-token transfer` command. Running that command sends tokens from the parent's wallet to the child's devnet wallet. Balances are read live from the Solana devnet RPC.

<img width="2448" height="1728" alt="ChoreCoins" src="https://github.com/user-attachments/assets/a55ab91d-9a46-46bc-9b7b-29a216e39faa" />

<img width="495" height="612" alt="ChoreCoins_login" src="https://github.com/user-attachments/assets/e77cdfc6-68da-4c7f-9033-c9fa39f9e6ec" />


---

## How it works

1. **Log in** — parents and kids each sign in with a PIN on the login screen.
2. **Select a kid** — click their card to make them active (parent view).
3. **Click a chore** — a modal appears with a pre-built `spl-token transfer` CLI command.
4. **Run the command** in your terminal to execute the on-chain transfer.
5. **Click Done** — the app records the payment locally and optimistically updates the displayed balance.
6. Use the **↻ refresh button** next to the mint address to re-fetch all balances directly from Solana devnet.
7. **Kids** can log in to see their own balance, available chores, and payment history (read-only).

---

## Architecture

```
PayForChores/
├── chore-coins.jsx        # Main React app — parent dashboard, kid view, styles
├── src/
│   ├── main.jsx           # Vite entry point — wraps <App /> in <AuthProvider>
│   ├── auth/
│   │   ├── AuthContext.jsx  # React context — exposes user, logout, setSession
│   │   └── authService.js   # PIN hashing (SHA-256), JWT sign/verify (jose), localStorage I/O
│   └── components/
│       └── LoginPage.jsx    # Full-screen login — first-run setup, parent PIN, kid picker
├── index.html             # HTML shell with a single #root div
├── vite.config.js         # Vite + React plugin configuration
└── package.json           # Dependencies (React 18, Vite 6, jose)
```

### Authentication

ChoreCoins uses a lightweight, fully client-side auth system — no backend or account signup required.

| Flow | Description |
|---|---|
| **First run** | Parent creates a PIN on the first visit; the hashed PIN is stored in `localStorage` |
| **Parent login** | PIN is hashed (SHA-256) and compared to the stored hash; on success a signed JWT (HS256, 8 h TTL) is issued via `jose` |
| **Kid login** | Kid picks their avatar, then enters their PIN (set by the parent); same JWT flow |
| **Kid view** | Kids get a read-only dashboard: their balance, the chore list, and their own payment history |
| **Parent view** | Full management view — pay chores, manage kids, set/change kid PINs |
| **Session persistence** | JWT is stored in `localStorage` and verified on page load; expired or tampered tokens are cleared automatically |

The signing secret is generated randomly on first run and stored in `localStorage`. The auth layer is designed to be replaceable with Google OAuth — see comments in `AuthContext.jsx` and `LoginPage.jsx`.

### Key design decisions

| Decision | Rationale |
|---|---|
| Single `.jsx` file for core app | Keeps the project self-contained and easy to share/fork |
| No router or state library | App is a single screen; React's built-in hooks are sufficient |
| Inline `<style>` tags | Zero CSS build step; styles ship with each component |
| `localStorage` for history, chores, and extra kids | No backend required; all data is device-local |
| Base kids seeded from env vars, extras from `localStorage` | Wallet addresses from `.env` are never overwritten by cached data; kids added in the UI persist across refreshes |
| Optimistic balance update | Avoids an RPC round-trip after every confirmed payment |
| Devnet only | No real funds at risk while kids learn about crypto |

### Solana integration

The app communicates with Solana **devnet** via the public JSON-RPC endpoint (`https://api.devnet.solana.com`). It calls `getTokenAccountsByOwner` to fetch each child's SPL token balance. No wallet adapter or signing library is needed — all token transfers are performed by the parent running the Solana CLI in a terminal.

```
Parent browser  ──(reads)──▶  Solana devnet RPC
Parent terminal ──(writes)──▶ Solana devnet (spl-token CLI)
```

---

## Prerequisites

| Tool | Purpose |
|---|---|
| [Node.js](https://nodejs.org/) ≥ 18 | Run the dev server and build |
| [Solana CLI](https://docs.solana.com/cli/install-solana-cli-tools) | Create wallets and the token mint |
| [spl-token CLI](https://spl.solana.com/token) | Mint tokens and transfer them to kids |

---

## Installation

### 1. Clone the repository

```bash
git clone https://github.com/your-username/PayForChores.git
cd PayForChores
```

### 2. Install dependencies

```bash
npm install
```

### 3. Set up Solana devnet

If you don't already have a Solana CLI wallet, create one and fund it with devnet SOL:

```bash
# Generate a new keypair (skip if you already have one)
solana-keygen new

# Point the CLI at devnet
solana config set --url devnet

# Airdrop some devnet SOL for transaction fees
solana airdrop 2
```

### 4. Create an SPL token

```bash
# Create a new token mint — copy the printed mint address
spl-token create-token

# Create a token account for your own wallet and mint initial supply
spl-token create-account <MINT_ADDRESS>
spl-token mint <MINT_ADDRESS> 10000
```

### 5. Create wallets for each kid

```bash
# Repeat for each child; save each public key
solana-keygen new --outfile ~/kid1-wallet.json
solana address -k ~/kid1-wallet.json
```

### 6. Configure environment variables

Copy the example env file and fill in your values:

```bash
cp .env.example .env
```

Edit `.env`:

```env
VITE_MINT_ADDRESS=<your token mint address>
VITE_WALLET_KID1=<kid 1 public key>
VITE_WALLET_KID2=<kid 2 public key>
# etc.
```

> **Tip:** Wallet addresses can also be entered directly in the UI — the env vars just pre-populate the fields on first load.

### 7. Update the base kids list (optional)

The five base kids are defined in the `BASE_KIDS` array in `chore-coins.jsx`. Edit their names, emojis, and env var references to match your family:

```js
{ id: 1, name: "Taylor", emoji: "🧒", wallet: import.meta.env.VITE_WALLET_KID1 || "", balance: null, color: 0 }
```

You can also skip this step entirely and add kids at runtime using the **+ Add Kid** button — those additions are saved to `localStorage` and persist across refreshes.

### 8. Start the dev server

```bash
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

---

## Building for production

```bash
npm run build      # outputs to dist/
npm run preview    # preview the production build locally
```

The output is a fully static site — serve the `dist/` folder from any static host (Netlify, Vercel, GitHub Pages, etc.).

---

## Customizing chores

You can add and remove chores at runtime using the **+ Add Chore** button in the UI — changes persist automatically in `localStorage`.

To change the *default* chores that appear on a brand-new install (or after clearing browser storage), edit the `DEFAULT_CHORES` array near the top of `chore-coins.jsx`:

```js
const DEFAULT_CHORES = [
  { id: 1, name: "Wash dishes",  coins: 5,  icon: "🍽️" },
  { id: 2, name: "Take out trash", coins: 3, icon: "🗑️" },
  // add your own...
];
```

> **Note:** `DEFAULT_CHORES` is only used on first load. Once a chore list is saved in `localStorage`, edits to `DEFAULT_CHORES` won't appear until browser storage is cleared.

## Customizing kids

The **+ Add Kid** button in the UI lets you add children at runtime — they persist across page refreshes in `localStorage`.

The five base kids (seeded from `.env` variables) are always present and their wallet addresses always come from the environment, so they are never overwritten by cached data. To change them, edit the `BASE_KIDS` array in `chore-coins.jsx` and update your `.env` accordingly.

---

## Security note

This app is intended for use on **Solana devnet only**. Devnet tokens have no real monetary value. Do not point the app at mainnet or store mainnet private keys anywhere in the project.

---

## License

MIT
