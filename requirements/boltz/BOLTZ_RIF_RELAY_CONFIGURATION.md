# Boltz RIF Relay Configuration Issue

## Problem

The gasless swap functionality is not working in the regtest environment because **Boltz backend is not configured to use RIF Relay**. When creating a swap with `gasless: true`, Boltz does not return a `serviceFeeInvoice`, which is required for the two-invoice gasless swap flow.

## Evidence

1. **Console log shows**:
   ```
   ✅ Swap created: {id: 'nZGTEFt78VfI', gasless: true, hasServiceFeeInvoice: false}
   ```
   
2. **RIF Relay is running and healthy**:
   ```bash
   docker ps --filter "name=rif"
   # NAMES             STATUS
   # boltz-rif-relay   Up 11 hours (healthy)
   ```

3. **Boltz config lacks RIF Relay configuration**:
   ```toml
   # No [rsk.relay] section in /boltz-data/boltz.conf
   ```

## Required Configuration

According to Boltz backend source code, the following configuration is needed in `boltz.conf`:

```toml
[rsk]
networkName = "Anvil"
providerEndpoint = "http://anvil:8545"

  # RIF Relay configuration for gasless swaps
  [rsk.relay]
  url = "http://rif-relay:8090"
  workerPrivateKey = "<private_key_with_rbtc_for_gas>"
  relayHubAddress = "<relay_hub_contract_address>"
  
  [[rsk.contracts]]
  etherSwap = "0x8464135c8F25Da09e49BC8782676a84730C318bC"
  erc20Swap = "0x71C95911E9a5D330f4D621842EC243EE1343292e"

  [[rsk.tokens]]
  symbol = "RBTC"
  maxSwapAmount = 4_294_967_00
  minSwapAmount = 10_000
  minWalletBalance = 100_000_000
```

### Getting the Required Values

1. **RIF Relay URL**: `http://rif-relay:8090` (already running)

2. **Worker Private Key**: This should be a private key with RBTC balance to pay for gas. In regtest, you can use one of the Anvil default accounts.

3. **Relay Hub Contract Address**: This is deployed when RIF Relay starts. Check the logs:
   ```bash
   docker logs boltz-rif-relay | grep "RelayHub"
   ```

## How to Fix

### Option 1: Update Boltz Configuration (Recommended)

1. **Stop Boltz backend**:
   ```bash
   cd E:\projects\upw\regtest
   docker-compose stop boltz-backend
   ```

2. **Edit the configuration**:
   ```bash
   # Find the config file location
   docker volume inspect boltz-backend-data
   
   # Edit boltz.conf and add [rsk.relay] section
   ```

3. **Get Relay Hub address**:
   ```bash
   docker logs boltz-rif-relay | grep -A 5 "deployed"
   ```

4. **Restart Boltz**:
   ```bash
   docker-compose start boltz-backend
   docker logs -f boltz-backend
   ```

### Option 2: Contact Regtest Environment Maintainer

The regtest environment at `E:\projects\upw\regtest` appears to be a Boltz official regtest setup. The maintainers should add RIF Relay configuration to the default `boltz.conf` template.

## What This Means for Our Implementation

**Our UI implementation is correct!** The issue is purely a configuration problem in the regtest environment. Once Boltz is configured with RIF Relay:

1. Boltz API will return `serviceFeeInvoice` when `gasless: true` is sent
2. Our step-by-step UI will display both invoices
3. User pays both invoices
4. Boltz detects payments and uses RIF Relay to sponsor gas
5. RBTC is claimed automatically

## Testing Without RIF Relay

For now, you can test the non-gasless flow by ensuring your wallet has RBTC:

1. Send some RBTC to your wallet from Anvil:
   ```bash
   docker exec boltz-scripts bash
   # Inside container:
   cast send --rpc-url http://anvil:8545 \
     --private-key 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80 \
     <your_wallet_address> \
     --value 0.01ether
   ```

2. Create a swap - it will use direct claiming instead of gasless
3. After invoice is paid and lockup confirmed, claim manually

## Next Steps

1. **Immediate**: Update the plan document to note that gasless swaps require proper Boltz RIF Relay configuration
2. **Short-term**: Contact the regtest environment maintainer to add RIF Relay configuration
3. **Long-term**: Document the RIF Relay configuration requirements for production deployments

## References

- Boltz Backend RIF Relay integration: https://github.com/BoltzExchange/boltz-backend/blob/master/lib/swap/RskSwapManager.ts
- RIF Relay documentation: https://github.com/rsksmart/rif-relay
- Our implementation: `src/lib/integrations/boltz/reverseSwapService.ts` (correctly sends `gasless: true`)


