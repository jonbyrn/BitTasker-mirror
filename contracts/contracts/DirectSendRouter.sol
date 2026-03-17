// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title DirectSendRouter
 * @notice Meta-transaction router for USDT transfers with EIP-712 signatures
 * @dev Users sign transfer requests off-chain, sponsor submits on-chain, pays gas in BNB
 *      Treasury receives fixed fee in USDT, contract never holds user funds (non-custodial)
 */

interface IDirectSendRouter {
  event Transfer(
    address indexed from,
    address indexed to,
    uint256 amount,
    uint256 fee
  );

  event MetaTransfer(
    address indexed user,
    address indexed recipient,
    uint256 amount,
    uint256 fee,
    uint256 nonce
  );

  function route(
    address user,
    address recipient,
    uint256 amount,
    uint256 nonce,
    uint256 deadline,
    bytes calldata signature
  ) external returns (bool);

  function pause() external;
  function unpause() external;
}

/**
 * @title DirectSendRouter
 * @dev Meta-transaction router using EIP-712 signatures
 */
contract DirectSendRouter is IDirectSendRouter, ReentrancyGuard, Ownable {
  // Immutable state variables
  IERC20 public immutable USDT;
  uint256 public immutable FIXED_FEE; // Fee in atomic units (6 decimals for USDT)
  address public immutable treasury;  // Receives the fixed fee
  address public immutable sponsor;   // Pays gas, submits transactions

  // Mutable state
  bool private paused;
  mapping(address => uint256) public nonces; // Replay protection

  // EIP-712 domain separator
  bytes32 public immutable DOMAIN_SEPARATOR;
  bytes32 public constant TRANSFER_TYPEHASH = keccak256(
    "TransferRequest(address user,address recipient,uint256 amount,uint256 nonce,uint256 deadline)"
  );

  // Custom errors
  error InvalidSignature();
  error InvalidUser();
  error InvalidRecipient();
  error InvalidAmount();
  error ExpiredDeadline();
  error InvalidNonce();
  error ContractPaused();
  error TransferFailed();
  error InsufficientBalance();
  error InsufficientAllowance();
  error NotSponsor();

  /**
   * @notice Initialize DirectSendRouter
   * @param _usdt USDT token contract address
   * @param _treasury Treasury wallet for fee collection
   * @param _fixedFee Fixed fee per transfer in atomic units (6 decimals = $0.01)
   * @param _sponsor Sponsor address that pays gas and submits transactions
   */
  constructor(
    address _usdt,
    address _treasury,
    uint256 _fixedFee,
    address _sponsor
  ) Ownable(msg.sender) {
    require(_usdt != address(0), "Invalid USDT address");
    require(_treasury != address(0), "Invalid treasury address");
    require(_sponsor != address(0), "Invalid sponsor address");
    require(_fixedFee > 0, "Fee must be positive");

    USDT = IERC20(_usdt);
    treasury = _treasury;
    FIXED_FEE = _fixedFee;
    sponsor = _sponsor;
    paused = false;

    // EIP-712 domain separator
    DOMAIN_SEPARATOR = keccak256(
      abi.encode(
        keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
        keccak256("DirectSendRouter"),
        keccak256("1"),
        block.chainid,
        address(this)
      )
    );
  }

  /**
   * @notice Execute a meta-transaction
   * @param user The user who signed the transfer request
   * @param recipient The recipient of the USDT
   * @param amount The amount of USDT to transfer (in atomic units)
   * @param nonce The user's nonce for replay protection
   * @param deadline The expiration timestamp of the signature
   * @param signature The EIP-712 signature from the user
   * @return success True if transfer succeeded
   */
  function route(
    address user,
    address recipient,
    uint256 amount,
    uint256 nonce,
    uint256 deadline,
    bytes calldata signature
  ) external nonReentrant returns (bool) {
    // Validate caller is sponsor
    if (msg.sender != sponsor) revert NotSponsor();

    // Validate contract is not paused
    if (paused) revert ContractPaused();

    // Validate inputs
    if (user == address(0)) revert InvalidUser();
    if (recipient == address(0)) revert InvalidRecipient();
    if (amount == 0) revert InvalidAmount();

    // Validate deadline
    if (block.timestamp > deadline) revert ExpiredDeadline();

    // Validate nonce
    if (nonces[user] != nonce) revert InvalidNonce();

    // Build EIP-712 digest
    bytes32 digest = keccak256(
      abi.encodePacked(
        "\x19\x01",
        DOMAIN_SEPARATOR,
        keccak256(
          abi.encode(
            TRANSFER_TYPEHASH,
            user,
            recipient,
            amount,
            nonce,
            deadline
          )
        )
      )
    );

    // Verify signature - split from bytes
    if (signature.length != 65) revert InvalidSignature();
    bytes32 r;
    bytes32 s;
    uint8 v;
    assembly {
      r := calldataload(signature.offset)
      s := calldataload(add(signature.offset, 32))
      v := byte(0, calldataload(add(signature.offset, 64)))
    }
    // Validate v value: must be 27, 28 (ETH standard) or 0, 1 (EIP-155 legacy)
    // EIP-155 transforms: v = chainId * 2 + 35 or v = chainId * 2 + 36
    if (v != 27 && v != 28 && v != 0 && v != 1) revert InvalidSignature();

    address signer = ecrecover(digest, v, r, s);
    if (signer != user) revert InvalidSignature();

    // Increment nonce
    nonces[user] = nonce + 1;

    // Calculate total required
    uint256 totalRequired = amount + FIXED_FEE;

    // Verify user has sufficient balance
    uint256 userBalance = USDT.balanceOf(user);
    if (userBalance < totalRequired) revert InsufficientBalance();

    // Verify contract has sufficient allowance
    uint256 allowance = USDT.allowance(user, address(this));
    if (allowance < totalRequired) revert InsufficientAllowance();

    // Transfer amount to recipient
    bool success1 = USDT.transferFrom(user, recipient, amount);
    if (!success1) revert TransferFailed();

    // Transfer fee to treasury
    bool success2 = USDT.transferFrom(user, treasury, FIXED_FEE);
    if (!success2) revert TransferFailed();

    // Emit events
    emit Transfer(user, recipient, amount, FIXED_FEE);
    emit MetaTransfer(user, recipient, amount, FIXED_FEE, nonce);

    return true;
  }

  /**
   * @notice Pause the router (owner only) - for emergencies
   */
  function pause() external onlyOwner {
    paused = true;
  }

  /**
   * @notice Unpause the router (owner only) - resume operations
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
   * @notice Get the EIP-712 domain separator for off-chain signing
   * @return bytes32 The domain separator
   */
  function getDomainSeparator() external view returns (bytes32) {
    return DOMAIN_SEPARATOR;
  }

  /**
   * @notice Get the current nonce for a user
   * @param user The user address
   * @return uint256 The current nonce
   */
  function getNonce(address user) external view returns (uint256) {
    return nonces[user];
  }
}