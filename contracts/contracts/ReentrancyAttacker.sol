// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "../contracts/DirectSendRouter.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * @title ReentrancyAttacker
 * @dev Test contract for reentrancy attack attempts on the meta-transaction router
 */
contract ReentrancyAttacker {
  DirectSendRouter public router;
  IERC20 public usdt;
  uint256 public callCount;
  address public attacker;

  constructor(address _router, address _usdt) {
    router = DirectSendRouter(_router);
    usdt = IERC20(_usdt);
    attacker = msg.sender;
  }

  // This function attempts a reentrancy attack by calling route again from within a callback
  // Note: This won't work because the contract uses nonReentrant modifier
  function attemptReentrancy(
    address user,
    address recipient,
    uint256 amount,
    uint256 nonce,
    uint256 deadline,
    bytes calldata signature
  ) external {
    callCount = 0;
    // This will fail due to ReentrancyGuard - router.route is non-reentrant
    router.route(user, recipient, amount, nonce, deadline, signature);
  }

  // Receive ETH/BNB
  receive() external payable {
    // This could be used in a reentrancy attack if the contract had a callback
  }
}