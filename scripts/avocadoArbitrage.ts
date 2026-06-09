import "dotenv/config";

import { createSafe, setRpcUrls } from "@instadapp/avocado";
import type { RawTransaction } from "@instadapp/avocado";
import { ethers } from "ethers";

const AVOCADO_CHAIN_ID = 634;
const AVOCADO_RPC_URL = "https://rpc.avocado.instadapp.io";
const BASE_CHAIN_ID = 8453;

const BASE_FLASHLOAN_AGGREGATOR =
  "0x3813f7a28814bfaf861192d0a5a4891b15698bac";
const BASE_USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const BASE_WETH = "0x4200000000000000000000000000000000000006";
const BASE_UNISWAP_V3_SWAP_ROUTER_02 =
  "0x2626664c2603336E57B271c5C0b26F421741e481";

const CALL_OPERATION = "0";
const FLASHLOAN_OPERATION = "2";
const AVOCADO_FLASHLOAN_CALL_ID = "20";

const FLASHLOAN_ROUTE = 0;
const FLASHLOAN_AMOUNT = ethers.utils.parseUnits("1000", 6);
const ASSUMED_FLASHLOAN_PREMIUM_BPS = 9;
const REPAY_AMOUNT = FLASHLOAN_AMOUNT.add(
  FLASHLOAN_AMOUNT.mul(ASSUMED_FLASHLOAN_PREMIUM_BPS).div(10_000),
);

const flashloanAggregatorInterface = new ethers.utils.Interface([
  "function flashLoan(address[] tokens,uint256[] amounts,uint256 route,bytes data,bytes instaData)",
]);

const erc20Interface = new ethers.utils.Interface([
  "function approve(address spender,uint256 amount) returns (bool)",
  "function transfer(address to,uint256 amount) returns (bool)",
]);

const uniswapV3RouterInterface = new ethers.utils.Interface([
  "function exactInputSingle((address tokenIn,address tokenOut,uint24 fee,address recipient,uint256 deadline,uint256 amountIn,uint256 amountOutMinimum,uint160 sqrtPriceLimitX96)) payable returns (uint256 amountOut)",
]);

type AvoAction = {
  target: string;
  data: string;
  value: ethers.BigNumberish;
  operation: string;
};

function requireEnv(name: string): string {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

function encodeActions(actions: AvoAction[]): string {
  return ethers.utils.defaultAbiCoder.encode(
    [
      "tuple(address target,bytes data,uint256 value,uint256 operation)[]",
    ],
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

function buildFlashloanCallbackActions(
  safeAddress: string,
  deadline: number,
): AvoAction[] {
  const approveRouterData = erc20Interface.encodeFunctionData("approve", [
    BASE_UNISWAP_V3_SWAP_ROUTER_02,
    FLASHLOAN_AMOUNT,
  ]);

  const arbitrageSwapPayload = uniswapV3RouterInterface.encodeFunctionData(
    "exactInputSingle",
    [
      {
        tokenIn: BASE_USDC,
        tokenOut: BASE_WETH,
        fee: 500,
        recipient: safeAddress,
        deadline,
        amountIn: FLASHLOAN_AMOUNT,
        amountOutMinimum: 0,
        sqrtPriceLimitX96: 0,
      },
    ],
  );

  const repayFlashloanData = erc20Interface.encodeFunctionData("transfer", [
    BASE_FLASHLOAN_AGGREGATOR,
    REPAY_AMOUNT,
  ]);

  return [
    {
      target: BASE_USDC,
      data: approveRouterData,
      value: 0,
      operation: CALL_OPERATION,
    },
    {
      target: BASE_UNISWAP_V3_SWAP_ROUTER_02,
      data: arbitrageSwapPayload,
      value: 0,
      operation: CALL_OPERATION,
    },
    {
      target: BASE_USDC,
      data: repayFlashloanData,
      value: 0,
      operation: CALL_OPERATION,
    },
  ];
}

async function main(): Promise<void> {
  const ownerPrivateKey = requireEnv("AVOCADO_OWNER_PRIVATE_KEY");
  const baseRpcUrl = requireEnv("BASE_RPC_URL");

  setRpcUrls({
    [BASE_CHAIN_ID]: baseRpcUrl,
  });

  const avocadoProvider = new ethers.providers.StaticJsonRpcProvider(
    AVOCADO_RPC_URL,
    {
      chainId: AVOCADO_CHAIN_ID,
      name: "avocado",
    },
  );
  const owner = new ethers.Wallet(ownerPrivateKey, avocadoProvider);
  const safe = createSafe(owner);

  const [ownerAddress, safeAddress] = await Promise.all([
    safe.getOwnerAddress(),
    safe.getSafeAddress(),
  ]);

  const deadline = Math.floor(Date.now() / 1000) + 60 * 20;
  const callbackActions = buildFlashloanCallbackActions(safeAddress, deadline);
  const callbackData = encodeActions(callbackActions);

  const flashloanData = flashloanAggregatorInterface.encodeFunctionData(
    "flashLoan",
    [
      [BASE_USDC],
      [FLASHLOAN_AMOUNT],
      FLASHLOAN_ROUTE,
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
      ethers.utils.toUtf8Bytes("base-usdc-flashloan-arbitrage-simulation"),
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
  console.log("Encoded callback actions:", callbackActions.length);
  console.log("EIP-712 message:", JSON.stringify(message, null, 2));
  console.log("Signature:", signature);

  if (process.env.BROADCAST_AVOCADO_TX === "true") {
    const tx = await safe.broadcastSignedMessage(
      message,
      signature,
      BASE_CHAIN_ID,
    );

    console.log("Broadcast transaction hash:", tx.hash);
    return;
  }

  console.log(
    "Dry run only. Set BROADCAST_AVOCADO_TX=true to broadcast the signed Avocado spell.",
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
