#!/bin/bash
echo "=== SWAP MONITOR START: $(date -Iseconds) ==="
echo "Swap ID: Aq3dd2ooXmxc"
echo "Monitoring for up to 30 minutes..."
echo ""

START_TIME=$(date +%s)
LAST_STATUS=""
POLL_COUNT=0
MAX_POLLS=30

# Initial check
echo "[$(date '+%H:%M:%S')] Initial state check"
echo "--- Boltz API ---"
BOLTZ=$(curl -s "https://api.boltz.exchange/v2/swap/Aq3dd2ooXmxc" 2>/dev/null)
echo "$BOLTZ" | python3 -c "
import sys,json
d=json.load(sys.stdin)
print(f'Status: {d.get(\"status\",\"?\")} | Expected: {d.get(\"expectedAmount\",\"?\")}')
txn = d.get('transaction',{})
if txn:
    print(f'  transaction: {json.dumps(txn)}')
swapln = d.get('swapTree',{})
if swapln:
    print(f'  swapTree keys: {list(swapln.keys()) if isinstance(swapln, dict) else type(swapln).__name__}')
" 2>/dev/null || echo "API error"

CUR_STATUS=$(echo "$BOLTZ" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('status','?'))" 2>/dev/null)
LAST_STATUS="$CUR_STATUS"

echo "--- tBTC on Arbitrum ---"
TBTC_RAW=$(curl -s -X POST https://arb1.arbitrum.io/rpc -H "Content-Type: application/json" -d '{"jsonrpc":"2.0","method":"eth_call","params":[{"to":"0x6c84a8f1c29108F47a79964b5Fe888D4f4D0dE40","data":"0x70a08231000000000000000000000000e1d3f94d0b1abebdbe5e722e68cdeca94a8e7d41"},"latest"],"id":1}')
INITIAL_TBTC=$(echo "$TBTC_RAW" | python3 -c "import sys,json; r=json.load(sys.stdin); print(int(r['result'],16))" 2>/dev/null)
echo "$TBTC_RAW" | python3 -c "import sys,json; r=json.load(sys.stdin); print(f'tBTC: {int(r[\"result\"],16)/1e18:.8f}')" 2>/dev/null || echo "RPC error"

echo "--- USDT0 on Arbitrum ---"
USDT_RAW=$(curl -s -X POST https://arb1.arbitrum.io/rpc -H "Content-Type: application/json" -d '{"jsonrpc":"2.0","method":"eth_call","params":[{"to":"0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9","data":"0x70a08231000000000000000000000000e1d3f94d0b1abebdbe5e722e68cdeca94a8e7d41"},"latest"],"id":1}')
INITIAL_USDT0=$(echo "$USDT_RAW" | python3 -c "import sys,json; r=json.load(sys.stdin); print(int(r['result'],16))" 2>/dev/null)
echo "$USDT_RAW" | python3 -c "import sys,json; r=json.load(sys.stdin); print(f'USDT0: \${int(r[\"result\"],16)/1e6:.2f}')" 2>/dev/null || echo "RPC error"

echo ""
echo "Waiting 60s before first poll..."
sleep 60

while [ $POLL_COUNT -lt $MAX_POLLS ]; do
    POLL_COUNT=$((POLL_COUNT+1))
    echo ""
    echo "=== POLL #$POLL_COUNT at $(date '+%H:%M:%S') ==="
    
    echo "--- Boltz API ---"
    BOLTZ=$(curl -s "https://api.boltz.exchange/v2/swap/Aq3dd2ooXmxc" 2>/dev/null)
    CUR_STATUS=$(echo "$BOLTZ" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('status','?'))" 2>/dev/null)
    echo "$BOLTZ" | python3 -c "
import sys,json
d=json.load(sys.stdin)
print(f'Status: {d.get(\"status\",\"?\")}')
txn = d.get('transaction',{})
if txn:
    print(f'  transaction: {json.dumps(txn)}')
" 2>/dev/null || echo "API error"
    
    if [ "$CUR_STATUS" != "$LAST_STATUS" ]; then
        echo "*** STATUS CHANGE: $LAST_STATUS -> $CUR_STATUS ***"
        LAST_STATUS="$CUR_STATUS"
    fi
    
    echo "--- tBTC ---"
    TBTC_RAW=$(curl -s -X POST https://arb1.arbitrum.io/rpc -H "Content-Type: application/json" -d '{"jsonrpc":"2.0","method":"eth_call","params":[{"to":"0x6c84a8f1c29108F47a79964b5Fe888D4f4D0dE40","data":"0x70a08231000000000000000000000000e1d3f94d0b1abebdbe5e722e68cdeca94a8e7d41"},"latest"],"id":1}')
    echo "$TBTC_RAW" | python3 -c "import sys,json; r=json.load(sys.stdin); print(f'tBTC: {int(r[\"result\"],16)/1e18:.8f}')" 2>/dev/null || echo "RPC error"
    
    echo "--- USDT0 ---"
    USDT_RAW=$(curl -s -X POST https://arb1.arbitrum.io/rpc -H "Content-Type: application/json" -d '{"jsonrpc":"2.0","method":"eth_call","params":[{"to":"0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9","data":"0x70a08231000000000000000000000000e1d3f94d0b1abebdbe5e722e68cdeca94a8e7d41"},"latest"],"id":1}')
    echo "$USDT_RAW" | python3 -c "import sys,json; r=json.load(sys.stdin); print(f'USDT0: \${int(r[\"result\"],16)/1e6:.2f}')" 2>/dev/null || echo "RPC error"
    
    # Check terminal states
    if echo "$CUR_STATUS" | grep -qE "claimed|failed|expired|cancelled|error|refund"; then
        echo ""
        echo "=== TERMINAL STATE REACHED: $CUR_STATUS ==="
        ELAPSED=$(($(date +%s) - START_TIME))
        echo "Total monitoring time: $((ELAPSED/60))m $((ELAPSED%60))s"
        break
    fi
    
    echo "Next poll in 60s..."
    sleep 60
done

echo ""
echo "=== MONITOR COMPLETE at $(date '+%H:%M:%S') ==="
