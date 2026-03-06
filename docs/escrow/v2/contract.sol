// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "@openzeppelin/contracts/utils/ReentrancyGuardTransient.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/utils/Context.sol";
import "@openzeppelin/contracts/metatx/ERC2771Context.sol";

/**
 * @title SecurePaymentContract
 * @notice P2P payment with tier fees, disputes, timelocks, no-show. Supports RIF Relay (trustedForwarder immutable).
 *
 * State machine (key transitions):
 *   Funded(0) --[completeTask]--> Completed(4)
 *   Funded(0) --[disputeTask]--> InDispute(1)
 *   Funded(0) --[markNoShow]--> NoShow(9)
 *   Funded(0) --[cancelPaymentContract]--> Cancelled(5)
 *   Funded(0) --[refundTasker]--> Refunded(6)
 *   WorkInProgress(10) --[completeTask]--> Completed(4)
 *   WorkInProgress(10) --[cancelPaymentContract]--> Cancelled(5)
 *   WorkInProgress(10) --[refundTasker]--> Refunded(6)
 *   NoShow(9) --[completeTask]--> Completed(4)
 *   NoShow(9) --[markWorkInProgress]--> WorkInProgress(10)
 *   NoShow(9) --[claimNoShowRefund]--> Refunded(6)
 *   Completed(4) --[acceptTask]--> FundsReleased(7)
 *   Completed(4) --[disputeTask]--> InDispute(1)
 *   Completed(4) --[resolveAfterTimelock]--> FundsClaimed(8)
 *   Completed(4) --[refundTasker]--> Refunded(6)
 *   InDispute(1) --[acceptProposal]--> DisputeResolved(2)
 *   InDispute(1) --[resolveAfterTimelock]--> DisputeUnresolved(3)
 *   InDispute(1) --[refundTasker]--> Refunded(6)
 */
contract SecurePaymentContract is ERC2771Context, ReentrancyGuardTransient, Ownable, Pausable {
    // =================================================================
    // ======================= TYPES & STRUCTURES ======================
    // =================================================================

    struct SecurePayment {
        // Slot 0: [4b state][2b taskerFeeTier][2b taskeeFeeTier][1b noShowMarked][1b disputeIsTasker][1b disputeAccepted][10b disputeValue][3b totalProposalCount]
        address tasker;
        uint72 amount;
        uint24 stateAndFlagsAndDispute;
        // Slot 1
        address taskee;
        uint32 createdAt;
        uint16 estimatedStartOffset5Minutes;
        uint16 estimatedCompletionOffsetMinutes;
        uint32 timelockStart;
    }

    /** @dev Packed deposit data: cancellationFee, upfrontDeposit, upfrontDepositReleased. */
    struct DepositData {
        uint72 cancellationFee;
        uint72 upfrontDeposit;
        bool upfrontDepositReleased;
    }

    /** @dev Legacy struct for API compatibility. */
    struct SecurePaymentLegacy {
        address tasker;
        uint72 amount;
        uint8 state;
        uint8 taskerFeeTier;
        uint8 taskeeFeeTier;
        address taskee;
        uint32 createdAt;
        uint32 estimatedStartTime;
        uint32 estimatedCompletionTime;
        uint32 timelockEnd;
        bool noShowMarked;
    }

    // =================================================================
    // ======================= CONSTANTS ===============================
    // =================================================================

    // State values
    uint8 private constant STATE_FUNDED = 0;
    uint8 private constant STATE_IN_DISPUTE = 1;
    uint8 private constant STATE_DISPUTE_RESOLVED = 2;
    uint8 private constant STATE_DISPUTE_UNRESOLVED = 3;
    uint8 private constant STATE_COMPLETED = 4;
    uint8 private constant STATE_CANCELLED = 5;
    uint8 private constant STATE_REFUNDED = 6;
    uint8 private constant STATE_FUNDS_RELEASED = 7;
    uint8 private constant STATE_FUNDS_CLAIMED = 8;
    uint8 private constant STATE_NO_SHOW = 9;
    uint8 private constant STATE_WORK_IN_PROGRESS = 10;
    uint8 private constant STATE_IN_DISPUTE_WIP = 11; // Dispute from WorkInProgress

    // Time constants
    uint32 public constant COMPLETION_TIMELOCK = 7 days;
    uint32 public constant DISPUTE_TIMELOCK = 14 days;
    uint32 public constant DISPUTE_WINDOW = 7 days; // Time window to dispute after completion
    uint32 public constant GRACE_PERIOD = 1 hours; // Grace period after payment contract creation
    uint32 public constant CANCELLATION_WINDOW = 24 hours; // Window for cancellation/dispute requirements
    uint32 public constant NO_SHOW_RESPONSE_PERIOD = 24 hours; // Response period for taskee to respond to no-show
    uint32 public constant PROPOSAL_RESPONSE_PERIOD = 24 hours; // Taskee must respond to tasker proposal within 24h
    uint32 private constant FIVE_MINUTES_SECONDS = 300; // 5 * 60
    uint32 private constant MINUTE_SECONDS = 60;

    // Dispute value constants
    uint16 private constant DISPUTE_FULL = 1000;

    // Bit masks for stateAndFlagsAndDispute (uint24)
    // Layout: bits 0-3 state | 4-5 taskerFeeTier | 6-7 taskeeFeeTier | 8 noShowMarked | 9 disputeIsTasker | 10 disputeAccepted | 11-20 disputeValue | 21-23 totalProposalCount
    uint24 private constant MASK_STATE = 0x0F;                    // Bits 0-3: state
    uint24 private constant MASK_CLEAR_STATE = 0xFFFFF0;          // Clear bits 0-3, keep rest
    uint24 private constant MASK_TASKER_FEE_TIER = 0x30;          // Bits 4-5: tasker fee tier (2 bits)
    uint24 private constant MASK_TASKEE_FEE_TIER = 0xC0;          // Bits 6-7: taskee fee tier (2 bits)
    uint24 private constant MASK_NO_SHOW_MARKED = 0x100;          // Bit 8: noShowMarked
    uint24 private constant MASK_DISPUTE_IS_TASKER = 0x200;       // Bit 9: disputeIsTasker
    uint24 private constant MASK_DISPUTE_ACCEPTED = 0x400;        // Bit 10: disputeAccepted
    uint24 private constant MASK_CLEAR_DISPUTE_ACCEPTED = 0xFFFBFF; // Clear bit 10, keep rest
    uint24 private constant MASK_DISPUTE_VALUE = 0x1FF800;         // Bits 11-20: disputeValue (10 bits, 0-1000)
    uint24 private constant MASK_TOTAL_PROPOSAL_COUNT = 0xE00000; // Bits 21-23: totalProposalCount (3 bits, 0-4)
    uint24 private constant MASK_CLEAR_TOTAL_PROPOSAL_COUNT = 0x1FFFFF; // Clear bits 21-23, keep bits 0-20
    uint24 private constant MASK_KEEP_BITS_0_8_AND_PROPOSAL_COUNTS = 0xE001FF; // Keep bits 0-8 and 21-23
    // =================================================================
    // ======================= CUSTOM ERRORS ===========================
    // =================================================================

    error InvalidPaymentContractId();
    error OnlyParties();
    error InvalidTaskee();
    error AmountMustBeGreaterThanZero();
    error InvalidPaymentContractAmount();
    error InvalidEstimatedTimes();
    error InvalidFeeTier();
    error NotInDispute();
    error TaskeeAmountExceedsPaymentContract();
    error ProposalLimitReached();
    error MustWaitForOtherParty();
    error CannotAcceptOwnProposal();
    error AlreadyAccepted();
    error InvalidState();
    error OnlyTasker();
    error OnlyTaskee();
    error OnlyTaskerCanAccept();
    error TaskNotCompleted();
    error CannotCancelAtThisTime();
    error MustBeAfterEstStartTime();
    error CannotDisputeAtThisTime();
    error TimelockNotPassed();
    error OnlyTaskerCanResolveDisputes();
    error TaskerRefundTransferFailed();
    error TaskeeTransferFailed();
    error PlatformFeeTransferFailed();
    error DisputeWindowExpired();
    error NoShowNotMarked();
    error NoShowAlreadyMarked();
    error CannotMarkNoShowBeforeStart();
    error NoShowGracePeriodNotExpired();
    error NoShowResponsePeriodExpired();
    error OwnershipTransferDisabled();
    error OwnershipRenunciationDisabled();
    error InvalidDeposits();
    error CancellationFeeExceedsPaymentContractAmount();
    error UpfrontDepositAlreadyReleased();
    error NoUpfrontDeposit();
    error UpfrontDepositGracePeriodNotExpired();
    error TimeBeforeBase();
    error StartTimeTooFarInFuture();
    error TimeBeforeStart();
    error CompletionTimeTooFarInFuture();
    error InsufficientPaymentContractForUpfrontAndFee();

    // =================================================================
    // ======================= STORAGE & EVENTS ========================
    // =================================================================

    event PaymentContractCreated(uint32 indexed paymentContractId);
    event StateTransition(uint32 indexed paymentContractId, uint8 fromState, uint8 toState, uint32 timestamp);
    event UpfrontDepositClaimed(uint32 indexed paymentContractId, address indexed taskee);

    mapping(uint32 => SecurePayment) private payments;
    mapping(uint32 => DepositData) private depositData;
    uint32 public nextPaymentContractId = 1;

    address private immutable platformFeeDestination;

    // =================================================================
    // ==================== MODIFIERS & CONSTRUCTOR ====================
    // =================================================================

    modifier validPaymentContract(uint32 paymentId) {
        if (paymentId == 0 || paymentId >= nextPaymentContractId) revert InvalidPaymentContractId();
        _;
    }

    modifier onlyParties(uint32 paymentId) {
        SecurePayment storage payment = payments[paymentId];
        address sender = _msgSender();
        if (sender != payment.tasker && sender != payment.taskee) revert OnlyParties();
        _;
    }

    /** @dev trustedForwarder immutable; address(0) = direct-only. */
    constructor(address trustedForwarder) ERC2771Context(trustedForwarder) Ownable(msg.sender) {
        platformFeeDestination = 0x3235358602982970435c164AAb571257458bdE32;
    }

    /** @dev Resolve Context/ERC2771 conflict; direct path when no forwarder. */
    function _msgSender() internal view virtual override(Context, ERC2771Context) returns (address) {
        address forwarder = trustedForwarder();
        if (forwarder == address(0)) return msg.sender;
        return ERC2771Context._msgSender();
    }

    function _msgData() internal view virtual override(Context, ERC2771Context) returns (bytes calldata) {
        return ERC2771Context._msgData();
    }

    function _contextSuffixLength() internal view virtual override(Context, ERC2771Context) returns (uint256) {
        return ERC2771Context._contextSuffixLength();
    }

    // =================================================================
    // ==================== INTERNAL UTILITIES ==========================
    // =================================================================

    // --- Packed data accessors ---
    function _getFeeTiers(uint24 packedData) private pure returns (uint8 taskerFeeTier, uint8 taskeeFeeTier) {
        taskerFeeTier = uint8((packedData & MASK_TASKER_FEE_TIER) >> 4);
        taskeeFeeTier = uint8((packedData & MASK_TASKEE_FEE_TIER) >> 6);
    }

    function _getTotalProposalCount(uint24 packedData) private pure returns (uint8 count) {
        count = uint8((packedData & MASK_TOTAL_PROPOSAL_COUNT) >> 21);
    }

    function _incrementTotalProposalCount(uint24 packedData) private pure returns (uint24 updatedPackedData) {
        uint8 currentCount = uint8((packedData & MASK_TOTAL_PROPOSAL_COUNT) >> 21);
        unchecked {
            currentCount++;
        }
        if (currentCount > 4) revert ProposalLimitReached();
        updatedPackedData = (packedData & MASK_CLEAR_TOTAL_PROPOSAL_COUNT) | (uint24(currentCount) << 21);
    }

    /** @dev Dispute value 0-1000 (0.1% steps) from taskee amount and base. */
    function _calculateDisputeValue(uint72 taskeeAmount, uint72 baseAmount) private pure returns (uint16 value) {
        if (baseAmount == 0) revert AmountMustBeGreaterThanZero();
        value = uint16((uint256(taskeeAmount) * 1000 + baseAmount / 2) / uint256(baseAmount));
        if (taskeeAmount > 0 && value == 0) value = 1;
        if (value > 1000) value = 1000;
    }

    function _setDisputeProposalData(
        uint24 packedData,
        bool isTaskerProposer,
        uint16 disputeValue
    ) private pure returns (uint24 updatedPackedData) {
        updatedPackedData = (packedData & MASK_KEEP_BITS_0_8_AND_PROPOSAL_COUNTS) |
                            (isTaskerProposer ? MASK_DISPUTE_IS_TASKER : 0) |
                            ((uint24(disputeValue) << 11) & MASK_DISPUTE_VALUE);
    }

    // --- Time utilities ---
    function _timestampTo5Minutes(uint32 absoluteTime, uint32 baseTime) private pure returns (uint16) {
        if (absoluteTime < baseTime) revert TimeBeforeBase();
        uint32 diffSeconds = absoluteTime - baseTime;
        uint32 fiveMinuteIntervals = diffSeconds / FIVE_MINUTES_SECONDS;
        if (fiveMinuteIntervals > type(uint16).max) revert StartTimeTooFarInFuture();
        return uint16(fiveMinuteIntervals);
    }

    function _5MinutesToTimestamp(uint32 baseTime, uint16 fiveMinuteIntervals) private pure returns (uint32) {
        return baseTime + (uint32(fiveMinuteIntervals) * FIVE_MINUTES_SECONDS);
    }

    function _timestampToMinutes(uint32 absoluteTime, uint32 startTime) private pure returns (uint16) {
        if (absoluteTime < startTime) revert TimeBeforeStart();
        uint32 diffSeconds = absoluteTime - startTime;
        uint32 minuteCount = diffSeconds / MINUTE_SECONDS;
        if (minuteCount > type(uint16).max) revert CompletionTimeTooFarInFuture();
        return uint16(minuteCount);
    }

    function _minutesToTimestamp(uint32 startTime, uint16 minuteCount) private pure returns (uint32) {
        return startTime + (uint32(minuteCount) * MINUTE_SECONDS);
    }

    function _getEstimatedStartTime(SecurePayment storage payment) private view returns (uint32) {
        return _5MinutesToTimestamp(payment.createdAt, payment.estimatedStartOffset5Minutes);
    }

    function _getEstimatedCompletionTime(SecurePayment storage payment) private view returns (uint32) {
        uint32 startTime = _getEstimatedStartTime(payment);
        return _minutesToTimestamp(startTime, payment.estimatedCompletionOffsetMinutes);
    }

    /** @dev Timelock end from timelockStart and state. */
    /** @dev For disputes: 24h when tasker proposed last (taskee response window); else 14 days. */
    /** @dev packedData is used when state is dispute; pass caller's cached value to avoid redundant SLOAD. */
    function _getTimelockEnd(SecurePayment storage payment, uint8 state, uint24 packedData) private view returns (uint32) {
        uint32 timelockStart = payment.timelockStart;
        if (timelockStart == 0) return 0;

        uint32 timelockDuration;
        if (state == STATE_IN_DISPUTE || state == STATE_IN_DISPUTE_WIP) {
            bool taskerProposedLast = (packedData & MASK_DISPUTE_IS_TASKER) != 0;
            uint8 totalCount = uint8((packedData & MASK_TOTAL_PROPOSAL_COUNT) >> 21);
            timelockDuration = (taskerProposedLast && totalCount > 0 && totalCount < 4) ? PROPOSAL_RESPONSE_PERIOD : DISPUTE_TIMELOCK;
        } else if (state == STATE_COMPLETED) timelockDuration = COMPLETION_TIMELOCK;
        else if (state == STATE_NO_SHOW) timelockDuration = NO_SHOW_RESPONSE_PERIOD;
        else return 0;
        return timelockStart + timelockDuration;
    }

    // --- Fee & amount calculation ---
    function getPlatformFeePercentage(uint8 tier) private pure returns (uint8) {
        unchecked {
            if (tier == 1) return 250; // 2.5%
            if (tier == 2) return 200; // 2.0%
            if (tier == 3) return 150; // 1.5%
        }
        revert InvalidFeeTier();
    }

    function calculateBaseAmount(uint72 totalAmount, uint8 taskerFeeTier) private pure returns (uint72) {
        uint8 taskerFeeBps = getPlatformFeePercentage(taskerFeeTier);
        uint16 totalParts = uint16(10000 + taskerFeeBps);
        return uint72((uint256(totalAmount) * 10000) / uint256(totalParts));
    }

    function _feesOnBase(
        uint72 baseAmount,
        uint8 taskerFeeTier,
        uint8 taskeeFeeTier
    ) private pure returns (
        uint72 taskerFee,
        uint72 taskeeFee,
        uint72 totalPlatformFee
    ) {
        taskerFee = uint72((uint256(baseAmount) * getPlatformFeePercentage(taskerFeeTier)) / 10000);
        taskeeFee = uint72((uint256(baseAmount) * getPlatformFeePercentage(taskeeFeeTier)) / 10000);
        unchecked {
            totalPlatformFee = taskerFee + taskeeFee;
        }
    }

    /** @dev Payout for full completion or partial resolution (disputeValue 0-1000). */
    function _calculatePaymentPayout(
        uint72 paymentAmount,
        uint16 disputeValue,
        uint8 taskerFeeTier,
        uint8 taskeeFeeTier
    ) private pure returns (
        uint72 taskeePayout,
        uint72 taskerRefund,
        uint72 totalPlatformFee
    ) {
        uint72 baseAmount = calculateBaseAmount(paymentAmount, taskerFeeTier);
        bool fullCompletion = (disputeValue == DISPUTE_FULL);

        if (fullCompletion) {
            uint72 taskerFee = paymentAmount - baseAmount;
            uint72 taskeeFee = uint72((uint256(baseAmount) * getPlatformFeePercentage(taskeeFeeTier)) / 10000);
            unchecked {
                totalPlatformFee = taskerFee + taskeeFee;
                taskeePayout = baseAmount - taskeeFee;
            }
            taskerRefund = 0;
        } else {
            uint72 taskeeAmount = uint72((uint256(baseAmount) * uint256(disputeValue)) / 1000);
            (uint72 taskerFee, uint72 taskeeFee, uint72 totFee) = _feesOnBase(taskeeAmount, taskerFeeTier, taskeeFeeTier);
            totalPlatformFee = totFee;
            unchecked {
                taskeePayout = taskeeAmount - taskeeFee;
                taskerRefund = paymentAmount - taskeeAmount - taskerFee;
            }
        }
    }

    // --- Deposit helpers ---
    function _setDepositData(
        uint32 paymentId,
        uint72 cancellationFee,
        uint72 upfrontDeposit
    ) private {
        depositData[paymentId] = DepositData({
            cancellationFee: cancellationFee,
            upfrontDeposit: upfrontDeposit,
            upfrontDepositReleased: false
        });
    }

    // --- State transition ---
    function _transitionState(
        SecurePayment storage payment,
        uint24 packedData,
        uint8 newState,
        uint32 paymentId
    ) private returns (uint24 updatedPackedData) {
        uint8 previousState = uint8(packedData & MASK_STATE);
        updatedPackedData = (packedData & MASK_CLEAR_STATE) | uint24(newState);
        payment.stateAndFlagsAndDispute = updatedPackedData;
        emit StateTransition(paymentId, previousState, newState, uint32(block.timestamp));
    }

    // --- Transfer helpers ---
    function _safeTransferToTasker(address to, uint72 amount) private {
        if (amount > 0) {
            (bool success, ) = payable(to).call{value: amount}("");
            if (!success) revert TaskerRefundTransferFailed();
        }
    }

    function _safeTransferToTaskee(address to, uint72 amount) private {
        if (amount > 0) {
            (bool success, ) = payable(to).call{value: amount}("");
            if (!success) revert TaskeeTransferFailed();
        }
    }

    function _safeTransferPlatformFee(uint72 amount) private {
        if (amount > 0) {
            (bool success, ) = payable(platformFeeDestination).call{value: amount}("");
            if (!success) revert PlatformFeeTransferFailed();
        }
    }

    // =================================================================
    // ==================== PUBLIC API ==================================
    // =================================================================

    // --- Creation & funding ---
    /** @dev Create payment contract; fee tiers 1-3; cancellationFee/upfrontDeposit 0 = not set. */
    function createPaymentContract(
        address taskee,
        uint32 estimatedStartTime,
        uint32 estimatedCompletionTime,
        uint8 taskerFeeTier,
        uint8 taskeeFeeTier,
        uint72 cancellationFee,
        uint72 upfrontDeposit
    ) external payable whenNotPaused returns (uint32) {
        address sender = _msgSender();
        if (sender == taskee || taskee == address(0) || taskee == address(this)) revert InvalidTaskee();
        if (msg.value == 0 || msg.value > type(uint72).max) revert InvalidPaymentContractAmount();
        if (estimatedStartTime <= block.timestamp || estimatedCompletionTime <= estimatedStartTime) revert InvalidEstimatedTimes();
        if (taskerFeeTier < 1 || taskerFeeTier > 3 || taskeeFeeTier < 1 || taskeeFeeTier > 3) revert InvalidFeeTier();

        uint72 totalAmount = uint72(msg.value);
        if (cancellationFee > type(uint72).max - upfrontDeposit) revert InvalidDeposits();
        uint72 totalDeposits = cancellationFee + upfrontDeposit;
        uint72 baseAmount = calculateBaseAmount(totalAmount, taskerFeeTier);
        if (totalDeposits > baseAmount) revert InvalidDeposits();
        if (upfrontDeposit > 0) {
            uint72 taskerFeeOnUpfront = uint72((uint256(upfrontDeposit) * getPlatformFeePercentage(taskerFeeTier)) / 10000);
            if (totalAmount < upfrontDeposit + taskerFeeOnUpfront + cancellationFee) revert InvalidDeposits();
        }

        uint32 paymentId = nextPaymentContractId++;
        uint32 createdAt = uint32(block.timestamp);

        SecurePayment storage payment = payments[paymentId];
        payment.tasker = sender;
        payment.amount = totalAmount;
        payment.taskee = taskee;
        payment.createdAt = createdAt;
        payment.estimatedStartOffset5Minutes = _timestampTo5Minutes(estimatedStartTime, createdAt);
        uint32 startTime = _5MinutesToTimestamp(createdAt, payment.estimatedStartOffset5Minutes);
        payment.estimatedCompletionOffsetMinutes = _timestampToMinutes(estimatedCompletionTime, startTime);
        payment.stateAndFlagsAndDispute = uint24(STATE_FUNDED) | (uint24(taskerFeeTier) << 4) | (uint24(taskeeFeeTier) << 6);
        if (cancellationFee > 0 || upfrontDeposit > 0) {
            _setDepositData(paymentId, cancellationFee, upfrontDeposit);
        }

        emit PaymentContractCreated(paymentId);
        return paymentId;
    }

    /** @dev Taskee claims upfront deposit after grace period; fee taken from payment. */
    /** @dev no onlyParties: OnlyTaskee check below is sufficient; omitting modifier avoids redundant SLOAD of taskee (slot 1). */
    function claimUpfrontDeposit(uint32 paymentId) external validPaymentContract(paymentId) nonReentrant whenNotPaused {
        address sender = _msgSender();
        SecurePayment storage payment = payments[paymentId];
        address taskee = payment.taskee;
        if (sender != taskee) revert OnlyTaskee();

        uint24 packedData = payment.stateAndFlagsAndDispute;
        uint8 state = uint8(packedData & MASK_STATE);
        if (state != STATE_FUNDED && state != STATE_WORK_IN_PROGRESS) revert InvalidState();

        if (block.timestamp <= uint256(payment.createdAt) + GRACE_PERIOD) revert UpfrontDepositGracePeriodNotExpired();

        DepositData storage data = depositData[paymentId];
        if (data.upfrontDeposit == 0) revert NoUpfrontDeposit();
        if (data.upfrontDepositReleased) revert UpfrontDepositAlreadyReleased();

        (uint8 taskerFeeTier, uint8 taskeeFeeTier) = _getFeeTiers(packedData);
        (uint72 taskerFee, uint72 taskeeFee, uint72 totalPlatformFee) = _feesOnBase(
            data.upfrontDeposit, taskerFeeTier, taskeeFeeTier
        );
        if (payment.amount < data.upfrontDeposit + taskerFee) revert InsufficientPaymentContractForUpfrontAndFee();

        data.upfrontDepositReleased = true;
        _safeTransferToTaskee(taskee, data.upfrontDeposit - taskeeFee);
        _safeTransferPlatformFee(totalPlatformFee);
        payment.amount -= data.upfrontDeposit + taskerFee;
        emit UpfrontDepositClaimed(paymentId, taskee);
    }

    // --- Completion path ---
    /** @dev Taskee marks completed; starts 7-day timelock (Funded/NoShow/WorkInProgress). */
    /** @dev no onlyParties: OnlyTaskee check below is sufficient; omitting modifier avoids redundant SLOAD of taskee (slot 1). */
    function completeTask(uint32 paymentId) external validPaymentContract(paymentId) whenNotPaused {
        address sender = _msgSender();
        SecurePayment storage payment = payments[paymentId];
        if (sender != payment.taskee) revert OnlyTaskee();
        uint24 packedData = payment.stateAndFlagsAndDispute;
        uint8 currentState = uint8(packedData & MASK_STATE);
        if (currentState != STATE_FUNDED && currentState != STATE_NO_SHOW && currentState != STATE_WORK_IN_PROGRESS) revert InvalidState();

        uint32 estimatedStartTime = _getEstimatedStartTime(payment);
        if (block.timestamp < uint256(estimatedStartTime)) revert MustBeAfterEstStartTime();

        uint8 previousState = currentState;
        packedData = (packedData & MASK_CLEAR_STATE) | uint24(STATE_COMPLETED);
        payment.stateAndFlagsAndDispute = packedData;
        payment.timelockStart = uint32(block.timestamp);
        emit StateTransition(paymentId, previousState, STATE_COMPLETED, uint32(block.timestamp));
    }

    /** @dev Tasker accepts task and releases payment to taskee (Completed state). */
    /** @dev no onlyParties: OnlyTasker check below is sufficient; omitting modifier avoids redundant SLOAD of tasker (slot 0). */
    function acceptTask(uint32 paymentId) external validPaymentContract(paymentId) nonReentrant whenNotPaused {
        address sender = _msgSender();
        SecurePayment storage payment = payments[paymentId];

        uint24 packedData = payment.stateAndFlagsAndDispute;
        uint8 state = uint8(packedData & MASK_STATE);
        if (state != STATE_COMPLETED) revert TaskNotCompleted();
        if (sender != payment.tasker) revert OnlyTaskerCanAccept();

        uint72 paymentAmount = payment.amount;
        (uint8 taskerFeeTier, uint8 taskeeFeeTier) = _getFeeTiers(packedData);
        (uint72 taskeePayout, , uint72 totalPlatformFee) = _calculatePaymentPayout(
            paymentAmount, DISPUTE_FULL, taskerFeeTier, taskeeFeeTier
        );
        _safeTransferToTaskee(payment.taskee, taskeePayout);
        _safeTransferPlatformFee(totalPlatformFee);
        payment.amount = 0;
        _transitionState(payment, packedData, STATE_FUNDS_RELEASED, paymentId);
    }

    /** @dev Resolve after timelock: InDispute → tasker refund (DisputeUnresolved); Completed → taskee payment (FundsClaimed). */
    function resolveAfterTimelock(uint32 paymentId) external validPaymentContract(paymentId) onlyParties(paymentId) nonReentrant whenNotPaused {
        address sender = _msgSender();
        SecurePayment storage payment = payments[paymentId];
        uint24 packedData = payment.stateAndFlagsAndDispute;
        uint8 paymentState = uint8(packedData & MASK_STATE);
        if (paymentState != STATE_IN_DISPUTE && paymentState != STATE_IN_DISPUTE_WIP && paymentState != STATE_COMPLETED) revert InvalidState();
        uint32 timelockEnd = _getTimelockEnd(payment, paymentState, packedData);
        if (timelockEnd == 0) revert TimelockNotPassed();
        if (block.timestamp <= uint256(timelockEnd)) revert TimelockNotPassed();
        uint72 paymentAmount = payment.amount;
        (uint8 taskerFeeTier, uint8 taskeeFeeTier) = _getFeeTiers(packedData);

        if (paymentState == STATE_IN_DISPUTE || paymentState == STATE_IN_DISPUTE_WIP) {
            address tasker = payment.tasker;
            address taskee = payment.taskee;
            if (sender != tasker) revert OnlyTaskerCanResolveDisputes();
            DepositData memory data = depositData[paymentId];
            uint16 disputeValue = uint16((packedData >> 11) & 0x3FF);
            uint8 totalCount = uint8((packedData & MASK_TOTAL_PROPOSAL_COUNT) >> 21);
            bool taskerProposedLast = (packedData & MASK_DISPUTE_IS_TASKER) != 0;

            if (taskerProposedLast && totalCount > 0) {
                // Taskee didn't respond in 24h: execute tasker's proposal
                (uint72 taskeePayout, uint72 taskerRefund, uint72 totalPlatformFee) =
                    _calculatePaymentPayout(paymentAmount, disputeValue, taskerFeeTier, taskeeFeeTier);
                // In IN_DISPUTE (from Funded/Completed), enforce cancellation fee floor; IN_DISPUTE_WIP can bypass
                if (paymentState == STATE_IN_DISPUTE && data.cancellationFee > 0) {
                    if (data.cancellationFee > paymentAmount) revert CancellationFeeExceedsPaymentContractAmount();
                    (uint72 feeTaskerFee, uint72 feeTaskeeFee, uint72 feeTotalPlatformFee) = _feesOnBase(data.cancellationFee, taskerFeeTier, taskeeFeeTier);
                    uint72 minTaskeePayout = data.cancellationFee - feeTaskeeFee;
                    if (taskeePayout < minTaskeePayout) {
                        taskeePayout = minTaskeePayout;
                        totalPlatformFee = feeTotalPlatformFee;
                        taskerRefund = paymentAmount - data.cancellationFee - feeTaskerFee;
                    }
                }
                _safeTransferToTaskee(taskee, taskeePayout);
                _safeTransferPlatformFee(totalPlatformFee);
                _safeTransferToTasker(tasker, taskerRefund);
                payment.amount = 0;
                _transitionState(payment, packedData, STATE_DISPUTE_RESOLVED, paymentId);
            } else {
                uint72 taskerRefund = paymentAmount;
                uint72 taskeePayout = 0;
                if (paymentState == STATE_IN_DISPUTE && data.cancellationFee > 0) {
                    if (data.cancellationFee > paymentAmount) revert CancellationFeeExceedsPaymentContractAmount();
                    (uint72 taskerFee, uint72 taskeeFee, uint72 totalPlatformFee) = _feesOnBase(data.cancellationFee, taskerFeeTier, taskeeFeeTier);
                    unchecked {
                        taskeePayout = data.cancellationFee - taskeeFee;
                        taskerRefund = paymentAmount - data.cancellationFee - taskerFee;
                    }
                    _safeTransferPlatformFee(totalPlatformFee);
                    _safeTransferToTaskee(taskee, taskeePayout);
                }
                _safeTransferToTasker(tasker, taskerRefund);
                payment.amount = 0;
                _transitionState(payment, packedData, STATE_DISPUTE_UNRESOLVED, paymentId);
            }
        } else {
            address taskee = payment.taskee;
            (uint72 taskeePayout, , uint72 totalPlatformFee) = _calculatePaymentPayout(
                paymentAmount, DISPUTE_FULL, taskerFeeTier, taskeeFeeTier
            );
            _safeTransferToTaskee(taskee, taskeePayout);
            _safeTransferPlatformFee(totalPlatformFee);
            payment.amount = 0;
            _transitionState(payment, packedData, STATE_FUNDS_CLAIMED, paymentId);
        }
    }

    // --- Dispute path ---
    /** @dev Tasker disputes: from Completed within 7d of completion; from Funded past grace and within 24h of start; from WorkInProgress anytime (no-show contest). */
    /** @dev No onlyParties: OnlyTasker check below is sufficient; omitting modifier avoids redundant SLOAD of taskee (slot 1). */
    function disputeTask(uint32 paymentId) external validPaymentContract(paymentId) whenNotPaused {
        SecurePayment storage payment = payments[paymentId];
        address sender = _msgSender();
        if (sender != payment.tasker) revert OnlyTasker();
        uint24 packedData = payment.stateAndFlagsAndDispute;
        uint8 paymentState = uint8(packedData & MASK_STATE);
        uint32 currentTimestamp = uint32(block.timestamp);
        if (paymentState != STATE_FUNDED && paymentState != STATE_COMPLETED && paymentState != STATE_WORK_IN_PROGRESS) revert InvalidState();
        if (paymentState == STATE_COMPLETED) {
            uint32 timelockEnd = _getTimelockEnd(payment, paymentState, packedData);
            if (timelockEnd == 0) revert CannotDisputeAtThisTime();
            uint32 completionTime;
            uint32 disputeWindowEnd;
            unchecked { completionTime = timelockEnd - COMPLETION_TIMELOCK; }
            disputeWindowEnd = completionTime + DISPUTE_WINDOW;
            if (currentTimestamp > disputeWindowEnd) revert DisputeWindowExpired();
        } else if (paymentState == STATE_WORK_IN_PROGRESS) {
            // Tasker can dispute anytime from WorkInProgress (contesting taskee's no-show response)
            // No time checks
        } else {
            // STATE_FUNDED
            uint32 estimatedStartTime = _getEstimatedStartTime(payment);
            uint32 createdAt = payment.createdAt;
            if (currentTimestamp >= estimatedStartTime) revert CannotDisputeAtThisTime();
            uint256 timeUntilStart = uint256(estimatedStartTime) - uint256(currentTimestamp);
            bool pastGracePeriod = currentTimestamp > uint256(createdAt) + GRACE_PERIOD;
            bool withinCancellationWindow = timeUntilStart <= uint256(CANCELLATION_WINDOW);
            if (!pastGracePeriod || !withinCancellationWindow) revert CannotDisputeAtThisTime();
        }
        uint8 newState = (paymentState == STATE_WORK_IN_PROGRESS) ? STATE_IN_DISPUTE_WIP : STATE_IN_DISPUTE;
        uint8 previousState = paymentState;
        packedData = (packedData & MASK_CLEAR_STATE) | uint24(newState);
        payment.stateAndFlagsAndDispute = packedData;
        payment.timelockStart = currentTimestamp;
        emit StateTransition(paymentId, previousState, newState, currentTimestamp);
    }

    /** @dev Propose resolution (taskee amount); alternates tasker/taskee, max 4 total. */
    function proposeResolution(uint32 paymentId, uint72 taskeeAmount)
        external validPaymentContract(paymentId) onlyParties(paymentId) whenNotPaused {
        SecurePayment storage payment = payments[paymentId];

        uint24 packedData = payment.stateAndFlagsAndDispute;
        uint8 state = uint8(packedData & MASK_STATE);
        if (state != STATE_IN_DISPUTE && state != STATE_IN_DISPUTE_WIP) revert NotInDispute();

        address sender = _msgSender();
        bool isTasker = (sender == payment.tasker);
        uint8 totalCount = _getTotalProposalCount(packedData);
        if (totalCount > 0 && ((packedData & MASK_DISPUTE_IS_TASKER) != 0) == isTasker) revert MustWaitForOtherParty();

        uint72 paymentAmount = payment.amount;
        (uint8 taskerFeeTier,) = _getFeeTiers(packedData);
        uint72 baseAmount = calculateBaseAmount(paymentAmount, taskerFeeTier);

        bool allowZero = (state == STATE_IN_DISPUTE_WIP);
        if (taskeeAmount == 0 && !allowZero) revert AmountMustBeGreaterThanZero();
        if (taskeeAmount > baseAmount) revert TaskeeAmountExceedsPaymentContract();

        packedData = _incrementTotalProposalCount(packedData);
        uint16 disputeValue = _calculateDisputeValue(taskeeAmount, baseAmount);
        packedData = _setDisputeProposalData(packedData, isTasker, disputeValue);
        payment.stateAndFlagsAndDispute = packedData;
        if (isTasker) payment.timelockStart = uint32(block.timestamp); // 24h response window for taskee
    }

    /** @dev Accept proposal (non-proposer); distributes funds. */
    function acceptProposal(uint32 paymentId) external validPaymentContract(paymentId) onlyParties(paymentId) nonReentrant whenNotPaused {
        address sender = _msgSender();
        SecurePayment storage payment = payments[paymentId];
        uint24 packedData = payment.stateAndFlagsAndDispute;
        uint8 state = uint8(packedData & MASK_STATE);
        if (state != STATE_IN_DISPUTE && state != STATE_IN_DISPUTE_WIP) revert NotInDispute();
        uint16 disputeValue = uint16((packedData >> 11) & 0x3FF);
        if (_getTotalProposalCount(packedData) == 0) revert NotInDispute();
        bool disputeIsTasker = (packedData & MASK_DISPUTE_IS_TASKER) != 0;
        bool isCallerTasker = (sender == payment.tasker);
        if (disputeIsTasker == isCallerTasker) revert CannotAcceptOwnProposal();
        if ((packedData & MASK_DISPUTE_ACCEPTED) != 0) revert AlreadyAccepted();

        uint72 paymentAmount = payment.amount;
        (uint8 taskerFeeTier, uint8 taskeeFeeTier) = _getFeeTiers(packedData);
        address tasker = payment.tasker;
        address taskee = payment.taskee;

        (uint72 taskeeNetAmount, uint72 taskerRefund, uint72 totalPlatformFee) =
            _calculatePaymentPayout(paymentAmount, disputeValue, taskerFeeTier, taskeeFeeTier);

        _safeTransferToTasker(tasker, taskerRefund);
        _safeTransferToTaskee(taskee, taskeeNetAmount);
        _safeTransferPlatformFee(totalPlatformFee);
        payment.amount = 0;
        packedData = (packedData & MASK_CLEAR_STATE & MASK_CLEAR_DISPUTE_ACCEPTED) | MASK_DISPUTE_ACCEPTED | uint24(STATE_DISPUTE_RESOLVED);
        payment.stateAndFlagsAndDispute = packedData;
        emit StateTransition(paymentId, state, STATE_DISPUTE_RESOLVED, uint32(block.timestamp));
    }

    // --- Cancellation & refund ---
    /** @dev Cancel payment contract; tasker/taskee from Funded or WorkInProgress; tasker loses cancellation fee after grace. */
    function cancelPaymentContract(uint32 paymentId) external validPaymentContract(paymentId) onlyParties(paymentId) nonReentrant whenNotPaused {
        SecurePayment storage payment = payments[paymentId];
        uint24 packedData = payment.stateAndFlagsAndDispute;
        uint8 paymentState = uint8(packedData & MASK_STATE);
        address tasker = payment.tasker;
        bool isTasker = _msgSender() == tasker;
        if (paymentState != STATE_FUNDED && paymentState != STATE_WORK_IN_PROGRESS) revert InvalidState();

        uint72 paymentAmount = payment.amount;
        uint72 taskerRefund = paymentAmount;
        uint72 taskeePayout = 0;

        if (isTasker) {
            DepositData memory data = depositData[paymentId];
            uint32 createdAt = payment.createdAt;
            uint32 estimatedStartTime = _getEstimatedStartTime(payment);
            uint32 estimatedCompletionTime = _getEstimatedCompletionTime(payment);

            bool withinGracePeriod = block.timestamp <= createdAt + GRACE_PERIOD;
            bool pastCompletionWindow = block.timestamp >= uint256(estimatedCompletionTime) + CANCELLATION_WINDOW;
            bool withinCancellationWindowOfStart = block.timestamp + CANCELLATION_WINDOW >= estimatedStartTime;

            if (!withinGracePeriod && withinCancellationWindowOfStart && !pastCompletionWindow) {
                revert CannotCancelAtThisTime();
            }

            if (data.cancellationFee > 0) {
                bool noTaskeeInteraction = pastCompletionWindow && (paymentState == STATE_FUNDED || paymentState == STATE_WORK_IN_PROGRESS);
                if (!withinGracePeriod && !noTaskeeInteraction) {
                    if (data.cancellationFee > paymentAmount) revert CancellationFeeExceedsPaymentContractAmount();
                    (uint8 taskerFeeTier, uint8 taskeeFeeTier) = _getFeeTiers(packedData);
                    (uint72 taskerFee, uint72 taskeeFee, uint72 totalPlatformFee) = _feesOnBase(data.cancellationFee, taskerFeeTier, taskeeFeeTier);
                    unchecked {
                        taskeePayout = data.cancellationFee - taskeeFee;
                        taskerRefund = paymentAmount - data.cancellationFee - taskerFee;
                    }
                    _safeTransferPlatformFee(totalPlatformFee);
                    _safeTransferToTaskee(payment.taskee, taskeePayout);
                }
            }
        }

        _safeTransferToTasker(tasker, taskerRefund);
        payment.amount = 0;
        _transitionState(payment, packedData, STATE_CANCELLED, paymentId);
    }

    /** @dev Taskee refunds full remaining amount to tasker (allowed states: Funded, InDispute, Completed, NoShow, WorkInProgress). */
    /** @dev No onlyParties: OnlyTaskee check below is sufficient; omitting modifier avoids redundant SLOAD of taskee (slot 1). */
    function refundTasker(uint32 paymentId) external validPaymentContract(paymentId) nonReentrant whenNotPaused {
        SecurePayment storage payment = payments[paymentId];
        if (_msgSender() != payment.taskee) revert OnlyTaskee();
        uint24 packedData = payment.stateAndFlagsAndDispute;
        uint8 paymentState = uint8(packedData & MASK_STATE);
        if (paymentState != STATE_FUNDED && paymentState != STATE_IN_DISPUTE && paymentState != STATE_IN_DISPUTE_WIP && paymentState != STATE_COMPLETED && paymentState != STATE_NO_SHOW && paymentState != STATE_WORK_IN_PROGRESS) revert InvalidState();

        uint72 totalRefund = payment.amount;
        address tasker = payment.tasker;
        _safeTransferToTasker(tasker, totalRefund);
        payment.amount = 0;
        _transitionState(payment, packedData, STATE_REFUNDED, paymentId);
    }

    // --- No-show path ---
    /** @dev Tasker marks no-show (Funded, >= start+1h grace); taskee has 24h to respond. */
    /** @dev No onlyParties: OnlyTasker check below is sufficient; omitting modifier avoids redundant SLOAD of taskee (slot 1). */
    function markNoShow(uint32 paymentId) external validPaymentContract(paymentId) whenNotPaused {
        SecurePayment storage payment = payments[paymentId];
        if (_msgSender() != payment.tasker) revert OnlyTasker();
        uint24 packedData = payment.stateAndFlagsAndDispute;
        uint8 state = uint8(packedData & MASK_STATE);
        if (state != STATE_FUNDED) revert InvalidState();
        if ((packedData & MASK_NO_SHOW_MARKED) != 0) revert NoShowAlreadyMarked();

        uint32 estimatedStartTime = _getEstimatedStartTime(payment);
        if (block.timestamp < uint256(estimatedStartTime) + GRACE_PERIOD) revert CannotMarkNoShowBeforeStart();
        uint8 previousState = state;
        packedData = (packedData & MASK_CLEAR_STATE) | MASK_NO_SHOW_MARKED | uint24(STATE_NO_SHOW);
        payment.stateAndFlagsAndDispute = packedData;
        payment.timelockStart = uint32(block.timestamp);
        emit StateTransition(paymentId, previousState, STATE_NO_SHOW, uint32(block.timestamp));
    }

    /** @dev Taskee responds to no-show (WorkInProgress) within 24h. */
    /** @dev No onlyParties: OnlyTaskee check below is sufficient; omitting modifier avoids redundant SLOAD of taskee (slot 1). */
    function markWorkInProgress(uint32 paymentId) external validPaymentContract(paymentId) whenNotPaused {
        SecurePayment storage payment = payments[paymentId];
        if (_msgSender() != payment.taskee) revert OnlyTaskee();
        uint24 packedData = payment.stateAndFlagsAndDispute;
        uint8 state = uint8(packedData & MASK_STATE);
        if (state != STATE_NO_SHOW) revert InvalidState();
        uint32 timelockEnd = _getTimelockEnd(payment, state, packedData);
        if (timelockEnd == 0) revert NoShowNotMarked();
        if (block.timestamp > uint256(timelockEnd)) revert NoShowResponsePeriodExpired();
        uint8 previousState = state;
        packedData = (packedData & MASK_CLEAR_STATE) | uint24(STATE_WORK_IN_PROGRESS);
        payment.stateAndFlagsAndDispute = packedData;
        payment.timelockStart = 0;
        emit StateTransition(paymentId, previousState, STATE_WORK_IN_PROGRESS, uint32(block.timestamp));
    }

    /** @dev Tasker claims full refund after 24h no-show response period. */
    /** @dev No onlyParties: OnlyTasker check below is sufficient; omitting modifier avoids redundant SLOAD of taskee (slot 1). */
    function claimNoShowRefund(uint32 paymentId) external validPaymentContract(paymentId) nonReentrant whenNotPaused {
        SecurePayment storage payment = payments[paymentId];
        if (_msgSender() != payment.tasker) revert OnlyTasker();
        uint24 packedData = payment.stateAndFlagsAndDispute;
        uint8 state = uint8(packedData & MASK_STATE);
        if (state != STATE_NO_SHOW) revert InvalidState();
        uint32 timelockEnd = _getTimelockEnd(payment, state, packedData);
        if (timelockEnd == 0) revert NoShowNotMarked();
        if (block.timestamp <= uint256(timelockEnd)) revert NoShowGracePeriodNotExpired();
        uint72 totalRefund = payment.amount;
        address tasker = payment.tasker;
        _safeTransferToTasker(tasker, totalRefund);
        payment.amount = 0;
        _transitionState(payment, packedData, STATE_REFUNDED, paymentId);
    }

    // =================================================================
    // ======================= VIEW FUNCTIONS ==========================
    // =================================================================

    /** @dev Each party sees only their own fee tier; the other tier is 0 (withheld). */
    function getPaymentContract(uint32 paymentId) external view validPaymentContract(paymentId) onlyParties(paymentId) returns (SecurePaymentLegacy memory) {
        SecurePayment storage payment = payments[paymentId];
        uint24 packedData = payment.stateAndFlagsAndDispute;
        uint8 state = uint8(packedData & MASK_STATE);
        (uint8 taskerFeeTier, uint8 taskeeFeeTier) = _getFeeTiers(packedData);
        address sender = _msgSender();
        bool isTasker = (sender == payment.tasker);
        return SecurePaymentLegacy({
            tasker: payment.tasker,
            amount: payment.amount,
            state: state,
            taskerFeeTier: isTasker ? taskerFeeTier : 0,
            taskeeFeeTier: isTasker ? 0 : taskeeFeeTier,
            taskee: payment.taskee,
            createdAt: payment.createdAt,
            estimatedStartTime: _getEstimatedStartTime(payment),
            estimatedCompletionTime: _getEstimatedCompletionTime(payment),
            timelockEnd: _getTimelockEnd(payment, state, packedData),
            noShowMarked: (packedData & MASK_NO_SHOW_MARKED) != 0
        });
    }

    function getPaymentContractState(uint32 paymentId) external view returns (uint8 state, bool exists, address tasker, address taskee, bool noShowMarked) {
        if (paymentId == 0 || paymentId >= nextPaymentContractId) {
            return (0, false, address(0), address(0), false);
        }
        SecurePayment storage payment = payments[paymentId];
        uint24 packedData = payment.stateAndFlagsAndDispute;
        return (uint8(packedData & MASK_STATE), true, payment.tasker, payment.taskee, (packedData & MASK_NO_SHOW_MARKED) != 0);
    }

    function getEstimatedStartTime(uint32 paymentId) external view validPaymentContract(paymentId) onlyParties(paymentId) returns (uint32) {
        return _getEstimatedStartTime(payments[paymentId]);
    }

    function getEstimatedCompletionTime(uint32 paymentId) external view validPaymentContract(paymentId) onlyParties(paymentId) returns (uint32) {
        return _getEstimatedCompletionTime(payments[paymentId]);
    }

    function getTimelockEnd(uint32 paymentId) external view validPaymentContract(paymentId) onlyParties(paymentId) returns (uint32) {
        SecurePayment storage payment = payments[paymentId];
        uint24 packedData = payment.stateAndFlagsAndDispute;
        return _getTimelockEnd(payment, uint8(packedData & MASK_STATE), packedData);
    }

    // =================================================================
    // ======================= ADMIN & OVERRIDES ========================
    // =================================================================

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    function transferOwnership(address) public pure override {
        revert OwnershipTransferDisabled();
    }

    function renounceOwnership() public pure override {
        revert OwnershipRenunciationDisabled();
    }
}
