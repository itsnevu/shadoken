import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ContractFactory, JsonRpcProvider, Wallet, getAddress } from 'ethers';

const root = new URL('..', import.meta.url).pathname;

function requireEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function optionalAddress(name, fallback) {
  return getAddress(process.env[name] || fallback);
}

const artifact = JSON.parse(await readFile(join(root, 'artifacts', 'ShadokenArenaPool.json'), 'utf8'));
const rpcUrl = requireEnv('ROBINHOODCHAIN_RPC_URL');
const chainId = Number(requireEnv('ROBINHOODCHAIN_CHAIN_ID'));
if (!Number.isSafeInteger(chainId) || chainId <= 0) throw new Error('ROBINHOODCHAIN_CHAIN_ID must be a positive integer');

const provider = new JsonRpcProvider(rpcUrl, chainId);
const deployer = new Wallet(requireEnv('DEPLOYER_PRIVATE_KEY'), provider);
const network = await provider.getNetwork();
if (Number(network.chainId) !== chainId) {
  throw new Error(`RPC chainId mismatch: expected ${chainId}, got ${network.chainId}`);
}

const initialOwner = optionalAddress('INITIAL_OWNER', deployer.address);
const initialSigner = optionalAddress('RUN_CLAIM_SIGNER_ADDRESS', deployer.address);
const treasury = optionalAddress('TREASURY_ADDRESS', deployer.address);
const baseUri = process.env.TOKEN_BASE_URI || 'https://shadoken.game/api/metadata/{id}.json';

console.log(`Deploying ShadokenArenaPool to RobinhoodChain mainnet chainId=${chainId}`);
console.log(`deployer=${deployer.address}`);
console.log(`owner=${initialOwner}`);
console.log(`signer=${initialSigner}`);
console.log(`treasury=${treasury}`);

const factory = new ContractFactory(artifact.abi, artifact.evm.bytecode.object, deployer);
const contract = await factory.deploy(initialOwner, initialSigner, treasury, baseUri);
console.log(`tx=${contract.deploymentTransaction()?.hash}`);
await contract.waitForDeployment();
const address = await contract.getAddress();
console.log(`address=${address}`);

const deployment = {
  network: 'robinhoodchain-mainnet',
  chainId,
  address,
  deployer: deployer.address,
  initialOwner,
  initialSigner,
  treasury,
  baseUri,
  txHash: contract.deploymentTransaction()?.hash,
  deployedAt: new Date().toISOString(),
};

await mkdir(join(root, 'deployments'), { recursive: true });
await writeFile(join(root, 'deployments', 'robinhoodchain-mainnet.json'), JSON.stringify(deployment, null, 2), 'utf8');
console.log('Wrote deployments/robinhoodchain-mainnet.json');
