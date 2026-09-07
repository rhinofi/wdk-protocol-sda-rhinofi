import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import { UnsupportedOperationError } from '@tetherto/wdk-wallet'
import { ISdaProtocol } from '@tetherto/wdk-wallet/protocols'

// --- Fixtures -------------------------------------------------------------

const API_KEY = 'dummy-rhino-api-key'
const CONFIG = { apiKey: API_KEY }

const DUMMY_ACCOUNT_ADDRESS = '0x742d35Cc6634C0532925a3b844Bc454e4438f44e'
const DUMMY_RECIPIENT = '0x8ba1f109551bD432803012645Ac136ddd64DBA72'
const DUMMY_SDA_ARBITRUM = '0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984'
const DUMMY_SDA_BASE = '0x6B175474E89094C44Da98b954EedeAC495271d0F'
const DUMMY_SENDER = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2'

const DUMMY_USDC_ARBITRUM_ADDRESS = '0xaf88d065e77c8cC2239327C5EDb3A432268e5831'
const DUMMY_USDT_ARBITRUM_ADDRESS = '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9'
const DUMMY_USDC_BASE_ADDRESS = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'
const DUMMY_USDT_BASE_ADDRESS = '0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2'

const DUMMY_DEPOSIT_TX_HASH = '0x6e3c7d4a92b8f1e05c6a89d273b4f8a1c5e92d7b0a4f86c3e1d95b28a7c40f63'

// The rhino.fi `/configs` response. ETHEREUM is enabled for bridging but has
// Smart Deposit Addresses switched off; POLYGON is disabled outright. Both must
// be excluded from deposit-address routes.
const DUMMY_CONFIG = {
  ARBITRUM: {
    name: 'Arbitrum',
    type: 'EVM',
    networkId: '42161',
    status: 'enabled',
    enabledDepositAddress: true,
    tokens: {
      USDC: { token: 'USDC', address: DUMMY_USDC_ARBITRUM_ADDRESS, decimals: 6 },
      USDT: { token: 'USDT', address: DUMMY_USDT_ARBITRUM_ADDRESS, decimals: 6 }
    }
  },
  BASE: {
    name: 'Base',
    type: 'EVM',
    networkId: '8453',
    status: 'enabled',
    enabledDepositAddress: true,
    tokens: {
      USDC: { token: 'USDC', address: DUMMY_USDC_BASE_ADDRESS, decimals: 6 },
      USDT: { token: 'USDT', address: DUMMY_USDT_BASE_ADDRESS, decimals: 6 }
    }
  },
  ETHEREUM: {
    name: 'Ethereum',
    type: 'EVM',
    networkId: '1',
    status: 'enabled',
    enabledDepositAddress: false,
    tokens: {
      USDC: { token: 'USDC', address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', decimals: 6 }
    }
  },
  POLYGON: {
    name: 'Polygon',
    type: 'EVM',
    networkId: '137',
    status: 'disabled',
    enabledDepositAddress: true,
    tokens: {
      USDC: { token: 'USDC', address: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359', decimals: 6 }
    }
  }
}

const DUMMY_SUPPORTED_TOKENS = {
  supportedTokens: [
    { symbol: 'USDC', address: DUMMY_USDC_ARBITRUM_ADDRESS, minDepositLimitUsd: 10, maxDepositLimitUsd: 100000 },
    { symbol: 'USDT', address: DUMMY_USDT_ARBITRUM_ADDRESS, minDepositLimitUsd: 5, maxDepositLimitUsd: 50000 }
  ]
}

const DUMMY_DEPOSIT_ADDRESS = {
  depositChain: 'ARBITRUM',
  depositAddress: DUMMY_SDA_ARBITRUM,
  destinationChain: 'BASE',
  destinationAddress: DUMMY_RECIPIENT,
  tokenOut: 'USDT',
  isActive: true,
  isPaused: false,
  supportedTokens: DUMMY_SUPPORTED_TOKENS.supportedTokens
}

// The SdaDepositAddress the module derives from DUMMY_DEPOSIT_ADDRESS. rhino.fi
// addresses never expire and always take repeat deposits, hence reusable with
// no expiry; the USD deposit bounds ride on the tokens rather than on `limits`.
const EXPECTED_DEPOSIT_ADDRESS = {
  address: DUMMY_SDA_ARBITRUM,
  id: `ARBITRUM:${DUMMY_SDA_ARBITRUM}`,
  sourceChains: ['ARBITRUM'],
  supportedInputTokens: [
    {
      token: 'USDC',
      chain: 'ARBITRUM',
      symbol: 'USDC',
      decimals: 6,
      address: DUMMY_USDC_ARBITRUM_ADDRESS,
      minDepositLimitUsd: 10,
      maxDepositLimitUsd: 100000
    },
    {
      token: 'USDT',
      chain: 'ARBITRUM',
      symbol: 'USDT',
      decimals: 6,
      address: DUMMY_USDT_ARBITRUM_ADDRESS,
      minDepositLimitUsd: 5,
      maxDepositLimitUsd: 50000
    }
  ],
  destinationChain: 'BASE',
  destinationAddress: DUMMY_RECIPIENT,
  reusable: true,
  isActive: true,
  isPaused: false,
  outputAsset: {
    token: 'USDT',
    chain: 'BASE',
    symbol: 'USDT',
    decimals: 6,
    address: DUMMY_USDT_BASE_ADDRESS
  }
}

// --- Mocks ----------------------------------------------------------------

const bridgeApi = {
  getBridgeConfig: jest.fn(),
  getSwapUserQuote: jest.fn()
}
const depositAddressesApi = {
  create: jest.fn(),
  getStatus: jest.fn(),
  getHistory: jest.fn(),
  getSupportedTokens: jest.fn(),
  updateDepositAddresses: jest.fn()
}
const RhinoSdk = jest.fn(() => ({ api: { bridge: bridgeApi, depositAddresses: depositAddressesApi } }))

jest.unstable_mockModule('@rhino.fi/sdk', () => ({ RhinoSdk }))

const indexModule = await import('../index.js')
const RhinofiProtocol = indexModule.default
const {
  ConfigurationError,
  NoSuchElementError,
  SdaExecutionError,
  UnsupportedChainError,
  UnsupportedTokenError,
  ValueError
} = indexModule

// --- Helpers --------------------------------------------------------------

// The module only ever reads the bound account's address, so a read-only stub
// exercising `getAddress` is the whole account surface it depends on.
const account = () => ({ getAddress: jest.fn(async () => DUMMY_ACCOUNT_ADDRESS) })

const protocolWith = (boundAccount = account()) => new RhinofiProtocol(boundAccount, CONFIG)

// Every method the WDK SdaProtocol interface declares. Pinned here so that a
// method added upstream fails the conformance test rather than passing
// unnoticed.
const SDA_INTERFACE_METHODS = [
  'getSupportedRoutes',
  'quoteDeposit',
  'createDepositAddress',
  'deriveDepositAddress',
  'getDepositAddress',
  'renewDepositAddress',
  'getTransfers',
  'getTransfersByRecipient',
  'getTransfer',
  'recoverDepositAddress',
  'disableDepositAddress'
]

describe('@rhino.fi/wdk-protocol-sda-rhinofi', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    bridgeApi.getBridgeConfig.mockResolvedValue({ data: DUMMY_CONFIG })
  })

  describe('constructor', () => {
    it('should throw if no rhino.fi api key is configured', () => {
      expect(() => new RhinofiProtocol(account(), {})).toThrow(ConfigurationError)
      expect(() => new RhinofiProtocol(account(), {})).toThrow('A rhino.fi `apiKey` is required')
    })

    it('should build the rhino.fi sdk with the configured api key', () => {
      // eslint-disable-next-line no-new
      new RhinofiProtocol(account(), CONFIG)

      expect(RhinoSdk).toHaveBeenCalledWith({ apiKey: API_KEY })
    })

    it('should strip a trailing slash from the configured api base url', () => {
      // eslint-disable-next-line no-new
      new RhinofiProtocol(account(), { apiKey: API_KEY, apiBaseUrl: 'https://dummy-api.rhino.fi/' })

      expect(RhinoSdk).toHaveBeenCalledWith({ apiKey: API_KEY, apiBaseUrl: 'https://dummy-api.rhino.fi' })
    })

    it('should be constructible without an account', () => {
      // eslint-disable-next-line no-new
      new RhinofiProtocol(undefined, CONFIG)

      expect(RhinoSdk).toHaveBeenCalledWith({ apiKey: API_KEY })
    })

    it('should expose every method of the WDK SDA protocol interface', () => {
      const protocol = protocolWith()
      const exposed = SDA_INTERFACE_METHODS.filter((name) => typeof protocol[name] === 'function')

      expect(exposed).toEqual(SDA_INTERFACE_METHODS)
    })

    it('should cover the whole WDK SDA protocol interface', () => {
      const declared = Object.getOwnPropertyNames(ISdaProtocol.prototype).filter((name) => name !== 'constructor')

      expect(declared.slice().sort()).toEqual(SDA_INTERFACE_METHODS.slice().sort())
    })
  })

  describe('getSupportedRoutes', () => {
    beforeEach(() => {
      depositAddressesApi.getSupportedTokens.mockResolvedValue({ data: DUMMY_SUPPORTED_TOKENS })
    })

    const EXPECTED_INPUT_TOKENS = EXPECTED_DEPOSIT_ADDRESS.supportedInputTokens

    it('should return the route for an explicit source and destination chain', async () => {
      const routes = await protocolWith().getSupportedRoutes({ sourceChain: 'ARBITRUM', destinationChain: 'BASE' })

      expect(routes).toEqual([{
        sourceChains: ['ARBITRUM'],
        inputTokens: EXPECTED_INPUT_TOKENS,
        destinationChain: 'BASE',
        reusable: true
      }])
      expect(depositAddressesApi.getSupportedTokens).toHaveBeenCalledWith({
        depositChain: 'ARBITRUM',
        destinationChain: 'BASE'
      })
    })

    it('should attach the output asset when one is requested', async () => {
      const routes = await protocolWith().getSupportedRoutes({
        sourceChain: 'ARBITRUM',
        destinationChain: 'BASE',
        outputAsset: 'USDT'
      })

      expect(routes[0].outputAsset).toEqual({
        token: 'USDT',
        chain: 'BASE',
        symbol: 'USDT',
        decimals: 6,
        address: DUMMY_USDT_BASE_ADDRESS
      })
      expect(depositAddressesApi.getSupportedTokens).toHaveBeenCalledWith({
        depositChain: 'ARBITRUM',
        destinationChain: 'BASE',
        tokenOut: 'USDT'
      })
    })

    it('should resolve a numeric chain id against the rhino.fi config', async () => {
      const routes = await protocolWith().getSupportedRoutes({ sourceChain: 42161, destinationChain: 8453 })

      expect(routes[0].sourceChains).toEqual(['ARBITRUM'])
      expect(routes[0].destinationChain).toBe('BASE')
    })

    it('should query every deposit-enabled source chain when none is given', async () => {
      const routes = await protocolWith().getSupportedRoutes({ destinationChain: 'BASE' })

      expect(routes.map((route) => route.sourceChains[0])).toEqual(['ARBITRUM', 'BASE'])
      expect(depositAddressesApi.getSupportedTokens).toHaveBeenCalledTimes(2)
      expect(depositAddressesApi.getSupportedTokens).toHaveBeenCalledWith({
        depositChain: 'ARBITRUM',
        destinationChain: 'BASE'
      })
      expect(depositAddressesApi.getSupportedTokens).toHaveBeenCalledWith({
        depositChain: 'BASE',
        destinationChain: 'BASE'
      })
    })

    it('should skip a source chain that fails while fanning out', async () => {
      depositAddressesApi.getSupportedTokens.mockImplementation(async ({ depositChain }) =>
        depositChain === 'ARBITRUM'
          ? { error: { _tag: 'DepositAddressChainsNotSupported', chains: ['ARBITRUM'] } }
          : { data: DUMMY_SUPPORTED_TOKENS }
      )

      const routes = await protocolWith().getSupportedRoutes({ destinationChain: 'BASE' })

      expect(routes.map((route) => route.sourceChains[0])).toEqual(['BASE'])
    })

    it('should propagate the failure when every source chain fails while fanning out', async () => {
      depositAddressesApi.getSupportedTokens.mockResolvedValue({
        error: { _tag: 'Unauthorized', message: 'the rhino.fi API key was rejected' }
      })

      await expect(protocolWith().getSupportedRoutes({ destinationChain: 'BASE' }))
        .rejects.toThrow(SdaExecutionError)
    })

    it('should propagate the failure when the caller named the source chain', async () => {
      depositAddressesApi.getSupportedTokens.mockResolvedValue({
        error: { _tag: 'DepositAddressChainsNotSupported', chains: ['ARBITRUM'] }
      })

      await expect(protocolWith().getSupportedRoutes({ sourceChain: 'ARBITRUM', destinationChain: 'BASE' }))
        .rejects.toThrow('unsupported chain(s): ARBITRUM')
    })

    it('should filter the input tokens by source token', async () => {
      const routes = await protocolWith().getSupportedRoutes({
        sourceChain: 'ARBITRUM',
        destinationChain: 'BASE',
        sourceToken: 'USDC'
      })

      expect(routes[0].inputTokens).toEqual([EXPECTED_INPUT_TOKENS[0]])
    })

    it('should match a source token given by contract address', async () => {
      const routes = await protocolWith().getSupportedRoutes({
        sourceChain: 'ARBITRUM',
        destinationChain: 'BASE',
        sourceToken: DUMMY_USDT_ARBITRUM_ADDRESS.toLowerCase()
      })

      expect(routes[0].inputTokens).toEqual([EXPECTED_INPUT_TOKENS[1]])
    })

    it('should drop a route whose tokens are all filtered out', async () => {
      const routes = await protocolWith().getSupportedRoutes({
        sourceChain: 'ARBITRUM',
        destinationChain: 'BASE',
        sourceToken: 'DAI'
      })

      expect(routes).toEqual([])
    })

    it('should skip a supported token that the chain config does not list', async () => {
      depositAddressesApi.getSupportedTokens.mockResolvedValue({
        data: {
          supportedTokens: [
            ...DUMMY_SUPPORTED_TOKENS.supportedTokens,
            { symbol: 'DAI', address: '0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1', minDepositLimitUsd: 1, maxDepositLimitUsd: 10 }
          ]
        }
      })

      const routes = await protocolWith().getSupportedRoutes({ sourceChain: 'ARBITRUM', destinationChain: 'BASE' })

      expect(routes[0].inputTokens).toEqual(EXPECTED_INPUT_TOKENS)
    })

    it('should throw if the destination chain is not set', async () => {
      await expect(protocolWith().getSupportedRoutes({ sourceChain: 'ARBITRUM' }))
        .rejects.toThrow(ValueError)
      await expect(protocolWith().getSupportedRoutes())
        .rejects.toThrow('`destinationChain` is required')
    })

    it('should throw if the source chain has deposit addresses disabled', async () => {
      await expect(protocolWith().getSupportedRoutes({ sourceChain: 'ETHEREUM', destinationChain: 'BASE' }))
        .rejects.toThrow(UnsupportedChainError)
      await expect(protocolWith().getSupportedRoutes({ sourceChain: 'ETHEREUM', destinationChain: 'BASE' }))
        .rejects.toThrow('Chain "ETHEREUM" is not supported by rhino.fi Smart Deposit Addresses.')
    })

    it('should throw if the output asset is not listed on the destination chain', async () => {
      await expect(protocolWith().getSupportedRoutes({
        sourceChain: 'ARBITRUM',
        destinationChain: 'BASE',
        outputAsset: 'DAI'
      })).rejects.toThrow(UnsupportedTokenError)
    })

    it('should reuse one config fetch across calls within the cache window', async () => {
      const protocol = protocolWith()

      await protocol.getSupportedRoutes({ sourceChain: 'ARBITRUM', destinationChain: 'BASE' })
      await protocol.getSupportedRoutes({ sourceChain: 'ARBITRUM', destinationChain: 'BASE' })

      expect(bridgeApi.getBridgeConfig).toHaveBeenCalledTimes(1)
      expect(depositAddressesApi.getSupportedTokens).toHaveBeenCalledTimes(1)
    })

    it('should refetch the config when caching is disabled', async () => {
      const protocol = new RhinofiProtocol(account(), { apiKey: API_KEY, configTtlMs: 0 })

      await protocol.getSupportedRoutes({ sourceChain: 'ARBITRUM', destinationChain: 'BASE' })
      await protocol.getSupportedRoutes({ sourceChain: 'ARBITRUM', destinationChain: 'BASE' })

      expect(bridgeApi.getBridgeConfig).toHaveBeenCalledTimes(2)
    })
  })

  describe('quoteDeposit', () => {
    const OPTIONS = {
      sourceChain: 'ARBITRUM',
      inputToken: 'USDC',
      destinationChain: 'BASE',
      outputAsset: 'USDT',
      inputAmount: 1_000_000_000n,
      depositor: DUMMY_ACCOUNT_ADDRESS,
      destinationAddress: DUMMY_RECIPIENT
    }

    // 1000 USDC in, 996 USDT out. sourceGasFee is the SDA sweep on ARBITRUM,
    // gasFee the delivery on BASE, and the remaining 2 USDC the protocol fee.
    const DUMMY_QUOTE = {
      chainIn: 'ARBITRUM',
      chainOut: 'BASE',
      payAmount: '1000',
      receiveAmount: '996',
      fees: { fee: '4', gasFee: '1.5', sourceGasFee: '0.5' },
      quoteId: '6717e3a9c1a2b4d5e6f78901',
      expiresAt: '2026-01-01T00:00:00.000Z',
      _tag: 'bridgeSwap'
    }

    beforeEach(() => {
      bridgeApi.getSwapUserQuote.mockResolvedValue({ data: DUMMY_QUOTE })
    })

    it('should quote a deposit as a smart deposit address transaction', async () => {
      const quote = await protocolWith().quoteDeposit(OPTIONS)

      expect(quote).toEqual({
        inputChain: 'ARBITRUM',
        inputToken: 'USDC',
        inputAmount: 1_000_000_000n,
        destinationChain: 'BASE',
        outputAsset: 'USDT',
        outputAmount: 996_000_000n,
        rate: '0.996',
        fees: [
          { type: 'network', amount: 500_000n, token: 'USDC', chain: 'ARBITRUM', included: true, description: 'Source-chain cost of sweeping the deposit' },
          { type: 'network', amount: 1_500_000n, token: 'USDC', chain: 'BASE', included: true, description: 'Destination-chain delivery gas fee' },
          { type: 'protocol', amount: 2_000_000n, token: 'USDC', included: true, description: 'rhino.fi protocol fee' }
        ]
      })
    })

    it('should ask rhino.fi for an sda-priced quote against the caller account', async () => {
      await protocolWith().quoteDeposit(OPTIONS)

      expect(bridgeApi.getSwapUserQuote).toHaveBeenCalledWith({
        chainIn: 'ARBITRUM',
        chainOut: 'BASE',
        tokenIn: 'USDC',
        tokenOut: 'USDT',
        amount: '1000',
        mode: 'pay',
        isSda: 'true',
        depositor: DUMMY_ACCOUNT_ADDRESS,
        recipient: DUMMY_RECIPIENT
      })
    })

    it('should quote without a bound account', async () => {
      const protocol = new RhinofiProtocol(undefined, CONFIG)

      await protocol.quoteDeposit(OPTIONS)

      expect(bridgeApi.getSwapUserQuote).toHaveBeenCalledWith(
        expect.objectContaining({ depositor: DUMMY_ACCOUNT_ADDRESS, recipient: DUMMY_RECIPIENT })
      )
    })

    it('should throw before calling rhino.fi if the depositor is missing', async () => {
      await expect(protocolWith().quoteDeposit({ ...OPTIONS, depositor: undefined }))
        .rejects.toThrow('`depositor` and `destinationAddress` are required to quote a deposit')
      expect(bridgeApi.getBridgeConfig).not.toHaveBeenCalled()
    })

    it('should throw before calling rhino.fi if the destination address is missing', async () => {
      await expect(protocolWith().quoteDeposit({ ...OPTIONS, destinationAddress: undefined }))
        .rejects.toThrow('`depositor` and `destinationAddress` are required to quote a deposit')
      expect(bridgeApi.getBridgeConfig).not.toHaveBeenCalled()
    })

    it('should deliver the input token when no output asset is given', async () => {
      await protocolWith().quoteDeposit({ ...OPTIONS, outputAsset: undefined })

      expect(bridgeApi.getSwapUserQuote).toHaveBeenCalledWith(
        expect.objectContaining({ tokenIn: 'USDC', tokenOut: 'USDC' })
      )
    })

    it('should omit zero-valued fees', async () => {
      bridgeApi.getSwapUserQuote.mockResolvedValue({
        data: { ...DUMMY_QUOTE, fees: { fee: '1.5', gasFee: '1.5', sourceGasFee: '0' } }
      })

      const quote = await protocolWith().quoteDeposit(OPTIONS)

      expect(quote.fees).toEqual([
        { type: 'network', amount: 1_500_000n, token: 'USDC', chain: 'BASE', included: true, description: 'Destination-chain delivery gas fee' }
      ])
    })

    it('should accept an input amount given as a number', async () => {
      const quote = await protocolWith().quoteDeposit({ ...OPTIONS, inputAmount: 1_000_000_000 })

      expect(quote.inputAmount).toBe(1_000_000_000n)
    })

    it('should throw before calling rhino.fi if the input amount is missing', async () => {
      await expect(protocolWith().quoteDeposit({ ...OPTIONS, inputAmount: undefined }))
        .rejects.toThrow('`inputAmount` is required to quote a deposit.')
      expect(bridgeApi.getBridgeConfig).not.toHaveBeenCalled()
    })

    it('should throw before calling rhino.fi if the input amount is not a whole number of base units', async () => {
      await expect(protocolWith().quoteDeposit({ ...OPTIONS, inputAmount: 1.5 }))
        .rejects.toThrow(RangeError)
      await expect(protocolWith().quoteDeposit({ ...OPTIONS, inputAmount: Number.NaN }))
        .rejects.toThrow(RangeError)
      await expect(protocolWith().quoteDeposit({ ...OPTIONS, inputAmount: 'not-a-number' }))
        .rejects.toThrow(SyntaxError)
      expect(bridgeApi.getBridgeConfig).not.toHaveBeenCalled()
    })

    it('should throw before calling rhino.fi if the input amount is not positive', async () => {
      await expect(protocolWith().quoteDeposit({ ...OPTIONS, inputAmount: 0n }))
        .rejects.toThrow('`inputAmount` must be greater than zero.')
      expect(bridgeApi.getBridgeConfig).not.toHaveBeenCalled()
    })

    it('should throw if the source chain has deposit addresses disabled', async () => {
      await expect(protocolWith().quoteDeposit({ ...OPTIONS, sourceChain: 'ETHEREUM' }))
        .rejects.toThrow(UnsupportedChainError)
    })

    it('should throw if the input token is not listed on the source chain', async () => {
      await expect(protocolWith().quoteDeposit({ ...OPTIONS, inputToken: 'DAI' }))
        .rejects.toThrow('Token "DAI" is not supported on chain "ARBITRUM".')
    })

    it('should surface the rhino.fi failure tag when no route exists', async () => {
      bridgeApi.getSwapUserQuote.mockResolvedValue({ error: { _tag: 'NoRouteFoundError', message: 'no route' } })

      await expect(protocolWith().quoteDeposit(OPTIONS)).rejects.toThrow(SdaExecutionError)
      await expect(protocolWith().quoteDeposit(OPTIONS)).rejects.toThrow('Failed to fetch a rhino.fi deposit quote. (no route).')
    })

    it('should wrap a transport rejection', async () => {
      bridgeApi.getSwapUserQuote.mockRejectedValue(new Error('socket hang up'))

      await expect(protocolWith().quoteDeposit(OPTIONS))
        .rejects.toThrow('Failed to fetch a rhino.fi deposit quote.')
    })

    it('should surface a gateway error that carries no parsable body', async () => {
      bridgeApi.getSwapUserQuote.mockResolvedValue({
        response: { ok: false, status: 502, statusText: 'Bad Gateway' }
      })

      await expect(protocolWith().quoteDeposit(OPTIONS))
        .rejects.toThrow('rhino.fi responded 502 Bad Gateway')
    })
  })

  describe('createDepositAddress', () => {
    const OPTIONS = {
      sourceChains: ['ARBITRUM'],
      destinationChain: 'BASE',
      outputAsset: 'USDT',
      destinationAddress: DUMMY_RECIPIENT
    }

    beforeEach(() => {
      depositAddressesApi.create.mockResolvedValue({ data: [DUMMY_DEPOSIT_ADDRESS] })
    })

    it('should create a deposit address and map its descriptor', async () => {
      const addresses = await protocolWith().createDepositAddress(OPTIONS)

      expect(addresses).toEqual([EXPECTED_DEPOSIT_ADDRESS])
    })

    it('should send the resolved chains, destination and output asset to rhino.fi', async () => {
      await protocolWith().createDepositAddress(OPTIONS)

      expect(depositAddressesApi.create).toHaveBeenCalledWith({
        depositChains: ['ARBITRUM'],
        destinationChain: 'BASE',
        destinationAddress: DUMMY_RECIPIENT,
        tokenOut: 'USDT'
      })
    })

    it('should default the destination address to the bound account address', async () => {
      await protocolWith().createDepositAddress({ ...OPTIONS, destinationAddress: undefined })

      expect(depositAddressesApi.create).toHaveBeenCalledWith({
        depositChains: ['ARBITRUM'],
        destinationChain: 'BASE',
        destinationAddress: DUMMY_ACCOUNT_ADDRESS,
        tokenOut: 'USDT'
      })
    })

    it('should leave the destination unset rather than assume one when rhino.fi does not disclose it', async () => {
      depositAddressesApi.create.mockResolvedValue({
        data: [{ ...DUMMY_DEPOSIT_ADDRESS, destinationAddress: undefined }]
      })

      const [address] = await protocolWith().createDepositAddress(OPTIONS)

      expect(address).not.toHaveProperty('destinationAddress')
    })

    it('should forward the rhino.fi specific creation options', async () => {
      await protocolWith().createDepositAddress({
        ...OPTIONS,
        addressNote: 'dummy-client-reference',
        refundAddress: DUMMY_SENDER,
        webhookUrl: 'https://dummy-client.url/rhino-webhook',
        reusePolicy: 'create-new',
        bridgeIfNotSwappable: false
      })

      expect(depositAddressesApi.create).toHaveBeenCalledWith({
        depositChains: ['ARBITRUM'],
        destinationChain: 'BASE',
        destinationAddress: DUMMY_RECIPIENT,
        tokenOut: 'USDT',
        addressNote: 'dummy-client-reference',
        refundAddress: DUMMY_SENDER,
        webhookUrl: 'https://dummy-client.url/rhino-webhook',
        reusePolicy: 'create-new',
        bridgeIfNotSwappable: false
      })
    })

    it('should omit the output asset when none is requested', async () => {
      await protocolWith().createDepositAddress({ ...OPTIONS, outputAsset: undefined })

      expect(depositAddressesApi.create).toHaveBeenCalledWith({
        depositChains: ['ARBITRUM'],
        destinationChain: 'BASE',
        destinationAddress: DUMMY_RECIPIENT
      })
    })

    it('should return one descriptor per source chain', async () => {
      depositAddressesApi.create.mockResolvedValue({
        data: [
          DUMMY_DEPOSIT_ADDRESS,
          { ...DUMMY_DEPOSIT_ADDRESS, depositChain: 'BASE', depositAddress: DUMMY_SDA_BASE, supportedTokens: [] }
        ]
      })

      const addresses = await protocolWith().createDepositAddress({ ...OPTIONS, sourceChains: ['ARBITRUM', 'BASE'] })

      expect(addresses).toHaveLength(2)
      expect(addresses[1].id).toBe(`BASE:${DUMMY_SDA_BASE}`)
      expect(addresses[1].address).toBe(DUMMY_SDA_BASE)
      expect(addresses[1].sourceChains).toEqual(['BASE'])
    })

    it('should surface the stellar base address and memo id', async () => {
      const DUMMY_CHAIN_METADATA = {
        _tag: 'STELLAR',
        baseAddress: 'GBRPYHIL2CI3FNQ4BXLFMNDLFJUNPU2HY3ZMFSHONUCEOASW7QC7OX2H',
        memoId: '1234567890'
      }
      depositAddressesApi.create.mockResolvedValue({
        data: [{ ...DUMMY_DEPOSIT_ADDRESS, chainMetadata: DUMMY_CHAIN_METADATA }]
      })

      const [address] = await protocolWith().createDepositAddress(OPTIONS)

      expect(address.chainMetadata).toEqual(DUMMY_CHAIN_METADATA)
    })

    it('should throw before calling rhino.fi if no source chains are given', async () => {
      await expect(protocolWith().createDepositAddress({ ...OPTIONS, sourceChains: [] }))
        .rejects.toThrow('`sourceChains` must list at least one chain')
      expect(bridgeApi.getBridgeConfig).not.toHaveBeenCalled()
    })

    it('should throw if a source chain has deposit addresses disabled', async () => {
      await expect(protocolWith().createDepositAddress({ ...OPTIONS, sourceChains: ['ARBITRUM', 'ETHEREUM'] }))
        .rejects.toThrow('Chain "ETHEREUM" is not supported by rhino.fi Smart Deposit Addresses.')
    })

    it('should throw if no destination address is given and no account is bound', async () => {
      const protocol = new RhinofiProtocol(undefined, CONFIG)

      await expect(protocol.createDepositAddress({ ...OPTIONS, destinationAddress: undefined }))
        .rejects.toThrow('`destinationAddress` is required when no wallet account is bound')
    })

    it('should surface an exceeded rate limit as an execution error with its tag', async () => {
      depositAddressesApi.create.mockResolvedValue({
        error: { _tag: 'DepositAddressRateLimitExceeded', message: 'too many' }
      })

      await expect(protocolWith().createDepositAddress(OPTIONS))
        .rejects.toThrow('Failed to create a rhino.fi Smart Deposit Address. (the deposit-address creation rate limit has been exceeded).')

      const error = await protocolWith().createDepositAddress(OPTIONS).catch((caught) => caught)
      expect(error.code).toBe('DepositAddressRateLimitExceeded')
    })
  })

  describe('getDepositAddress', () => {
    const ID = `ARBITRUM:${DUMMY_SDA_ARBITRUM}`

    it('should look up a deposit address by its identifier', async () => {
      depositAddressesApi.getStatus.mockResolvedValue({ data: DUMMY_DEPOSIT_ADDRESS })

      const address = await protocolWith().getDepositAddress(ID)

      expect(address).toEqual(EXPECTED_DEPOSIT_ADDRESS)
      expect(depositAddressesApi.getStatus).toHaveBeenCalledWith({
        depositAddress: DUMMY_SDA_ARBITRUM,
        depositChain: 'ARBITRUM'
      })
    })

    it('should report a paused address as paused', async () => {
      depositAddressesApi.getStatus.mockResolvedValue({
        data: { ...DUMMY_DEPOSIT_ADDRESS, isPaused: true }
      })

      const address = await protocolWith().getDepositAddress(ID)

      expect(address.isPaused).toBe(true)
    })

    it('should throw if the identifier is not chain-qualified', async () => {
      await expect(protocolWith().getDepositAddress(DUMMY_SDA_ARBITRUM))
        .rejects.toThrow(ValueError)
      await expect(protocolWith().getDepositAddress(DUMMY_SDA_ARBITRUM))
        .rejects.toThrow('is not a valid rhino.fi deposit-address id')
    })

    it('should throw if rhino.fi has no such address', async () => {
      depositAddressesApi.getStatus.mockResolvedValue({
        error: { _tag: 'DepositAddressNotFound', addresses: [DUMMY_SDA_ARBITRUM], message: 'not found' }
      })

      await expect(protocolWith().getDepositAddress(ID)).rejects.toThrow(NoSuchElementError)
      await expect(protocolWith().getDepositAddress(ID))
        .rejects.toThrow(`No deposit address found for id "${ID}".`)
    })

    it('should treat a bare 404 without a tagged body as not found', async () => {
      depositAddressesApi.getStatus.mockResolvedValue({
        error: 'Not Found',
        response: { ok: false, status: 404, statusText: 'Not Found' }
      })

      await expect(protocolWith().getDepositAddress(ID)).rejects.toThrow(NoSuchElementError)
    })

    it('should report the http status when a failure carries no tagged body', async () => {
      depositAddressesApi.getStatus.mockResolvedValue({
        error: '',
        response: { ok: false, status: 503, statusText: 'Service Unavailable' }
      })

      await expect(protocolWith().getDepositAddress(ID))
        .rejects.toThrow('Failed to fetch the rhino.fi Smart Deposit Address. (rhino.fi responded 503 Service Unavailable).')
    })

    it('should leave the destination unset when rhino.fi does not disclose it', async () => {
      depositAddressesApi.getStatus.mockResolvedValue({
        data: { ...DUMMY_DEPOSIT_ADDRESS, destinationAddress: undefined }
      })

      const address = await protocolWith().getDepositAddress(ID)

      expect(address).not.toHaveProperty('destinationAddress')
    })
  })

  describe('getTransfers', () => {
    const OPTIONS = { sourceChain: 'ARBITRUM' }
    const TRANSFER_ID_PREFIX = `ARBITRUM:${DUMMY_SDA_ARBITRUM}`

    const DUMMY_HISTORY = {
      depositAddress: DUMMY_SDA_ARBITRUM,
      depositChain: 'ARBITRUM',
      bridges: [
        {
          _id: 'bridge-executed-1',
          _tag: 'accepted',
          tokenSymbol: 'USDC',
          tokenAddress: DUMMY_USDC_ARBITRUM_ADDRESS,
          amount: '1000',
          amountUsd: 1000.12,
          amountWei: '1000000000',
          sender: DUMMY_SENDER,
          txHash: DUMMY_DEPOSIT_TX_HASH,
          createdAt: '2026-08-01T10:00:00.000Z',
          history: { _tag: 'depositAddressBridge', state: 'EXECUTED' }
        },
        {
          _id: 'bridge-pending-2',
          _tag: 'accepted',
          tokenSymbol: 'USDT',
          amountWei: '250000000',
          txHash: DUMMY_DEPOSIT_TX_HASH,
          createdAt: '2026-08-02T10:00:00.000Z',
          history: { _tag: 'depositAddressBridge', state: 'PENDING' }
        },
        {
          _id: 'deposit-detected-3',
          _tag: 'detected',
          tokenSymbol: 'USDC',
          amountWei: '5000000',
          createdAt: '2026-08-03T10:00:00.000Z'
        },
        {
          _id: 'bridge-rejected-4',
          _tag: 'rejected',
          tokenSymbol: 'USDC',
          amountWei: '900000000000',
          reason: 'OVER_MAX',
          createdAt: '2026-08-04T10:00:00.000Z'
        },
        {
          _id: 'bridge-failed-5',
          _tag: 'failed',
          tokenSymbol: 'USDC',
          amountWei: '7000000',
          createdAt: '2026-08-05T10:00:00.000Z'
        }
      ]
    }

    beforeEach(() => {
      depositAddressesApi.getHistory.mockResolvedValue({ data: DUMMY_HISTORY })
    })

    it('should map every history entry to a transfer', async () => {
      const transfers = await protocolWith().getTransfers(DUMMY_SDA_ARBITRUM, OPTIONS)

      expect(transfers.map((transfer) => transfer.id)).toEqual([
        `${TRANSFER_ID_PREFIX}:bridge-failed-5`,
        `${TRANSFER_ID_PREFIX}:bridge-rejected-4`,
        `${TRANSFER_ID_PREFIX}:deposit-detected-3`,
        `${TRANSFER_ID_PREFIX}:bridge-pending-2`,
        `${TRANSFER_ID_PREFIX}:bridge-executed-1`
      ])
      expect(transfers.map((transfer) => transfer.status)).toEqual([
        'failed',
        'refund-pending',
        'detected',
        'processing',
        'completed'
      ])
    })

    it('should carry the deposit details rhino.fi reports', async () => {
      const transfers = await protocolWith().getTransfers(DUMMY_SDA_ARBITRUM, OPTIONS)
      const transfer = transfers.find((candidate) => candidate.id.endsWith('bridge-executed-1'))

      expect(transfer).toEqual({
        id: `${TRANSFER_ID_PREFIX}:bridge-executed-1`,
        status: 'completed',
        address: DUMMY_SDA_ARBITRUM,
        sourceChain: 'ARBITRUM',
        token: 'USDC',
        tokenAddress: DUMMY_USDC_ARBITRUM_ADDRESS,
        amount: 1_000_000_000n,
        amountUsd: 1000.12,
        sender: DUMMY_SENDER,
        txHash: DUMMY_DEPOSIT_TX_HASH,
        createdAt: '2026-08-01T10:00:00.000Z'
      })
    })

    it('should request the history for the address on the given chain', async () => {
      await protocolWith().getTransfers(DUMMY_SDA_ARBITRUM, OPTIONS)

      expect(depositAddressesApi.getHistory).toHaveBeenCalledWith({
        depositAddress: DUMMY_SDA_ARBITRUM,
        depositChain: 'ARBITRUM',
        fromTimestamp: expect.any(Date)
      })
    })

    it('should filter by status', async () => {
      const transfers = await protocolWith().getTransfers(DUMMY_SDA_ARBITRUM, { ...OPTIONS, status: 'completed' })

      expect(transfers.map((transfer) => transfer.id)).toEqual([`${TRANSFER_ID_PREFIX}:bridge-executed-1`])
    })

    it('should ask for the widest window rhino.fi allows by default', async () => {
      await protocolWith().getTransfers(DUMMY_SDA_ARBITRUM, OPTIONS)

      const { fromTimestamp } = depositAddressesApi.getHistory.mock.calls[0][0]
      const daysBack = (Date.now() - fromTimestamp.getTime()) / (24 * 60 * 60 * 1000)
      expect(Math.round(daysBack)).toBe(31)
    })

    it('should search an explicit window when one is given', async () => {
      const fromTimestamp = new Date('2026-01-01T00:00:00.000Z')
      const toTimestamp = new Date('2026-01-20T00:00:00.000Z')

      await protocolWith().getTransfers(DUMMY_SDA_ARBITRUM, { ...OPTIONS, fromTimestamp, toTimestamp })

      expect(depositAddressesApi.getHistory).toHaveBeenCalledWith({
        depositAddress: DUMMY_SDA_ARBITRUM,
        depositChain: 'ARBITRUM',
        fromTimestamp,
        toTimestamp
      })
    })

    it('should end the default window at toTimestamp when only that is given', async () => {
      const toTimestamp = new Date('2026-03-01T00:00:00.000Z')

      await protocolWith().getTransfers(DUMMY_SDA_ARBITRUM, { ...OPTIONS, toTimestamp })

      const { fromTimestamp } = depositAddressesApi.getHistory.mock.calls[0][0]
      expect(fromTimestamp).toEqual(new Date('2026-01-29T00:00:00.000Z'))
    })

    it('should reject a window wider than rhino.fi allows before calling it', async () => {
      const fromTimestamp = new Date('2026-01-01T00:00:00.000Z')
      const toTimestamp = new Date('2026-02-02T00:00:00.000Z')

      await expect(protocolWith().getTransfers(DUMMY_SDA_ARBITRUM, { ...OPTIONS, fromTimestamp, toTimestamp }))
        .rejects.toThrow('The history window must not span more than 31 days')
      expect(depositAddressesApi.getHistory).not.toHaveBeenCalled()
    })

    it('should reject an inverted window before calling rhino.fi', async () => {
      const fromTimestamp = new Date('2026-01-20T00:00:00.000Z')
      const toTimestamp = new Date('2026-01-01T00:00:00.000Z')

      await expect(protocolWith().getTransfers(DUMMY_SDA_ARBITRUM, { ...OPTIONS, fromTimestamp, toTimestamp }))
        .rejects.toThrow('`fromTimestamp` must not be after `toTimestamp`')
      expect(depositAddressesApi.getHistory).not.toHaveBeenCalled()
    })

    it('should apply limit and skip', async () => {
      const transfers = await protocolWith().getTransfers(DUMMY_SDA_ARBITRUM, { ...OPTIONS, limit: 2, skip: 1 })

      expect(transfers.map((transfer) => transfer.id)).toEqual([
        `${TRANSFER_ID_PREFIX}:bridge-rejected-4`,
        `${TRANSFER_ID_PREFIX}:deposit-detected-3`
      ])
    })

    it('should return an empty list for a limit of zero', async () => {
      const transfers = await protocolWith().getTransfers(DUMMY_SDA_ARBITRUM, { ...OPTIONS, limit: 0 })

      expect(transfers).toEqual([])
    })

    it('should treat an unknown accepted bridge state as still processing', async () => {
      depositAddressesApi.getHistory.mockResolvedValue({
        data: {
          ...DUMMY_HISTORY,
          bridges: [{ _id: 'bridge-new-state', _tag: 'accepted', history: { state: 'SOME_NEW_STATE' } }]
        }
      })

      const [transfer] = await protocolWith().getTransfers(DUMMY_SDA_ARBITRUM, OPTIONS)

      expect(transfer.status).toBe('processing')
    })

    it('should map a confirming deposit as processing', async () => {
      depositAddressesApi.getHistory.mockResolvedValue({
        data: { ...DUMMY_HISTORY, bridges: [{ _id: 'deposit-confirming', _tag: 'confirming' }] }
      })

      const [transfer] = await protocolWith().getTransfers(DUMMY_SDA_ARBITRUM, OPTIONS)

      expect(transfer.status).toBe('processing')
    })

    it('should throw if the address is missing', async () => {
      await expect(protocolWith().getTransfers(undefined, OPTIONS))
        .rejects.toThrow('`address` is required')
    })

    it('should throw if the source chain is missing', async () => {
      await expect(protocolWith().getTransfers(DUMMY_SDA_ARBITRUM))
        .rejects.toThrow('`options.sourceChain` is required')
    })

    it('should throw before calling rhino.fi if the limit is negative', async () => {
      await expect(protocolWith().getTransfers(DUMMY_SDA_ARBITRUM, { ...OPTIONS, limit: -1 }))
        .rejects.toThrow('`options.limit` must not be negative.')
      expect(depositAddressesApi.getHistory).not.toHaveBeenCalled()
    })

    it('should throw before calling rhino.fi if the skip is negative', async () => {
      await expect(protocolWith().getTransfers(DUMMY_SDA_ARBITRUM, { ...OPTIONS, skip: -1 }))
        .rejects.toThrow('`options.skip` must not be negative.')
      expect(depositAddressesApi.getHistory).not.toHaveBeenCalled()
    })

    it('should throw if the source chain is unknown to rhino.fi', async () => {
      await expect(protocolWith().getTransfers(DUMMY_SDA_ARBITRUM, { sourceChain: 'DOGECHAIN' }))
        .rejects.toThrow(UnsupportedChainError)
    })

    it('should throw if rhino.fi has no such address', async () => {
      depositAddressesApi.getHistory.mockResolvedValue({
        error: { _tag: 'DepositAddressNotFound', addresses: [DUMMY_SDA_ARBITRUM], message: 'not found' }
      })

      await expect(protocolWith().getTransfers(DUMMY_SDA_ARBITRUM, OPTIONS))
        .rejects.toThrow(`No deposit address found for id "ARBITRUM:${DUMMY_SDA_ARBITRUM}".`)
    })
  })

  describe('getTransfer', () => {
    const TRANSFER_ID = `ARBITRUM:${DUMMY_SDA_ARBITRUM}:bridge-executed-1`

    beforeEach(() => {
      depositAddressesApi.getHistory.mockResolvedValue({
        data: {
          bridges: [{
            _id: 'bridge-executed-1',
            _tag: 'accepted',
            tokenSymbol: 'USDC',
            amountWei: '1000000000',
            history: { state: 'EXECUTED' }
          }]
        }
      })
    })

    it('should return the matching deposit', async () => {
      const transfer = await protocolWith().getTransfer(TRANSFER_ID)

      expect(transfer).toEqual({
        id: TRANSFER_ID,
        status: 'completed',
        address: DUMMY_SDA_ARBITRUM,
        sourceChain: 'ARBITRUM',
        token: 'USDC',
        amount: 1_000_000_000n
      })
      expect(depositAddressesApi.getHistory).toHaveBeenCalledWith({
        depositAddress: DUMMY_SDA_ARBITRUM,
        depositChain: 'ARBITRUM',
        fromTimestamp: expect.any(Date)
      })
    })

    it('should throw if the address holds no such deposit', async () => {
      await expect(protocolWith().getTransfer(`ARBITRUM:${DUMMY_SDA_ARBITRUM}:bridge-missing`))
        .rejects.toThrow(NoSuchElementError)
      await expect(protocolWith().getTransfer(`ARBITRUM:${DUMMY_SDA_ARBITRUM}:bridge-missing`))
        .rejects.toThrow('No transfer found for id "bridge-missing".')
    })

    it('should throw if the identifier is not chain and address qualified', async () => {
      await expect(protocolWith().getTransfer('bridge-executed-1'))
        .rejects.toThrow('is not a valid rhino.fi transfer id')
    })

    it('should search an explicit window for a deposit older than the default', async () => {
      const fromTimestamp = new Date('2026-01-01T00:00:00.000Z')
      const toTimestamp = new Date('2026-01-20T00:00:00.000Z')

      await protocolWith().getTransfer(TRANSFER_ID, { fromTimestamp, toTimestamp })

      expect(depositAddressesApi.getHistory).toHaveBeenCalledWith({
        depositAddress: DUMMY_SDA_ARBITRUM,
        depositChain: 'ARBITRUM',
        fromTimestamp,
        toTimestamp
      })
    })

    it('should look up a deposit address that itself contains the separator', async () => {
      const tonAddress = '0:83df1234abcd'
      depositAddressesApi.getHistory.mockResolvedValue({
        data: { bridges: [{ _id: 'bridge-ton-1', _tag: 'accepted', history: { state: 'EXECUTED' } }] }
      })

      const transfer = await protocolWith().getTransfer(`TON:${tonAddress}:bridge-ton-1`)

      expect(depositAddressesApi.getHistory).toHaveBeenCalledWith({
        depositAddress: tonAddress,
        depositChain: 'TON',
        fromTimestamp: expect.any(Date)
      })
      expect(transfer.address).toBe(tonAddress)
    })
  })

  describe('disableDepositAddress', () => {
    const ID = `ARBITRUM:${DUMMY_SDA_ARBITRUM}`

    beforeEach(() => {
      depositAddressesApi.updateDepositAddresses.mockResolvedValue({ data: [DUMMY_DEPOSIT_ADDRESS] })
    })

    it('should pause the address on its deposit chain', async () => {
      await expect(protocolWith().disableDepositAddress(ID)).resolves.toBeUndefined()

      expect(depositAddressesApi.updateDepositAddresses).toHaveBeenCalledWith({
        depositAddress: DUMMY_SDA_ARBITRUM,
        action: { _tag: 'Pause', depositChain: 'ARBITRUM' }
      })
    })

    it('should throw if the identifier is not chain-qualified', async () => {
      await expect(protocolWith().disableDepositAddress(DUMMY_SDA_ARBITRUM))
        .rejects.toThrow('is not a valid rhino.fi deposit-address id')
    })

    it('should throw if rhino.fi has no such address', async () => {
      depositAddressesApi.updateDepositAddresses.mockResolvedValue({
        error: { _tag: 'DepositAddressNotFound', addresses: [DUMMY_SDA_ARBITRUM], message: 'not found' }
      })

      await expect(protocolWith().disableDepositAddress(ID)).rejects.toThrow(NoSuchElementError)
    })
  })

  describe('enableDepositAddress', () => {
    const ID = `ARBITRUM:${DUMMY_SDA_ARBITRUM}`

    it('should unpause the address on its deposit chain', async () => {
      depositAddressesApi.updateDepositAddresses.mockResolvedValue({ data: [DUMMY_DEPOSIT_ADDRESS] })

      await expect(protocolWith().enableDepositAddress(ID)).resolves.toBeUndefined()

      expect(depositAddressesApi.updateDepositAddresses).toHaveBeenCalledWith({
        depositAddress: DUMMY_SDA_ARBITRUM,
        action: { _tag: 'Unpause', depositChain: 'ARBITRUM' }
      })
    })
  })

  describe('operations rhino.fi does not support', () => {
    it('should not support client-side address derivation', async () => {
      await expect(protocolWith().deriveDepositAddress({ sourceChains: ['ARBITRUM'], destinationChain: 'BASE' }))
        .rejects.toThrow(UnsupportedOperationError)
    })

    it('should not support address renewal', async () => {
      await expect(protocolWith().renewDepositAddress(`ARBITRUM:${DUMMY_SDA_ARBITRUM}`))
        .rejects.toThrow(UnsupportedOperationError)
    })

    it('should not support deposit recovery', async () => {
      await expect(protocolWith().recoverDepositAddress({ id: `ARBITRUM:${DUMMY_SDA_ARBITRUM}` }))
        .rejects.toThrow(UnsupportedOperationError)
    })

    it('should not support listing deposits by recipient', async () => {
      await expect(protocolWith().getTransfersByRecipient('BASE', DUMMY_RECIPIENT))
        .rejects.toThrow(UnsupportedOperationError)
    })
  })
})

