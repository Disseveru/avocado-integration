import { setRpcUrls } from "@instadapp/avocado";

const baseRpc = (process.env.BASE_RPC_URL || "").replace(/^=/, "");

setRpcUrls({
  8453: baseRpc || "https://mainnet.base.org",
  137: "https://polygon-bor-rpc.publicnode.com",
});
