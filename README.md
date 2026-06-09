# Avocado Integration Documentation

Avocado is a user-friendly platform designed to facilitate seamless web3 interactions by providing network, gas, and account abstraction features.

Avocado Application: https://avocado.instadapp.io/

Beginner's Guide: https://help.avocado.instadapp.io/en/articles/7038838-a-checklist-to-get-started-with-avocado

Avocado Network Specifications:
- RPC URL: https://rpc.avocado.instadapp.io/
- Native Token: USDC
- Chain ID: 634
- Avocado Factory Address: https://blockscan.com/address/0x3AdAE9699029AB2953F607AE1f62372681D35978
- USDC Deposit Address: 0xE8385fB3A5F15dED06EB5E20E5A81BF43115eb8E (Compatible with the chains listed below)
- Supported Chains:
  - Ethereum Mainnet
  - Polygon PoS
  - Avalanche C-Chain
  - Binance Smart Chain
  - Gnosis Chain
  - Arbitrum
  - Optimism
  - Polygon zkEVM
  - Fantom

Help Center: https://help.avocado.instadapp.io/en/

## Installation:

Avocado SDK: https://github.com/Instadapp/avocado-sdk

To install `@instadapp/avocado`, execute one of the following commands in your terminal:

```bash
# npm
npm install @instadapp/avocado

# yarn
yarn add @instadapp/avocado

# pnpm
pnpm install @instadapp/avocado
```

## Connection via MetaMask

Requirements:
- Users must be connected to the Avocado Network to sign transaction data messages.
- `ethersjs` is preferred over `web3js` for compatibility reasons.

## Retrieve Avocado Safe Address

```javascript
import { createSafe } from '@instadapp/avocado'

// Should be connected to chainId 634 (https://rpc.avocado.instadapp.io), before doing any transaction
const provider = new ethers.providers.Web3Provider(window.ethereum, "any")

const safe = createSafe(provider.getSigner())

// Getting User's AvoSafe address
const safeOwner = await safe.getOwnerAddress()
```

## Send Transaction to Avocado:

```javascript
import { createSafe } from '@instadapp/avocado'

// Should be connected to chainId 634 (https://rpc.avocado.instadapp.io), before doing any transaction
const provider = new ethers.providers.Web3Provider(window.ethereum, "any")

const safe = createSafe( provider.getSigner() )

// Sending 0.1 ETH to Vitalk 
const tx = await safe.sendTransaction({
    to: "0xd8da6bf26964af9d7eed9e03e53415d37aa96045",
    value: 1e18,
    chainId: 1
})
```

Note: The underlying `chainId` can be included with the transaction data.

> This will trigger the user to sign a EIP-712 based tx message data, which is then used to execute the actions on the chain via the Avocado network

## Send Transaction to Avocado (Reveune Sharing Program):

```javascript
import { createSafe } from '@instadapp/avocado'

// Should be connected to chainId 634 (https://rpc.avocado.instadapp.io), before doing any transaction
const provider = new ethers.providers.Web3Provider(window.ethereum, "any")

const safe = createSafe( provider.getSigner() )

const referralAddress = "0x_____" // Default: "0x000000000000000000000000000000000000Cad0" // If Source address is passed, then 10% of the transaction fee shared with referral address. 

// Sending 0.1 ETH to Vitalk 
const tx = await safe.sendTransaction({
    to: "0xd8da6bf26964af9d7eed9e03e53415d37aa96045",
    value: 1e18,
    chainId: 1
}, { source: referralAddress })
```

Note: Currently, withdrawal for source/referral is not live yet.


## Top-up USDC Gas Balance:

```javascript
import { createSafe } from '@instadapp/avocado'

// Should be connected to chainId 634 (https://rpc.avocado.instadapp.io), before doing any transaction
const provider = new ethers.providers.Web3Provider(window.ethereum, "any")

const safe = createSafe(provider.getSigner())

const USDC_DEPOSIT_ADDRESS = "0xE8385fB3A5F15dED06EB5E20E5A81BF43115eb8E"

// Top-up USDC gas
cosnt tx = await safe.sendTransaction({
    to: USDC_ADDRESS_UNDERLYING_CHAIN, // USDC Token address on mainnet
    data: ERC20.populateTransaction.transfer(USDC_DEPOSIT_ADDRESS, USDC_GAS_AMOUNT)
    value: 0,
    chainId: 1 // Underlying chainId - Mainnet
})
```

Important: 
- Top-up USDC can be conducted on any chain supported by Avocado.
- Transfer of USDC gas must be initiated from the Avocado Safe only.
- On Avalanche, USDC is utilized as gas, not USDC.e.

## Retrieve USDC Gas Balance:

```javascript
import { createSafe } from '@instadapp/avocado'

// Should be connected to chainId 634 (https://rpc.avocado.instadapp.io), before doing any transaction
const provider = new ethers.providers.Web3Provider(window.ethereum, "any")

const safe = createSafe(provider.getSigner())

const safeAddress = await await safe.getSafeAddress()

const usdcGasBalance = await provider.getBalance(safeAddress)
```

Additional Examples: https://github.com/Instadapp/avocado-sdk#examples

Technical Architecture:

<img width="1162" alt="image" src="https://user-images.githubusercontent.com/22830915/233698682-d301cf8a-6594-4053-8a9e-a985687c8410.png">

## No-code Base arbitrage spell agent

This repo also includes a beginner-friendly agent script that follows the README flow:

- connect the owner wallet to Avocado Network RPC
- initialize the Avocado Safe on chain ID `634`
- scan Base routes for a USDC -> WETH -> USDC arbitrage cycle
- encode a Base chain flashloan spell only if the route can repay and meet the profit threshold
- sign the Avocado EIP-712 message
- optionally broadcast the signed spell

The script is intentionally safe by default. It scans and prepares a signed spell only when it finds a profitable route. It will not broadcast unless you run the cast command or set `BROADCAST_AVOCADO_TX=true`.

### 1. Install packages

```bash
npm install
```

### 2. Create your private local `.env`

```bash
cp .env.example .env
```

Open `.env` and paste your values:

```bash
AVOCADO_OWNER_PRIVATE_KEY=0xYOUR_PRIVATE_KEY_HERE
BASE_RPC_URL=https://mainnet.base.org
POLYGON_RPC_URL=https://polygon-bor-rpc.publicnode.com
```

Optional defaults:

```bash
FLASHLOAN_AMOUNTS_USDC=1000
FLASHLOAN_ROUTE=0
FLASHLOAN_PREMIUM_BPS=0
MIN_PROFIT_USDC=1
SLIPPAGE_BPS=10
```

`FLASHLOAN_PREMIUM_BPS=0` represents the fee-free repayment assumption. If your selected Instadapp route charges a premium, set that value before casting.

`FLASHLOAN_AMOUNTS_USDC` can be a comma-separated list such as `500,1000,2500`. The agent checks each size and picks the best profitable route it can find.

### 3. Scan, prepare, and sign the spell

```bash
npm run avocado:prepare
```

This prints:

- Avocado owner address
- Avocado Safe address
- Base flashloan aggregator
- selected route and estimated profit
- encoded Avocado EIP-712 message
- owner signature

If no profitable route is found, the agent does not sign or broadcast anything.

### 4. Broadcast

```bash
npm run avocado:cast
```

The cast command scans again immediately before broadcasting. If the route is no longer profitable, it exits without sending a transaction.

