// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title DirectSendRouter
 * @notice Routes USDT transfers on BSC with fixed fee collection
 * @dev Uses ERC20 approve + route pattern for gasless UX
 */

interface IDirectSendRouter {
  event Transfer(
    address indexed from,
    address indexed to,
    uint256 amount,
    uint256 fee,
    bytes32 sponsorId
  );

  function route(
    address recipient,
    uint256 amount,
    bytes32 sponsorId
  ) external returns (bool);

  function pause() external;
  function unpause() external;
}

/**
 * @title DirectSendRouter
 * @dev Smart contract for routing USDT transfers with fee collection
 */
contract DirectSendRouter is IDirectSendRouter, ReentrancyGuard, Ownable {
  // State variables
  IERC20 public immutable USDT;
  uint256 public immutable FIXED_FEE;
  address public treasury;
  bool private paused;

  // Custom errors
  error InsufficientUSDTBalance();
  error InsufficientAllowance();
  error TransferFailed();
  error UnauthorizedCaller();
  error ContractPaused();
  error InvalidRecipient();
  error InvalidAmount();

  /**
   * @notice Initialize DirectSendRouter
   * @param _usdt USDT token contract address
   * @param _treasury Treasury wallet for fee collection
   * @param _fixedFee Fixed fee per transfer in atomic units (6 decimals)
   */
  constructor(address _usdt, address _treasury, uint256 _fixedFee) Ownable(msg.sender) {
    require(_usdt != address(0), "Invalid USDT address");
    require(_treasury != address(0), "Invalid treasury address");
    require(_fixedFee > 0, "Fee must be positive");

    USDT = IERC20(_usdt);
    treasury = _treasury;
    FIXED_FEE = _fixedFee;
    paused = false;
  }

  /**
   * @notice Route USDT transfer from sender to recipient with fee collection
   * @param recipient Recipient wallet address
   * @param amount Transfer amount in atomic units
   * @param sponsorId Sponsor ID for tracking
   * @return success True if transfer succeeded
   */
  function route(
    address recipient,
    uint256 amount,
    bytes32 sponsorId
  ) external nonReentrant returns (bool) {
    // Validate contract state
    if (paused) revert ContractPaused();

    // Validate inputs
    if (recipient == address(0)) revert InvalidRecipient();
    if (amount == 0) revert InvalidAmount();

    uint256 totalRequired = amount + FIXED_FEE;

    // Check sender balance
    uint256 senderBalance = USDT.balanceOf(msg.sender);
    if (senderBalance < totalRequired) revert InsufficientUSDTBalance();

    // Check sender allowance
    uint256 allowance = USDT.allowance(msg.sender, address(this));
    if (allowance < totalRequired) revert InsufficientAllowance();

    // Transfer amount to recipient
    bool success1 = USDT.transferFrom(msg.sender, recipient, amount);
    if (!success1) revert TransferFailed();

    // Transfer fee to treasury
    bool success2 = USDT.transferFrom(msg.sender, treasury, FIXED_FEE);
    if (!success2) revert TransferFailed();

    // Emit transfer event with sponsor ID
    emit Transfer(msg.sender, recipient, amount, FIXED_FEE, sponsorId);

    return true;
  }

  /**
   * @notice Pause the router (owner only)
   */
  function pause() external onlyOwner {
    paused = true;
  }

  /**
   * @notice Unpause the router (owner only)
   */
  function unpause() external onlyOwner {
    paused = false;
  }

  /**
   * @notice Check if router is paused
   * @return bool True if paused
   */
  function isPaused() external view returns (bool) {
    return paused;
  }

  /**
   * @notice Update treasury address (owner only)
   * @param _treasury New treasury address
   */
  function setTreasury(address _treasury) external onlyOwner {
    require(_treasury != address(0), "Invalid treasury address");
    treasury = _treasury;
  }
}
