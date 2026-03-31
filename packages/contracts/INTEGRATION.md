# Contract Integration Guide

## Deployed Addresses (Ink, Chain 57073)

| Contract | Address |
|----------|---------|
| STRC (STRCx) | `0x1aad217b8f78dba5e6693460e8470f8b1a3977f3` |
| wSTRC | `0x3b172e9c5488B17A0F4dc6fF4dc798055CC77281` |
| USDC | `0x2D270e6886d130D724215A266106e6832161EAEd` |
| Morpho Blue | `0x857f3EefE8cbda3Bc49367C996cd664A880d3042` |
| Oracle Adapter | `0x7c415289c073C2Da7CCC071bb5f83eb1BC20cd88` |
| IRM | `0x9515407b1512F53388ffE699524100e7270Ee57B` |
| Market ID | `0x8f6385fda560540caa3ba0eca12a398f9265cd5233513985153d076e7774f3f0` |
| LLTV | `860000000000000000` (86%) |
| CoW Settlement | `0x9008d19f58aabd9ed0d60971565aa8510560ab41` |
| CoW VaultRelayer | `0xc92e8bdf79f0507f65a392b0ab4667716bfe0110` |
| Pyth | `0x2880aB155794e7179c9eE2e38200202908C17B43` |

## RPC

```
https://rpc-qnd.inkonchain.com
```

## ethers.js v6 Examples

### Read wSTRC Exchange Rate

```typescript
import { ethers } from 'ethers';

const provider = new ethers.JsonRpcProvider('https://rpc-qnd.inkonchain.com');
const wstrc = new ethers.Contract('0x3b172e9c5488B17A0F4dc6fF4dc798055CC77281', [
  'function strcPerWstrc() external view returns (uint256)',
  'function wstrcToStrc(uint256) external view returns (uint256)',
  'function strcToWstrc(uint256) external view returns (uint256)',
], provider);

const rate = await wstrc.strcPerWstrc(); // 1e18 = 1:1
console.log('Exchange rate:', ethers.formatEther(rate), 'STRC per wSTRC');
```

### Wrap STRC → wSTRC

```typescript
const strc = new ethers.Contract('0x1aad217b8f78dba5e6693460e8470f8b1a3977f3', [
  'function approve(address,uint256) returns (bool)',
], signer);

const wstrc = new ethers.Contract('0x3b172e9c5488B17A0F4dc6fF4dc798055CC77281', [
  'function wrap(uint256) returns (uint256)',
  'function unwrap(uint256) returns (uint256)',
], signer);

const amount = ethers.parseEther('100'); // 100 STRC
await strc.approve(wstrc.target, amount);
const tx = await wstrc.wrap(amount);
await tx.wait();
```

### Read Morpho Position

```typescript
const morpho = new ethers.Contract('0x857f3EefE8cbda3Bc49367C996cd664A880d3042', [
  'function position(bytes32,address) view returns (uint256 supplyShares, uint128 borrowShares, uint128 collateral)',
  'function market(bytes32) view returns (uint128 totalSupplyAssets, uint128 totalSupplyShares, uint128 totalBorrowAssets, uint128 totalBorrowShares, uint128 lastUpdate, uint128 fee)',
], provider);

const marketId = '0x8f6385fda560540caa3ba0eca12a398f9265cd5233513985153d076e7774f3f0';
const [supplyShares, borrowShares, collateral] = await morpho.position(marketId, userAddress);

// Convert borrow shares to assets
const [,, totalBorrowAssets, totalBorrowShares] = await morpho.market(marketId);
const debt = totalBorrowShares > 0n
  ? (borrowShares * totalBorrowAssets + totalBorrowShares - 1n) / totalBorrowShares // round up
  : 0n;
```

### Supply Collateral + Borrow

```typescript
const marketParams = [
  '0x2D270e6886d130D724215A266106e6832161EAEd', // loanToken (USDC)
  '0x3b172e9c5488B17A0F4dc6fF4dc798055CC77281', // collateralToken (wSTRC)
  '0x7c415289c073C2Da7CCC071bb5f83eb1BC20cd88', // oracle
  '0x9515407b1512F53388ffE699524100e7270Ee57B', // irm
  860000000000000000n, // lltv (86%)
];

// Supply wSTRC as collateral
await morpho.supplyCollateral(marketParams, wstrcAmount, userAddress, '0x');

// Borrow USDC
await morpho.borrow(marketParams, usdcAmount, 0, userAddress, userAddress);
```

### Repay + Withdraw

```typescript
// Approve USDC for Morpho
await usdc.approve(morpho.target, repayAmount);

// Repay USDC debt
await morpho.repay(marketParams, repayAmount, 0, userAddress, '0x');

// Withdraw wSTRC collateral
await morpho.withdrawCollateral(marketParams, withdrawAmount, userAddress, userAddress);
```

### Read Oracle Price

```typescript
const oracle = new ethers.Contract('0x7c415289c073C2Da7CCC071bb5f83eb1BC20cd88', [
  'function price() external view returns (uint256)',
  'function getStrcxPrice() external view returns (uint256, uint256)',
], provider);

const morphoPrice = await oracle.price(); // Morpho-scaled (includes exchange rate + 1e24)
const [strcxPrice, timestamp] = await oracle.getStrcxPrice(); // STRCx/USD in 18 decimals
```

## Market Params (for Morpho calls)

All Morpho calls require the market params tuple. The market ID is computed from these params:

```
loanToken:       0x2D270e6886d130D724215A266106e6832161EAEd (USDC)
collateralToken: 0x3b172e9c5488B17A0F4dc6fF4dc798055CC77281 (wSTRC)
oracle:          0x7c415289c073C2Da7CCC071bb5f83eb1BC20cd88
irm:             0x9515407b1512F53388ffE699524100e7270Ee57B
lltv:            860000000000000000 (86%)
```

## Health Factor Calculation

```
HF = (collateral * oraclePrice * lltv) / (borrowed * 1e36 * 1e18)
```

Where:
- `collateral` = wSTRC amount (18 decimals)
- `oraclePrice` = oracle.price() (Morpho-scaled)
- `lltv` = 0.86e18
- `borrowed` = USDC debt in assets (6 decimals)

## Leverage Calculation

```
leverage = 1 / (1 - 0.86 / healthFactor)
```
