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

contract Staking {
    /* STATE VARIABLES */

    // Token's address that will be staked
    ERC20 public immutable stakedToken;

    // Daily reward rate
    uint256 public immutable rewardRate;

    // Total amount of tokens staked in the contract
    uint256 public totalStaked;

    // Informations about stakers
    struct Staker {
        // Amount of tokens that he staked
        uint256 amountStaked;
        // Total amount of rewards claimed by the user
        uint256 pendingRewards;
        // Amount of last reward claimed by the user
        uint256 lastReward;
        // Time when user first stakes
        uint48 firstStakeTime;
        // Last time when the user claimed his rewards
        uint48 lastUpdateTime;
        // Last stake time
        uint48 lastStakeTime;
        // Check to see if user updated his rewards
        bool rewardsUpdated;
    }

    // Mapping of addresses to Staker struct
    mapping(address => Staker) private stakers;

    /* EVENTS */
    event Staked(address indexed staker, uint256 amountStaked);
    event Unstaked(address indexed staker, uint256 amountUnstaked);
    event Restaked(address indexed staker, uint256 newAmountStaked);
    event RewardClaimed(address indexed staker, uint256 rewards);
    event RewardUpdated(address indexed staker, bool rewardUpdate);

    /* MODIFIERS */
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

    // User stakes a certain amount of tokens in the contract
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

    // User withdraws all his staked amount
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

    // User claims the total reward amount
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

        //INTEGRATIONS
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

    // Reward will be calculated and the user will receive the corresponding amount
    // Reward is updated only one time/day and only users who staked can update their rewards
    function updateReward() external RewardUpdateConditions {
        Staker memory staker = stakers[msg.sender];

        // EFFECTS
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

    function getStaker(
        address stakerAddress
    ) external view returns (Staker memory) {
        return stakers[stakerAddress];
    }

    function getRewardRate() external view returns (uint256) {
        return rewardRate;
    }

    function getTotalStaked() external view returns (uint256) {
        return totalStaked;
    }
}
