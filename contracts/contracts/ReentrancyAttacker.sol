// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "../contracts/DirectSendRouter.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * @title ReentrancyAttacker
 * @dev Test contract for reentrancy attack attempts
 */
contract ReentrancyAttacker {
  DirectSendRouter public router;
  IERC20 public usdt;
  uint256 public callCount;

  constructor(address _router, address _usdt) {
    router = DirectSendRouter(_router);
    usdt = IERC20(_usdt);
  }

  // This function attempts a reentrancy attack by calling route again
  function attemptReentrancy(address recipient, uint256 amount, bytes32 sponsorId) external {
    callCount = 0;
    // This will fail due to ReentrancyGuard
    router.route(recipient, amount, sponsorId);
  }
}
