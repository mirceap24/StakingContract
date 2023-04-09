// SPDX-License-Identifier: MIT
pragma solidity ^0.8.13;

error Staking__AddressZero();
error Staking__ClaimOncePerDay();
error Staking__InvalidAmount();
error Staking__NotEnoughTokens();
error Staking__NoStakedAmount();
error Staking__NoPendingRewards();
error Staking__RewardsNotUpdated();
error Staking__RewardRateZero();
error Staking__TransferFailed();

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/**
 * @title Staking Contract
 * @author mirceamp24
 * @notice This contract allows users to stake ERC20 tokens and receive rewards based on their stake proportion.
 * Users can stake, unstake, restake and claim their rewards. Rewards are updated daily and can only be claimed after being updated.
 * @dev This contract uses the OpenZeppelin ERC20 library for token operations.
 */
contract Staking {
    /* STATE VARIABLES */

    // Token's address that will be staked
    ERC20 public immutable stakedToken;

    // Total amount of tokens staked in the contract
    uint256 public totalStaked;

    uint256 public rewardRate;

    // Informations about stakers
    struct Staker {
        // Amount of tokens that he staked
        uint256 amountStaked;
        // Total amount of rewards claimed by the user
        uint256 pendingRewards;
        // Amount of last reward claimed by the user
        uint256 lastReward;
        // Last time when the user claimed his rewards
        uint48 lastUpdateTime;
        // Check to see if user updated his rewards
        bool rewardsUpdated;
    }

    // Mapping of addresses to Staker struct
    mapping(address => Staker) private stakers;

    /* EVENTS */
    event Staked(address indexed staker, uint256 amountStaked);
    event Unstaked(address indexed staker, uint256 amountUnstaked);
    event RewardClaimed(address indexed staker, uint256 rewards);
    event RewardUpdated(address indexed staker, bool rewardUpdate);

    /* MODIFIERS */
    modifier oncePerDay() {
        Staker memory staker = stakers[msg.sender];
        if (block.timestamp < staker.lastUpdateTime + 86400) {
            revert Staking__ClaimOncePerDay();
        }
        _;
    }

    /* CONSTRUCTOR */
    /**
     * @notice Constructor sets the token address and reward rate
     * @param _stakedToken Address of the ERC20 token to be staked
     * @param _rewardRate Daily reward rate, in tokens
     */
    constructor(address _stakedToken, uint256 _rewardRate) {
        if (_stakedToken == address(0)) {
            revert Staking__AddressZero();
        }
        stakedToken = ERC20(_stakedToken);
        if (_rewardRate == 0) {
            revert Staking__RewardRateZero();
        }
        rewardRate = _rewardRate;
    }

    /**
     * @notice Stakes the specified amount of tokens
     * @dev Transfers tokens from the staker to the contract and updates the staker's
     * information
     * @param _amount Amount of tokens to be staked
     */
    function stake(uint256 _amount) external {
        Staker memory staker = stakers[msg.sender];

        // CHECKS //
        if (_amount == 0) {
            revert Staking__InvalidAmount();
        }
        if (stakedToken.balanceOf(msg.sender) < _amount) {
            revert Staking__NotEnoughTokens();
        }

        // EFFECTS
        staker.amountStaked += _amount;
        totalStaked += _amount;
        stakers[msg.sender] = staker;

        // INTERACTIONS
        bool success = stakedToken.transferFrom(
            msg.sender,
            address(this),
            _amount
        );
        if (!success) {
            revert Staking__TransferFailed();
        }
        emit Staked(msg.sender, _amount);
    }

<<<<<<< Updated upstream
    // User withdraws all his staked amount
    function unstake() external {
=======
    /**
     * @notice Unstakes all the staked tokens for the user
     * @dev Transfers staked tokens back to the staker and resets their staked amount in the
     * contract. Can only be called if unstake conditions are met.
     */
    function unstake() external unstakeConditions {
>>>>>>> Stashed changes
        Staker memory staker = stakers[msg.sender];

        // CHECKS
        if (staker.amountStaked == 0) {
            revert Staking__NoStakedAmount();
        }

        // EFFECTS
        uint256 amountUnstaked = staker.amountStaked;
        staker.amountStaked = 0;
        totalStaked -= amountUnstaked;
        stakers[msg.sender] = staker;

        // INTERACTIONS
        bool success = stakedToken.transfer(msg.sender, amountUnstaked);
        if (!success) {
            revert Staking__TransferFailed();
        }
        emit Unstaked(msg.sender, amountUnstaked);
    }

    /**
     * @notice Claims the total pending rewards
     * @dev Transfers pending rewards to the staker and resets their pending rewards in the
     * contract. Can only be called if rewards have been updated.
     */
    function claimReward() external {
        Staker memory staker = stakers[msg.sender];

        // CHECKS
        if (!staker.rewardsUpdated) {
            revert Staking__RewardsNotUpdated();
        }

        // EFFECTS
        uint256 collectedRewards = staker.pendingRewards;
        staker.pendingRewards = 0;
        staker.rewardsUpdated = false;
        stakers[msg.sender] = staker;

        // INTERACTIONS
        bool success = stakedToken.transfer(msg.sender, collectedRewards);
        if (!success) {
            revert Staking__TransferFailed();
        }
        emit RewardClaimed(msg.sender, collectedRewards);
    }

<<<<<<< Updated upstream
    function restake() external {
=======
    /**
     * @notice Restakes the staker's pending rewards and updates their stake by adding the
     * pending rewards to the previous staked amount
     * @dev Function can only be called if the staker meets the conditions specified in the
     * restakeConditions modifier
     */
    function restake() external restakeConditions {
>>>>>>> Stashed changes
        Staker memory staker = stakers[msg.sender];

        //CHECKS
        if (staker.amountStaked == 0) {
            revert Staking__NoStakedAmount();
        }
        if (!staker.rewardsUpdated) {
            revert Staking__RewardsNotUpdated();
        }

        // EFFECTS
        uint256 restakedAmount = staker.amountStaked + staker.pendingRewards;
        uint256 stakedTotal = totalStaked;
        uint256 oldStake = staker.amountStaked;
        stakedTotal = stakedTotal - staker.amountStaked + restakedAmount;
        staker.amountStaked = restakedAmount;
        uint256 collectedRewards = staker.pendingRewards;
        staker.pendingRewards = 0;
        staker.rewardsUpdated = false;
        staker.lastUpdateTime = uint48(block.timestamp);
        totalStaked = stakedTotal;
        stakers[msg.sender] = staker;

        //INTERACTIONS
        bool success_ = stakedToken.transfer(msg.sender, oldStake);
        if (!success_) {
            revert Staking__TransferFailed();
        }
        bool _success = stakedToken.transfer(msg.sender, collectedRewards);
        if (!_success) {
            revert Staking__TransferFailed();
        }
        bool success__ = stakedToken.transferFrom(
            msg.sender,
            address(this),
            oldStake + collectedRewards
        );
        if (!success__) {
            revert Staking__TransferFailed();
        }
    }

<<<<<<< Updated upstream
    // Reward will be calculated and the user will receive the corresponding amount
    // Reward is updated only one time/day and only users who staked can update their rewards
    function updateReward() external oncePerDay {
        Staker memory staker = stakers[msg.sender];

        // CHECKS
        if (staker.amountStaked == 0) {
            revert Staking__NoStakedAmount();
        }

        // EFFECTS
=======
    /**
     * @notice Updates the daily reward for the staker
     * @dev Calculates and adds the daily reward to the staker's pending rewards. Can only
     * be called if the staker meets the conditions specified in the RewardUpdateConditions modifier
     */
    function updateReward() external RewardUpdateConditions {
        Staker memory staker = stakers[msg.sender];

>>>>>>> Stashed changes
        uint256 _rewardRate = rewardRate;
        uint256 _totalStaked = totalStaked;
        uint256 stakerPercentage = (staker.amountStaked * 1e18) / _totalStaked;
        uint256 rewards = stakerPercentage * _rewardRate;
        staker.lastReward = rewards;
        staker.pendingRewards += rewards;
        staker.lastUpdateTime = uint48(block.timestamp);
        staker.rewardsUpdated = true;
        stakers[msg.sender] = staker;

        emit RewardUpdated(msg.sender, staker.rewardsUpdated);
    }

    /**
     * @notice Retrieves the Staker struct for the specified staker address
     * @param stakerAddress The address of the staker
     * @return Staker memory The Staker struct containing staker's data
     */
    function getStaker(
        address stakerAddress
    ) external view returns (Staker memory) {
        return stakers[stakerAddress];
    }

    /**
     * @notice Retrieves the daily reward rate
     * @return uint256 The daily reward rate for stakers
     */
    function getRewardRate() external view returns (uint256) {
        return rewardRate;
    }

    /**
     * @notice Retrieves the total amount of tokens staked in the contract
     * @return uint256 The total staked tokens
     */
    function getTotalStaked() external view returns (uint256) {
        return totalStaked;
    }
}
