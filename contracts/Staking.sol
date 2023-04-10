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
error Staking__RestakeNotAllowed();
error Staking__UnstakeNotAllowed();
error Staking__UpdateNotEligible();
error Staking__TransferFailed();

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/**
 * @title Staking
 * @author mirceap24
 * @notice A simple staking contract for ERC20 tokens. Allows users to stake tokens,
 * claim rewards, restake rewards, and unstake tokens after a given period of time.
 */
contract Staking {
    /**
     * @notice Address of the staked ERC20 token
     */
    ERC20 public immutable stakedToken;

    /**
     * @notice Daily reward rate
     */
    uint256 public immutable rewardRate;

    /**
     * @notice Total amount of tokens staked in the contract
     */
    uint256 public totalStaked;

    /**
     * @notice Struct to store staker information
     * @param amountStaked Amount of tokens staked by the user
     * @param pendingRewards Total pending rewards for the user
     * @param lastReward Amount of last reward claimed by the user
     * @param firstStakeTime Timestamp of the user's first stake
     * @param lastUpdateTime Timestamp of the user's last reward update
     * @param lastStakeTime Timestamp of the user's last stake
     * @param rewardsUpdated Flag indicating if the user has updated his rewards or not
     */
    struct Staker {
        uint256 amountStaked;
        uint256 pendingRewards;
        uint256 lastReward;
        uint48 firstStakeTime;
        uint48 lastUpdateTime;
        uint48 lastStakeTime;
        bool rewardsUpdated;
    }

    /**
     * @notice Mapping of user addresses to Staker struct
     */
    mapping(address => Staker) private stakers;

    /* EVENTS */
    /**
     * @notice Emitted when a user stakes tokens
     * @param staker The staker's address
     * @param amountStaked Amount of tokens staked
     */
    event Staked(address indexed staker, uint256 amountStaked);

    /**
     * @notice Emitted when a user unstakes tokens
     * @param staker The staker's address
     * @param amountUnstaked Amount of tokens unstaked
     */
    event Unstaked(address indexed staker, uint256 amountUnstaked);

    /**
     * @notice Emitted when a user restakes tokens
     * @param staker The staker's address
     * @param newAmountStaked New total amount of tokens staked
     */
    event Restaked(address indexed staker, uint256 newAmountStaked);

    /**
     * @notice Emitted when a user claims rewards
     * @param staker The staker's address
     * @param rewards The amount of rewards claimed
     */
    event RewardClaimed(address indexed staker, uint256 rewards);

    /**
     * @notice Emitted when a user updates rewards
     * @param staker The staker's address
     * @param rewardUpdate Boolean indicating if rewards have been updated
     */
    event RewardUpdated(address indexed staker, bool rewardUpdate);

    /* MODIFIERS */
    // Here we will check unstake, restake and reward update conditions
    modifier unstakeConditions() {
        Staker memory staker = stakers[msg.sender];
        if (staker.amountStaked == 0) {
            revert Staking__NoStakedAmount();
        }
        if (block.timestamp < staker.lastStakeTime + 86400) {
            revert Staking__UnstakeNotAllowed();
        }
        _;
    }
    modifier restakeConditions() {
        Staker memory staker = stakers[msg.sender];
        if (staker.amountStaked == 0) {
            revert Staking__NoStakedAmount();
        }
        if (!staker.rewardsUpdated) {
            revert Staking__RewardsNotUpdated();
        }
        if (block.timestamp < staker.lastStakeTime + 86400) {
            revert Staking__RestakeNotAllowed();
        }
        _;
    }
    modifier RewardUpdateConditions() {
        Staker memory staker = stakers[msg.sender];
        if (staker.amountStaked == 0) {
            revert Staking__NoStakedAmount();
        }
        if (block.timestamp < staker.firstStakeTime + 86400) {
            revert Staking__UpdateNotEligible();
        }
        if (block.timestamp < staker.lastUpdateTime + 86400) {
            revert Staking__ClaimOncePerDay();
        }
        _;
    }

    /* CONSTRUCTOR */
    /**
     * @notice Creates a new Staking contract
     * @param _stakedToken Address of the staked ERC20 token
     * @param _rewardRate Daily reward rate
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
     * @notice Allows users to stake a specified amount of tokens
     * @param _amount The amount of tokens the user stakes
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
        staker.lastStakeTime = uint48(block.timestamp);
        if (staker.firstStakeTime == 0) {
            staker.firstStakeTime = uint48(block.timestamp);
        }
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

    /**
     * @notice Allows users to unstake all their staked tokens
     */
    function unstake() external unstakeConditions {
        Staker memory staker = stakers[msg.sender];

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
     * @notice Allows users to claim their total pending rewards
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

    /**
     * @notice Allows users to restake their tokens
     * @dev We'll assume that the user has staked and updated rewards
     * Then the user either claims his rewards or unstaked (hence the 24 hour condition)
     * If he first claims his rewards, he will then unstake, and vice versa
     * Then he will stake his previous total staked amount + all the claimed rewards
     */
    function restake() external restakeConditions {
        Staker memory staker = stakers[msg.sender];

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
        staker.lastStakeTime = uint48(block.timestamp);
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

        emit Restaked(msg.sender, restakedAmount);
    }

    /**
     * @notice Updates the user's rewards
     * @dev Rewards are updated only once per day and only for users who staked
     */
    function updateReward() external RewardUpdateConditions {
        Staker memory staker = stakers[msg.sender];
        uint48 daysFromStake;

        if (staker.lastUpdateTime == 0) {
            daysFromStake =
                uint48(block.timestamp - staker.lastStakeTime) /
                86400;
        } else {
            daysFromStake =
                uint48(block.timestamp - staker.lastUpdateTime) /
                86400;
        }

        // EFFECTS
        uint256 _rewardRate = rewardRate;
        uint256 _totalStaked = totalStaked;
        uint256 stakerPercentage = (staker.amountStaked * 1e18) / _totalStaked;
        uint256 rewards = stakerPercentage * _rewardRate * daysFromStake;
        staker.lastReward = rewards;
        staker.pendingRewards += rewards;
        staker.lastUpdateTime = uint48(block.timestamp);
        staker.rewardsUpdated = true;
        stakers[msg.sender] = staker;

        emit RewardUpdated(msg.sender, staker.rewardsUpdated);
    }

    /**
     * @notice Returns staker information for the given staker address
     * @param stakerAddress Address of the staker
     * @return Staker memory struct containing staker information
     */
    function getStaker(
        address stakerAddress
    ) external view returns (Staker memory) {
        return stakers[stakerAddress];
    }

    /**
     * @notice Returns the current daily reward rate
     * @return uint256 The daily reward rate
     */
    function getRewardRate() external view returns (uint256) {
        return rewardRate;
    }

    /**
     * @notice Returns the total amount of tokens staked in the contract
     * @return uint256 The total staked amount
     */
    function getTotalStaked() external view returns (uint256) {
        return totalStaked;
    }
}
