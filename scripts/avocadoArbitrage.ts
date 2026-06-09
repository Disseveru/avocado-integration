import "dotenv/config";

import { createSafe, setRpcUrls } from "@instadapp/avocado";
import type { RawTransaction } from "@instadapp/avocado";
import { BigNumber, Contract, ethers } from "ethers";

const AVOCADO_CHAIN_ID = 634;
const AVOCADO_RPC_URL = "https://rpc.avocado.instadapp.io";
const POLYGON_CHAIN_ID = 137;
const POLYGON_RPC_URL = "https://polygon-bor-rpc.publicnode.com";
const BASE_CHAIN_ID = 8453;

const BASE_FLASHLOAN_AGGREGATOR =
  "0x3813f7a28814bfaf861192d0a5a4891b15698bac";
const BASE_USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const BASE_WETH = "0x4200000000000000000000000000000000000006";
const BASE_UNISWAP_V3_SWAP_ROUTER_02 =
  "0x2626664c2603336E57B271c5C0b26F421741e481";
const BASE_UNISWAP_V3_QUOTER_V2 =
  "0x3d4e44Eb1374240CE5F1B871ab261CD16335B76a";
const BASE_AERODROME_ROUTER =
  "0xcF77a3Ba9A5CA399B7c97c74d54e5b1Beb874E43";
const BASE_AERODROME_FACTORY =
  "0x420DD381b31aEf6683db6B902084cB0FFECe40Da";

const CALL_OPERATION = "0";
const FLASHLOAN_OPERATION = "2";
const AVOCADO_FLASHLOAN_CALL_ID = "20";
const BPS_DENOMINATOR = 10_000;

const DEFAULT_FLASHLOAN_AMOUNTS_USDC = "1000";
const DEFAULT_FLASHLOAN_ROUTE = "0";
const DEFAULT_FLASHLOAN_PREMIUM_BPS = "0";
const DEFAULT_MIN_PROFIT_USDC = "1";
const DEFAULT_SLIPPAGE_BPS = "10";

const flashloanAggregatorInterface = new ethers.utils.Interface([
  "function flashLoan(address[] tokens,uint256[] amounts,uint256 route,bytes data,bytes instaData)",
]);

const erc20Interface = new ethers.utils.Interface([
  "function approve(address spender,uint256 amount) returns (bool)",
  "function transfer(address to,uint256 amount) returns (bool)",
]);

const uniswapV3QuoterInterface = new ethers.utils.Interface([
  "function quoteExactInputSingle((address tokenIn,address tokenOut,uint256 amountIn,uint24 fee,uint160 sqrtPriceLimitX96) params) returns (uint256 amountOut,uint160 sqrtPriceX96After,uint32 initializedTicksCrossed,uint256 gasEstimate)",
]);

const uniswapV3RouterInterface = new ethers.utils.Interface([
  "function exactInputSingle((address tokenIn,address tokenOut,uint24 fee,address recipient,uint256 amountIn,uint256 amountOutMinimum,uint160 sqrtPriceLimitX96) params) payable returns (uint256 amountOut)",
]);

const aerodromeRouterInterface = new ethers.utils.Interface([
  "function getAmountsOut(uint256 amountIn,(address from,address to,bool stable,address factory)[] routes) view returns (uint256[] amounts)",
  "function swapExactTokensForTokens(uint256 amountIn,uint256 amountOutMin,(address from,address to,bool stable,address factory)[] routes,address to,uint256 deadline) returns (uint256[] amounts)",
]);

type AvoAction = {
  target: string;
  data: string;
  value: ethers.BigNumberish;
  operation: string;
};

type Market =
  | {
      kind: "uniswap-v3";
      label: string;
      router: string;
      fee: number;
    }
  | {
      kind: "aerodrome";
      label: string;
      router: string;
      stable: boolean;
      factory: string;
    };

type QuoteResult = {
  market: Market;
  amountOut: BigNumber;
};

type Opportunity = {
  borrowAmount: BigNumber;
  repayAmount: BigNumber;
  firstLeg: QuoteResult;
  secondLeg: QuoteResult;
  minProfit: BigNumber;
  estimatedProfit: BigNumber;
};

const MARKETS: Market[] = [
  {
    kind: "uniswap-v3",
    label: "Uniswap V3 0.01%",
    router: BASE_UNISWAP_V3_SWAP_ROUTER_02,
    fee: 100,
  },
  {
    kind: "uniswap-v3",
    label: "Uniswap V3 0.05%",
    router: BASE_UNISWAP_V3_SWAP_ROUTER_02,
    fee: 500,
  },
  {
    kind: "uniswap-v3",
    label: "Uniswap V3 0.30%",
    router: BASE_UNISWAP_V3_SWAP_ROUTER_02,
    fee: 3000,
  },
  {
    kind: "aerodrome",
    label: "Aerodrome volatile",
    router: BASE_AERODROME_ROUTER,
    stable: false,
    factory: BASE_AERODROME_FACTORY,
  },
  {
    kind: "aerodrome",
    label: "Aerodrome stable",
    router: BASE_AERODROME_ROUTER,
    stable: true,
    factory: BASE_AERODROME_FACTORY,
  },
];

function requireEnv(name: string): string {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

function optionalEnv(name: string, defaultValue: string): string {
  const value = process.env[name];
  return value && value.trim().length > 0 ? value : defaultValue;
}

function parseIntegerEnv(name: string, defaultValue: string): number {
  const rawValue = optionalEnv(name, defaultValue);
  const parsed = Number(rawValue);

  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new Error(`${name} must be a non-negative integer. Received: ${rawValue}`);
  }

  return parsed;
}

function parseUsdcAmounts(value: string): BigNumber[] {
  return value
    .split(",")
    .map((amount) => amount.trim())
    .filter(Boolean)
    .map((amount) => ethers.utils.parseUnits(amount, 6));
}

function applySlippage(amount: BigNumber, slippageBps: number): BigNumber {
  return amount.mul(BPS_DENOMINATOR - slippageBps).div(BPS_DENOMINATOR);
}

function maxBigNumber(a: BigNumber, b: BigNumber): BigNumber {
  return a.gte(b) ? a : b;
}

function encodeActions(actions: AvoAction[]): string {
  return ethers.utils.defaultAbiCoder.encode(
    ["tuple(address target,bytes data,uint256 value,uint256 operation)[]"],
    [
      actions.map((action) => [
        action.target,
        action.data,
        action.value,
        action.operation,
      ]),
    ],
  );
}

function formatUsdc(amount: BigNumber): string {
  return ethers.utils.formatUnits(amount, 6);
}

async function quoteMarket(
  provider: ethers.providers.Provider,
  market: Market,
  tokenIn: string,
  tokenOut: string,
  amountIn: BigNumber,
): Promise<QuoteResult | undefined> {
  try {
    if (market.kind === "uniswap-v3") {
      const quoter = new Contract(
        BASE_UNISWAP_V3_QUOTER_V2,
        uniswapV3QuoterInterface,
        provider,
      );
      const quote = await quoter.callStatic.quoteExactInputSingle({
        tokenIn,
        tokenOut,
        amountIn,
        fee: market.fee,
        sqrtPriceLimitX96: 0,
      });

      return {
        market,
        amountOut: quote.amountOut ?? quote[0],
      };
    }

    const router = new Contract(market.router, aerodromeRouterInterface, provider);
    const route = [
      {
        from: tokenIn,
        to: tokenOut,
        stable: market.stable,
        factory: market.factory,
      },
    ];
    const amounts: BigNumber[] = await router.getAmountsOut(amountIn, route);
    const amountOut = amounts[amounts.length - 1];

    if (!amountOut || amountOut.isZero()) {
      return undefined;
    }

    return {
      market,
      amountOut,
    };
  } catch {
    return undefined;
  }
}

async function findBestOpportunity(
  provider: ethers.providers.Provider,
  borrowAmounts: BigNumber[],
  repayPremiumBps: number,
  minProfit: BigNumber,
): Promise<Opportunity | undefined> {
  let best: Opportunity | undefined;

  for (const borrowAmount of borrowAmounts) {
    const repayAmount = borrowAmount.add(
      borrowAmount.mul(repayPremiumBps).div(BPS_DENOMINATOR),
    );
    const firstLegs = (
      await Promise.all(
        MARKETS.map((market) =>
          quoteMarket(provider, market, BASE_USDC, BASE_WETH, borrowAmount),
        ),
      )
    ).filter((quote): quote is QuoteResult => Boolean(quote));

    for (const firstLeg of firstLegs) {
      const secondLegs = (
        await Promise.all(
          MARKETS.filter(
            (market) => market.label !== firstLeg.market.label,
          ).map((market) =>
            quoteMarket(
              provider,
              market,
              BASE_WETH,
              BASE_USDC,
              firstLeg.amountOut,
            ),
          ),
        )
      ).filter((quote): quote is QuoteResult => Boolean(quote));

      for (const secondLeg of secondLegs) {
        if (!secondLeg || secondLeg.amountOut.lte(repayAmount)) {
          continue;
        }

        const estimatedProfit = secondLeg.amountOut.sub(repayAmount);

        if (estimatedProfit.lt(minProfit)) {
          continue;
        }

        const opportunity = {
          borrowAmount,
          repayAmount,
          firstLeg,
          secondLeg,
          minProfit,
          estimatedProfit,
        };

        if (!best || opportunity.estimatedProfit.gt(best.estimatedProfit)) {
          best = opportunity;
        }
      }
    }
  }

  return best;
}

function buildApproval(token: string, spender: string, amount: BigNumber): AvoAction {
  return {
    target: token,
    data: erc20Interface.encodeFunctionData("approve", [spender, amount]),
    value: 0,
    operation: CALL_OPERATION,
  };
}

function buildSwapAction(
  market: Market,
  tokenIn: string,
  tokenOut: string,
  amountIn: BigNumber,
  minAmountOut: BigNumber,
  safeAddress: string,
  deadline: number,
): AvoAction {
  if (market.kind === "uniswap-v3") {
    return {
      target: market.router,
      data: uniswapV3RouterInterface.encodeFunctionData("exactInputSingle", [
        {
          tokenIn,
          tokenOut,
          fee: market.fee,
          recipient: safeAddress,
          amountIn,
          amountOutMinimum: minAmountOut,
          sqrtPriceLimitX96: 0,
        },
      ]),
      value: 0,
      operation: CALL_OPERATION,
    };
  }

  const route = [
    {
      from: tokenIn,
      to: tokenOut,
      stable: market.stable,
      factory: market.factory,
    },
  ];

  return {
    target: market.router,
    data: aerodromeRouterInterface.encodeFunctionData(
      "swapExactTokensForTokens",
      [amountIn, minAmountOut, route, safeAddress, deadline],
    ),
    value: 0,
    operation: CALL_OPERATION,
  };
}

function buildCallbackActions(
  opportunity: Opportunity,
  safeAddress: string,
  slippageBps: number,
  deadline: number,
): AvoAction[] {
  const firstMinOut = applySlippage(opportunity.firstLeg.amountOut, slippageBps);
  const secondMinOut = maxBigNumber(
    applySlippage(opportunity.secondLeg.amountOut, slippageBps),
    opportunity.repayAmount.add(opportunity.minProfit),
  );

  return [
    buildApproval(
      BASE_USDC,
      opportunity.firstLeg.market.router,
      opportunity.borrowAmount,
    ),
    buildSwapAction(
      opportunity.firstLeg.market,
      BASE_USDC,
      BASE_WETH,
      opportunity.borrowAmount,
      firstMinOut,
      safeAddress,
      deadline,
    ),
    buildApproval(
      BASE_WETH,
      opportunity.secondLeg.market.router,
      opportunity.firstLeg.amountOut,
    ),
    buildSwapAction(
      opportunity.secondLeg.market,
      BASE_WETH,
      BASE_USDC,
      opportunity.firstLeg.amountOut,
      secondMinOut,
      safeAddress,
      deadline,
    ),
    {
      target: BASE_USDC,
      data: erc20Interface.encodeFunctionData("transfer", [
        BASE_FLASHLOAN_AGGREGATOR,
        opportunity.repayAmount,
      ]),
      value: 0,
      operation: CALL_OPERATION,
    },
  ];
}

async function main(): Promise<void> {
  const ownerPrivateKey = requireEnv("AVOCADO_OWNER_PRIVATE_KEY");
  const baseRpcUrl = requireEnv("BASE_RPC_URL");
  const polygonRpcUrl = optionalEnv("POLYGON_RPC_URL", POLYGON_RPC_URL);
  const shouldBroadcast =
    process.argv.includes("--broadcast") ||
    process.env.BROADCAST_AVOCADO_TX === "true";
  const flashloanRoute = parseIntegerEnv(
    "FLASHLOAN_ROUTE",
    DEFAULT_FLASHLOAN_ROUTE,
  );
  const assumedPremiumBps = parseIntegerEnv(
    "FLASHLOAN_PREMIUM_BPS",
    DEFAULT_FLASHLOAN_PREMIUM_BPS,
  );
  const slippageBps = parseIntegerEnv("SLIPPAGE_BPS", DEFAULT_SLIPPAGE_BPS);
  const borrowAmounts = parseUsdcAmounts(
    optionalEnv("FLASHLOAN_AMOUNTS_USDC", DEFAULT_FLASHLOAN_AMOUNTS_USDC),
  );
  const minProfit = ethers.utils.parseUnits(
    optionalEnv("MIN_PROFIT_USDC", DEFAULT_MIN_PROFIT_USDC),
    6,
  );

  if (slippageBps >= BPS_DENOMINATOR) {
    throw new Error("SLIPPAGE_BPS must be less than 10000.");
  }

  setRpcUrls({
    [POLYGON_CHAIN_ID]: polygonRpcUrl,
    [BASE_CHAIN_ID]: baseRpcUrl,
  });

  const avocadoProvider = new ethers.providers.StaticJsonRpcProvider(
    AVOCADO_RPC_URL,
    {
      chainId: AVOCADO_CHAIN_ID,
      name: "avocado",
    },
  );
  const baseProvider = new ethers.providers.StaticJsonRpcProvider(baseRpcUrl, {
    chainId: BASE_CHAIN_ID,
    name: "base",
  });
  const owner = new ethers.Wallet(ownerPrivateKey, avocadoProvider);
  const safe = createSafe(owner, avocadoProvider);

  console.log("Scanning Base routes for a profitable fee-free flashloan cycle...");
  console.log("Borrow sizes USDC:", borrowAmounts.map(formatUsdc).join(", "));
  console.log("Minimum profit USDC:", formatUsdc(minProfit));

  const opportunity = await findBestOpportunity(
    baseProvider,
    borrowAmounts,
    assumedPremiumBps,
    minProfit,
  );

  if (!opportunity) {
    console.log("No profitable USDC -> WETH -> USDC route found right now.");
    console.log("No Avocado spell was signed or broadcast.");
    return;
  }

  const [ownerAddress, safeAddress] = await Promise.all([
    safe.getOwnerAddress(),
    safe.getSafeAddress(),
  ]);

  const deadline = Math.floor(Date.now() / 1000) + 60 * 20;
  const callbackActions = buildCallbackActions(
    opportunity,
    safeAddress,
    slippageBps,
    deadline,
  );
  const callbackData = encodeActions(callbackActions);

  const flashloanData = flashloanAggregatorInterface.encodeFunctionData(
    "flashLoan",
    [
      [BASE_USDC],
      [opportunity.borrowAmount],
      flashloanRoute,
      callbackData,
      "0x",
    ],
  );

  const spell: RawTransaction[] = [
    {
      to: BASE_FLASHLOAN_AGGREGATOR,
      data: flashloanData,
      value: 0,
      operation: FLASHLOAN_OPERATION,
    },
  ];

  const signatureOptions = {
    id: AVOCADO_FLASHLOAN_CALL_ID,
    metadata: ethers.utils.hexlify(
      ethers.utils.toUtf8Bytes("base-autonomous-flashloan-arbitrage"),
    ),
  };

  const message = await safe.generateSignatureMessage(
    spell,
    BASE_CHAIN_ID,
    signatureOptions,
  );
  const signature = await safe.buildSignature(message, BASE_CHAIN_ID);

  console.log("Avocado owner:", ownerAddress);
  console.log("Avocado safe:", safeAddress);
  console.log("Signing chain:", AVOCADO_CHAIN_ID);
  console.log("Execution chain:", BASE_CHAIN_ID);
  console.log("Flashloan aggregator:", BASE_FLASHLOAN_AGGREGATOR);
  console.log("Flashloan amount USDC:", formatUsdc(opportunity.borrowAmount));
  console.log("Flashloan route:", flashloanRoute);
  console.log("Assumed premium bps:", assumedPremiumBps);
  console.log("Repay amount USDC:", formatUsdc(opportunity.repayAmount));
  console.log("Estimated profit USDC:", formatUsdc(opportunity.estimatedProfit));
  console.log("First leg:", opportunity.firstLeg.market.label);
  console.log("Second leg:", opportunity.secondLeg.market.label);
  console.log("Encoded callback actions:", callbackActions.length);
  console.log("EIP-712 message:", JSON.stringify(message, null, 2));
  console.log("Signature:", signature);

  if (shouldBroadcast) {
    const tx = await safe.broadcastSignedMessage(
      message,
      signature,
      BASE_CHAIN_ID,
    );

    console.log("Broadcast transaction hash:", tx.hash);
    return;
  }

  console.log(
    "Dry run only. Run `npm run avocado:cast` to scan again and broadcast only if a profitable route is still available.",
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
