import type { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import chai, { expect } from "chai";
import chaiAsPromised from "chai-as-promised";
import { ethers } from "hardhat";

import { MyToken1, Staking } from "../typechain-types";

chai.use(chaiAsPromised);

describe("Contract", function () {
  let staking: Staking;
  let myToken1: MyToken1;
  let owner: SignerWithAddress;
  let user1: SignerWithAddress;
  let user2: SignerWithAddress;
  let user3: SignerWithAddress;

  beforeEach(async function () {
    [owner, user1, user2, user3] = await ethers.getSigners();

    const myToken1Factory = await ethers.getContractFactory("MyToken1");
    myToken1 = (await myToken1Factory.deploy()) as MyToken1;
    await myToken1.deployed();

    const stakingFactory = await ethers.getContractFactory("Staking");
    staking = (await stakingFactory.deploy(myToken1.address, 100)) as Staking;
    await staking.deployed();
  });

  it("Initializes contract with correct staked token and daily reward rate", async () => {
    const stakedTokenAddress = await staking.stakedToken();
    expect(stakedTokenAddress).to.equal(myToken1.address);

    const dailyReward = await staking.getRewardRate();
    expect(dailyReward).to.equal(100);
  });

  it("Reverts if the staked token is initialized with address 0", async () => {
    const stakingFactory = await ethers.getContractFactory("Staking");
    await expect(
      stakingFactory.deploy(ethers.constants.AddressZero, 100)
    ).to.be.revertedWithCustomError(staking, "Staking__AddressZero");
  });

  it("Reverts if the daily reward is initialized with 0", async () => {
    const stakingFactory = await ethers.getContractFactory("Staking");
    await expect(
      stakingFactory.deploy(staking.address, 0)
    ).to.be.revertedWithCustomError(staking, "Staking__RewardRateZero");
  });

  it("Reverts if a user tries to stake 0 tokens", async () => {
    await myToken1.mint(user1.address, 1000);
    await myToken1.connect(user1).approve(staking.address, 1000);

    await expect(staking.connect(user1).stake(0)).to.be.revertedWithCustomError(
      staking,
      "Staking__InvalidAmount"
    );
  });

  // -----------------------
  /* STAKE FUNCTION TESTS */
  // ------------------------
  it("Reverts if a user has insufficient token balance", async () => {
    await myToken1.mint(user1.address, 1000);
    await myToken1.connect(user1).approve(staking.address, 1000);

    await expect(
      staking.connect(user1).stake(1200)
    ).to.be.revertedWithCustomError(staking, "Staking__NotEnoughTokens");
  });

  it("Initializes the struct correctly when staking for the first time", async () => {
    await myToken1.mint(user1.address, 1000);
    await myToken1.connect(user1).approve(staking.address, 1000);

    await staking.connect(user1).stake(100);
    const staker = await staking.getStaker(user1.address);

    expect(staker.amountStaked).to.equal(100);
    expect(staker.pendingRewards).to.equal(0);
    expect(staker.lastUpdateTime).to.equal(0);
    expect(staker.rewardsUpdated).to.equal(false);
  });

  it("Updates Staker struct and totalStaked correctly", async () => {
    await myToken1.mint(user1.address, 500);
    await myToken1.connect(user1).approve(staking.address, 500);

    // Stake
    await staking.connect(user1).stake(200);

    // Check Staker struct
    const staker = await staking.getStaker(user1.address);
    expect(staker.amountStaked).to.equal(200);

    // Check totalStaked
    const totalStaked = await staking.totalStaked();
    expect(totalStaked).to.equal(200);
  });

  it("Updates the user's total staked amount correctly after multiple stakes", async () => {
    await myToken1.mint(user1.address, 1000);

    await myToken1.connect(user1).approve(staking.address, 1000);

    await staking.connect(user1).stake(100);
    await staking.connect(user1).stake(200);
    const staker = await staking.getStaker(user1.address);

    expect(staker.amountStaked).to.equal(300);
  });

  it("Updates the total staked amount correctly after multiple users stake", async () => {
    await myToken1.mint(user1.address, 1000);
    await myToken1.connect(user1).approve(staking.address, 1000);

    await myToken1.mint(user2.address, 1000);
    await myToken1.connect(user2).approve(staking.address, 1000);

    await staking.connect(user1).stake(100);
    await staking.connect(user2).stake(200);
    const totalStakedAmount = await staking.totalStaked();

    expect(totalStakedAmount).to.equal(300);
  });

  it("Emits Staked event", async () => {
    await myToken1.mint(user1.address, 500);
    await myToken1.connect(user1).approve(staking.address, 500);

    // Stake and check event
    await expect(staking.connect(user1).stake(200))
      .to.emit(staking, "Staked")
      .withArgs(user1.address, 200);
  });

  it("Transfers tokens from the staker's address to the staking contract", async () => {
    await myToken1.mint(user1.address, 1000);
    await myToken1.connect(user1).approve(staking.address, 1000);

    await staking.connect(user1).stake(400);
    const user1Balance = await myToken1.balanceOf(user1.address);
    const stakingContractBalance = await myToken1.balanceOf(staking.address);

    expect(user1Balance).to.equal(600);
    expect(stakingContractBalance).to.equal(400);
  });

  // -----------------------
  /* UNSTAKE FUNCTION TESTS */
  // ------------------------
  it("Unstakes and sets to 0 user's amount staked", async () => {
    await myToken1.mint(user1.address, 500);
    await myToken1.connect(user1).approve(staking.address, 500);

    await staking.connect(user1).stake(500);
    await staking.connect(user1).unstake();

    const staker = await staking.getStaker(user1.address);
    expect(staker.amountStaked).to.equal(0);
  });

  it("Unstakes and updates user's token balance", async () => {
    await myToken1.mint(user1.address, 600);
    await myToken1.connect(user1).approve(staking.address, 500);

    await staking.connect(user1).stake(500);
    await staking.connect(user1).unstake();

    const userBalance = await myToken1.balanceOf(user1.address);
    expect(userBalance).to.equal(600);
  });

  it("Reverts when a user tries to unstake without having any staked tokens", async () => {
    await expect(
      staking.connect(user1).unstake()
    ).to.be.revertedWithCustomError(staking, "Staking__NoStakedAmount");
  });

  it("Updates the total staked amount correctly after a user unstakes", async () => {
    await myToken1.mint(user1.address, 500);
    await myToken1.connect(user1).approve(staking.address, 500);

    await staking.connect(user1).stake(500);
    await staking.connect(user1).unstake();

    const totalStaked = await staking.getTotalStaked();
    expect(totalStaked).to.equal(0);
  });

  it("Updates the total staked amount correctly after multiple users unstake", async () => {
    await myToken1.mint(user1.address, 500);
    await myToken1.connect(user1).approve(staking.address, 500);
    await myToken1.mint(user2.address, 500);
    await myToken1.connect(user2).approve(staking.address, 500);
    await myToken1.mint(user3.address, 500);
    await myToken1.connect(user3).approve(staking.address, 500);

    await staking.connect(user1).stake(300);
    await staking.connect(user2).stake(250);
    await staking.connect(user3).stake(400);

    await staking.connect(user1).unstake();

    const totalStaked = await staking.getTotalStaked();
    expect(totalStaked).to.equal(650);
  });

  it("Emits the Unstaked event with the correct values", async () => {
    await myToken1.mint(user1.address, 500);
    await myToken1.connect(user1).approve(staking.address, 500);

    await staking.connect(user1).stake(240);

    await expect(staking.connect(user1).unstake())
      .to.emit(staking, "Unstaked")
      .withArgs(user1.address, 240);
  });

  // -----------------------
  /* UPDATEREWARD FUNCTION TESTS */
  // ------------------------
  it("Doesn't allow updating rewards if the user hasn't staked (V1)", async () => {
    await myToken1.mint(user1.address, 500);
    await myToken1.connect(user1).approve(staking.address, 500);

    await expect(
      staking.connect(user1).updateReward()
    ).to.be.revertedWithCustomError(staking, "Staking__NoStakedAmount");
  });

  it("Doesn't allow updating rewards if the user hasn't staked (V2)", async () => {
    await myToken1.mint(user1.address, 1000);
    await myToken1.mint(staking.address, 100000);
    await myToken1.connect(user1).approve(staking.address, 1000);

    await staking.connect(user1).stake(500);
    await staking.connect(user1).unstake();

    await expect(
      staking.connect(user1).updateReward()
    ).to.be.revertedWithCustomError(staking, "Staking__NoStakedAmount");
  });

  it("Successfully updates rewards after staking (one staker)", async () => {
    await myToken1.mint(user1.address, 800);
    await myToken1.connect(user1).approve(staking.address, 800);

    await staking.connect(user1).stake(600);
    await staking.connect(user1).updateReward();

    const stakerInfo = await staking.getStaker(user1.address);
    // Check if the update was successful
    expect(stakerInfo.rewardsUpdated).to.be.equal(true);
    const rewardsInDecimal = ethers.utils.formatUnits(
      stakerInfo.pendingRewards,
      18
    );
    // since the user is the only staker he will get 100% of the reward rate
    expect(Number(rewardsInDecimal)).to.be.equal(await staking.getRewardRate());
  });

  it("Successfully updates rewards after staking (two stakers V1)", async () => {
    await myToken1.mint(user1.address, 800);
    await myToken1.connect(user1).approve(staking.address, 800);
    await myToken1.mint(user2.address, 600);
    await myToken1.connect(user2).approve(staking.address, 800);

    await staking.connect(user1).stake(400);
    await staking.connect(user2).stake(400);

    // User1 will update his rewards, should have 50% of the reward rate
    await staking.connect(user1).updateReward();
    const staker1Info = await staking.getStaker(user1.address);
    expect(staker1Info.rewardsUpdated).to.be.equal(true);
    const rewards1InDecimal = ethers.utils.formatUnits(
      staker1Info.pendingRewards,
      18
    );
    // User2 should have the same amount, 50%
    await staking.connect(user2).updateReward();
    const staker2Info = await staking.getStaker(user1.address);
    expect(staker2Info.rewardsUpdated).to.be.equal(true);
    const rewards2InDecimal = ethers.utils.formatUnits(
      staker2Info.pendingRewards,
      18
    );

    expect(Number(rewards1InDecimal)).to.be.equal(50);
    expect(Number(rewards2InDecimal)).to.be.equal(50);
  });

  it("Successfully updates rewards after staking (two stakers V2)", async () => {
    await myToken1.mint(user1.address, 800);
    await myToken1.connect(user1).approve(staking.address, 800);
    await myToken1.mint(user2.address, 600);
    await myToken1.connect(user2).approve(staking.address, 800);

    // User1 will then update this rewards, should have 100% of the reward rate
    await staking.connect(user1).stake(400);
    await staking.connect(user1).updateReward();
    const staker1Info = await staking.getStaker(user1.address);
    expect(staker1Info.rewardsUpdated).to.be.equal(true);
    const rewards1InDecimal = ethers.utils.formatUnits(
      staker1Info.pendingRewards,
      18
    );
    const lastReward1InDecimal = ethers.utils.formatUnits(
      staker1Info.lastReward,
      18
    );
    expect(Number(rewards1InDecimal)).to.be.equal(
      await staking.getRewardRate()
    );

    // User2 will now stake and then update his rewards
    // He should receive approx. 55.55% of the reward rate
    await staking.connect(user2).stake(500);
    await staking.connect(user2).updateReward();
    const staker2Info = await staking.getStaker(user2.address);
    expect(staker2Info.rewardsUpdated).to.be.equal(true);
    const rewards2InDecimal = ethers.utils.formatUnits(
      staker2Info.pendingRewards,
      18
    );
    expect(Number(rewards2InDecimal)).to.be.closeTo(55.55, 0.01);

    await ethers.provider.send("evm_increaseTime", [86400]);
    await ethers.provider.send("evm_mine", []);
    // Now when User1 will update his rewards again he should receive
    // Approx. 44.44% of the reward rate
    await staking.connect(user1).updateReward();
    const staker1Updated = await staking.getStaker(user1.address);
    const rewards3InDecimal = ethers.utils.formatUnits(
      staker1Updated.pendingRewards,
      18
    );
    const lastReward3InDecimal = ethers.utils.formatUnits(
      staker1Updated.lastReward,
      18
    );
    // 100% of the reward rate + 44.44% of the reward rate
    expect(Number(rewards3InDecimal)).to.be.equal(
      Number(lastReward1InDecimal) + Number(lastReward3InDecimal)
    );
  });

  it("Reverts if user updates rewards in less than 24 hours", async () => {
    await myToken1.mint(user1.address, 800);
    await myToken1.connect(user1).approve(staking.address, 800);

    await staking.connect(user1).stake(500);
    await staking.connect(user1).updateReward();
    await ethers.provider.send("evm_increaseTime", [86390]);
    await ethers.provider.send("evm_mine", []);

    await expect(
      staking.connect(user1).updateReward()
    ).to.be.revertedWithCustomError(staking, "Staking__ClaimOncePerDay");
  });

  it("Updates rewards after unstaking and staking again", async () => {
    await myToken1.mint(user1.address, 800);
    await myToken1.connect(user1).approve(staking.address, 800);

    await staking.connect(user1).stake(600);
    await staking.connect(user1).updateReward(); // should have 100% of reward rate
    const stakerInfo1 = await staking.getStaker(user1.address);
    const rewardsInDecimal1 = ethers.utils.formatUnits(
      stakerInfo1.pendingRewards,
      18
    );
    expect(Number(rewardsInDecimal1)).to.be.equal(100);

    await staking.connect(user1).unstake();
    await expect(
      staking.connect(user1).updateReward()
    ).to.be.revertedWithCustomError(staking, "Staking__ClaimOncePerDay");
    await ethers.provider.send("evm_increaseTime", [86400]);
    await ethers.provider.send("evm_mine", []);

    await expect(
      staking.connect(user1).updateReward()
    ).to.be.revertedWithCustomError(staking, "Staking__NoStakedAmount");

    await myToken1.connect(user1).approve(staking.address, 800); // approve tokens again before staking
    await staking.connect(user1).stake(450);
    await staking.connect(user1).updateReward(); // still receives 100% of reward rate

    const stakerInfo2 = await staking.getStaker(user1.address);
    const rewardsInDecimal2 = ethers.utils.formatUnits(
      stakerInfo2.pendingRewards,
      18
    );
    expect(Number(rewardsInDecimal2)).to.be.equal(200);
  });
  // -----------------------
  /* CLAIMREWARD FUNCTION TESTS */
  // ------------------------
  it("Allows users to claim their rewards after updating rewards", async () => {
    await myToken1.mint(user1.address, 1000);
    await myToken1.mint(
      staking.address,
      ethers.utils.parseUnits("1000000", 18)
    );
    await myToken1.connect(user1).approve(staking.address, 1000);

    await staking.connect(user1).stake(500);
    await staking.connect(user1).updateReward();

    const stakerBeforeClaim = await staking.getStaker(user1.address);
    expect(stakerBeforeClaim.rewardsUpdated).to.be.true;
    const rewardsInDecimal = ethers.utils.formatUnits(
      stakerBeforeClaim.pendingRewards,
      18
    );
    expect(Number(rewardsInDecimal)).to.equal(100);

    await expect(staking.connect(user1).claimReward()).to.not.be.reverted;
  });

  it("Updates staker's Struct correctly after claiming rewards", async () => {
    await myToken1.mint(user1.address, 1000);
    await myToken1.mint(
      staking.address,
      ethers.utils.parseUnits("1000000", 18)
    );
    await myToken1.connect(user1).approve(staking.address, 1000);

    await staking.connect(user1).stake(500);
    await staking.connect(user1).updateReward();

    const stakerBeforeClaim = await staking.getStaker(user1.address);
    expect(stakerBeforeClaim.rewardsUpdated).to.be.true;
    const rewardsInDecimal = ethers.utils.formatUnits(
      stakerBeforeClaim.pendingRewards,
      18
    );
    expect(Number(rewardsInDecimal)).to.equal(100);

    await staking.connect(user1).claimReward();
    const stakerAfterClaim = await staking.getStaker(user1.address);

    expect(stakerAfterClaim.pendingRewards).to.equal(0);
    expect(stakerAfterClaim.rewardsUpdated).to.be.false;
    expect(await myToken1.balanceOf(user1.address)).to.be.above(
      stakerBeforeClaim.pendingRewards
    );
  });

  it("Revers if user claims rewards without updating the rewards first", async () => {
    await myToken1.mint(user1.address, 1000);
    await myToken1.mint(
      staking.address,
      ethers.utils.parseUnits("1000000", 18)
    );
    await myToken1.connect(user1).approve(staking.address, 1000);

    await staking.connect(user1).stake(700);
    await expect(
      staking.connect(user1).claimReward()
    ).to.be.revertedWithCustomError(staking, "Staking__RewardsNotUpdated");

    await staking.connect(user1).updateReward();
    await expect(staking.connect(user1).claimReward()).to.not.be.reverted;
  });

  it("Reverts if user claims rewards if he has already claimed them", async () => {
    await myToken1.mint(user1.address, 1000);
    await myToken1.mint(
      staking.address,
      ethers.utils.parseUnits("1000000", 18)
    );
    await myToken1.connect(user1).approve(staking.address, 1000);

    await staking.connect(user1).stake(500);
    await staking.connect(user1).updateReward();
    await staking.connect(user1).claimReward();

    await expect(
      staking.connect(user1).claimReward()
    ).to.be.revertedWithCustomError(staking, "Staking__RewardsNotUpdated");
  });

  it("Allows user to claim rewards if he has any pending rewards", async () => {
    await myToken1.mint(user1.address, 1000);
    await myToken1.mint(
      staking.address,
      ethers.utils.parseUnits("1000000", 18)
    );
    await myToken1.connect(user1).approve(staking.address, 1000);

    await staking.connect(user1).stake(500);
    await staking.connect(user1).updateReward();
    await staking.connect(user1).unstake();

    expect(await staking.connect(user1).claimReward()).to.not.be.reverted;
  });

  it("Emits RewardClaimed event after the user claims his rewards", async () => {
    await myToken1.mint(user1.address, 1000);
    await myToken1.mint(
      staking.address,
      ethers.utils.parseUnits("1000000", 18)
    );
    await myToken1.connect(user1).approve(staking.address, 1000);

    await staking.connect(user1).stake(500);
    await staking.connect(user1).updateReward();
    const stakerInfo = await staking.getStaker(user1.address);
    const rewardsInDecimal = ethers.utils.formatUnits(
      stakerInfo.pendingRewards,
      18
    );

    expect(Number(rewardsInDecimal)).to.equal(await staking.getRewardRate());

    await expect(staking.connect(user1).claimReward())
      .to.emit(staking, "RewardClaimed")
      .withArgs(user1.address, 100000000000000000000n); // 100 with 18 decimals
  });

  it("Transfers rewards to the user's account after claiming", async () => {
    await myToken1.mint(user1.address, ethers.utils.parseUnits("1000", 18));
    await myToken1.mint(user2.address, ethers.utils.parseUnits("1000", 18));

    await myToken1.mint(
      staking.address,
      ethers.utils.parseUnits("1000000", 18)
    );
    await myToken1
      .connect(user1)
      .approve(staking.address, ethers.utils.parseUnits("1000", 18));
    await myToken1
      .connect(user2)
      .approve(staking.address, ethers.utils.parseUnits("1000", 18));

    await staking.connect(user1).stake(ethers.utils.parseUnits("500", 18));
    await staking.connect(user2).stake(ethers.utils.parseUnits("500", 18));
    await staking.connect(user1).updateReward();

    await staking.connect(user1).claimReward();
    const user1BalanceAfterClaim = await myToken1.balanceOf(user1.address);

    const balanceInDecimal = ethers.utils.formatUnits(
      user1BalanceAfterClaim,
      18
    );
    expect(Number(balanceInDecimal)).to.be.equal(550);
  });

  it("Updates user's balance correctly after claiming rewards and unstaking", async () => {
    await myToken1.mint(user1.address, ethers.utils.parseUnits("1000", 18));
    await myToken1.mint(user2.address, ethers.utils.parseUnits("1000", 18));

    await myToken1.mint(
      staking.address,
      ethers.utils.parseUnits("1000000", 18)
    );
    await myToken1
      .connect(user1)
      .approve(staking.address, ethers.utils.parseUnits("1000", 18));
    await myToken1
      .connect(user2)
      .approve(staking.address, ethers.utils.parseUnits("1000", 18));

    const user1BalanceInitial = await myToken1.balanceOf(user1.address);
    const balanceInDecimalInitial = ethers.utils.formatUnits(
      user1BalanceInitial,
      18
    ); // 1000
    //console.log(Number(balanceInDecimalInitial));

    await staking.connect(user1).stake(ethers.utils.parseUnits("500", 18));
    await staking.connect(user2).stake(ethers.utils.parseUnits("500", 18));
    await staking.connect(user1).updateReward();
    const user1BalanceAfterStake = await myToken1.balanceOf(user1.address);
    const balanceInDecimalAfterStake = ethers.utils.formatUnits(
      user1BalanceAfterStake,
      18
    ); // 500
    //console.log(Number(balanceInDecimalAfterStake));

    await staking.connect(user1).claimReward();
    const user1BalanceAfterClaim = await myToken1.balanceOf(user1.address);
    const balanceInDecimalAfterClaim = ethers.utils.formatUnits(
      user1BalanceAfterClaim,
      18
    ); // 550
    //console.log(Number(balanceInDecimalAfterClaim));

    await staking.connect(user1).unstake();
    const user1BalanceAfterUnstake = await myToken1.balanceOf(user1.address);
    const balanceInDecimalAfterUnstake = ethers.utils.formatUnits(
      user1BalanceAfterUnstake,
      18
    ); // 500
    expect(Number(balanceInDecimalAfterUnstake)).to.equal(500 + 550);
  });
  // -----------------------
  /* RESTAKE FUNCTION TESTS */
  // ------------------------
  it("Updates correctly user's amount staked when restaking", async () => {
    await myToken1.mint(user1.address, ethers.utils.parseUnits("1000", 18));

    await myToken1.mint(
      staking.address,
      ethers.utils.parseUnits("1000000", 18)
    );
    await myToken1
      .connect(user1)
      .approve(staking.address, ethers.utils.parseUnits("1000", 18));

    // User stakes
    await staking.connect(user1).stake(ethers.utils.parseUnits("500", 18));
    const user1BalanceAfterStake = await myToken1.balanceOf(user1.address);
    const balanceInDecimalAfterStake = ethers.utils.formatUnits(
      user1BalanceAfterStake,
      18
    );
    //console.log(Number(balanceInDecimalAfterStake)); // 500

    await staking.connect(user1).updateReward();
    const stakerAfterUpdate = await staking.getStaker(user1.address);
    const rewardPending = await stakerAfterUpdate.pendingRewards;
    const rewardPendingInDecimal = ethers.utils.formatUnits(rewardPending, 18);
    //console.log(Number(rewardPendingInDecimal)); // 100

    await myToken1
      .connect(user1)
      .approve(staking.address, ethers.utils.parseUnits("1000", 18));
    await staking.connect(user1).restake();
    const stakerAfterRestake = await staking.getStaker(user1.address);
    const amountRestaked = ethers.utils.formatUnits(
      stakerAfterRestake.amountStaked,
      18
    );

    expect(Number(amountRestaked)).to.be.equal(600);
  });

  it("Resets pending rewards to zero when restaking", async () => {
    // because the user restaked, he claimed his rewards
    // so his pending rewards should be set to 0
    await myToken1.mint(user1.address, ethers.utils.parseUnits("1000", 18));

    await myToken1.mint(
      staking.address,
      ethers.utils.parseUnits("1000000", 18)
    );
    await myToken1
      .connect(user1)
      .approve(staking.address, ethers.utils.parseUnits("1000", 18));

    // User stakes
    await staking.connect(user1).stake(ethers.utils.parseUnits("500", 18));
    const user1BalanceAfterStake = await myToken1.balanceOf(user1.address);
    const balanceInDecimalAfterStake = ethers.utils.formatUnits(
      user1BalanceAfterStake,
      18
    );
    //console.log(Number(balanceInDecimalAfterStake)); // 500

    await staking.connect(user1).updateReward();
    const stakerAfterUpdate = await staking.getStaker(user1.address);
    const rewardPending = await stakerAfterUpdate.pendingRewards;
    const rewardPendingInDecimal = ethers.utils.formatUnits(rewardPending, 18);
    //console.log(Number(rewardPendingInDecimal)); // 100

    await myToken1
      .connect(user1)
      .approve(staking.address, ethers.utils.parseUnits("1000", 18));
    await staking.connect(user1).restake();
    const stakerAfterRestake = await staking.getStaker(user1.address);
    const amountRestaked = ethers.utils.formatUnits(
      stakerAfterRestake.amountStaked,
      18
    );

    expect(stakerAfterRestake.pendingRewards).to.equal(0);
  });

  it("Sets to false if the user updated his rewards", async () => {
    // if the user stakes also his pending rewards, that means he already claimed them
    // therefore now his pending rewards are 0, so if he wants to calculate his rewards again
    // he should call the updateReward() function again
    await myToken1.mint(user1.address, ethers.utils.parseUnits("1000", 18));

    await myToken1.mint(
      staking.address,
      ethers.utils.parseUnits("1000000", 18)
    );
    await myToken1
      .connect(user1)
      .approve(staking.address, ethers.utils.parseUnits("1000", 18));

    // User stakes
    await staking.connect(user1).stake(ethers.utils.parseUnits("500", 18));
    const user1BalanceAfterStake = await myToken1.balanceOf(user1.address);
    const balanceInDecimalAfterStake = ethers.utils.formatUnits(
      user1BalanceAfterStake,
      18
    );
    //console.log(Number(balanceInDecimalAfterStake)); // 500

    await staking.connect(user1).updateReward();
    const stakerAfterUpdate = await staking.getStaker(user1.address);
    const rewardPending = await stakerAfterUpdate.pendingRewards;
    const rewardPendingInDecimal = ethers.utils.formatUnits(rewardPending, 18);
    //console.log(Number(rewardPendingInDecimal)); // 100

    await myToken1
      .connect(user1)
      .approve(staking.address, ethers.utils.parseUnits("1000", 18));
    await staking.connect(user1).restake();
    const stakerAfterRestake = await staking.getStaker(user1.address);

    expect(stakerAfterRestake.rewardsUpdated).to.equal(false);
  });

  it("Reverts if the user has no staked amount", async () => {
    await myToken1.mint(user1.address, ethers.utils.parseUnits("1000", 18));

    await myToken1.mint(
      staking.address,
      ethers.utils.parseUnits("1000000", 18)
    );
    await myToken1
      .connect(user1)
      .approve(staking.address, ethers.utils.parseUnits("1000", 18));

    await expect(
      staking.connect(user1).restake()
    ).to.be.revertedWithCustomError(staking, "Staking__NoStakedAmount");
  });

  it("Reverts when the user has not updated his rewards (V1)", async () => {
    await myToken1.mint(user1.address, ethers.utils.parseUnits("1000", 18));

    await myToken1.mint(
      staking.address,
      ethers.utils.parseUnits("1000000", 18)
    );
    await myToken1
      .connect(user1)
      .approve(staking.address, ethers.utils.parseUnits("1000", 18));

    await staking.connect(user1).stake(ethers.utils.parseUnits("500", 18));

    await myToken1
      .connect(user1)
      .approve(staking.address, ethers.utils.parseUnits("1000", 18));

    await expect(
      staking.connect(user1).restake()
    ).to.be.revertedWithCustomError(staking, "Staking__RewardsNotUpdated");
  });

  it("Reverts when the user has not updated his rewards (V2)", async () => {
    await myToken1.mint(user1.address, ethers.utils.parseUnits("1000", 18));

    await myToken1.mint(
      staking.address,
      ethers.utils.parseUnits("1000000", 18)
    );
    await myToken1
      .connect(user1)
      .approve(staking.address, ethers.utils.parseUnits("1000", 18));

    await staking.connect(user1).stake(ethers.utils.parseUnits("500", 18));
    await staking.connect(user1).updateReward();
    await staking.connect(user1).claimReward();

    await myToken1
      .connect(user1)
      .approve(staking.address, ethers.utils.parseUnits("1000", 18));

    await expect(
      staking.connect(user1).restake()
    ).to.be.revertedWithCustomError(staking, "Staking__RewardsNotUpdated");
    await expect(
      staking.connect(user1).updateReward()
    ).to.be.revertedWithCustomError(staking, "Staking__ClaimOncePerDay");
  });

  it("Updates the totalStaked correctly after restaking", async () => {
    await myToken1.mint(user1.address, ethers.utils.parseUnits("1000", 18));
    await myToken1.mint(
      staking.address,
      ethers.utils.parseUnits("1000000", 18)
    );
    await myToken1
      .connect(user1)
      .approve(staking.address, ethers.utils.parseUnits("1000", 18));

    await staking.connect(user1).stake(ethers.utils.parseUnits("500", 18));
    await staking.connect(user1).updateReward();

    // const totalStakedBeforeRestake = await staking.totalStaked();
    // const totalStakedBeforeRestakeInDecimal = ethers.utils.formatUnits(
    //   totalStakedBeforeRestake,
    //   18
    // );
    await myToken1
      .connect(user1)
      .approve(staking.address, ethers.utils.parseUnits("1000", 18));

    await staking.connect(user1).restake();

    const totalStakedAfterRestake = await staking.totalStaked();
    const totalStakedAfterRestakeInDecimal = ethers.utils.formatUnits(
      totalStakedAfterRestake,
      18
    );

    // new amount will be user's total staked amount + his total rewards
    // in this case 500 + 100
    expect(Number(totalStakedAfterRestakeInDecimal)).to.be.equal(600);
  });

  it("Updates token balances correctly after restaking", async () => {
    /* let's assume that we only have one staker, his balance is 1000 and the contract's balance is 10000
    stakes 500 tokens => user balance 500, contract balance 10500
    updates his rewards: balances remain the same, user will have a pending reward of 100
    claims his rewards: user balance 600, contract balance 10400
    unstakes: user balance 1100 (600 + 500), contract balance: 9900
    restakes: user balance 500 (1100 - 500 - 100), contract balance: 9900 + 600 = 10500*/

    // when restaking user stakes his previous amount of staked tokens + all of his rewards

    await myToken1.mint(user1.address, ethers.utils.parseUnits("1000", 18));
    await myToken1.mint(staking.address, ethers.utils.parseUnits("10000", 18));
    await myToken1
      .connect(user1)
      .approve(staking.address, ethers.utils.parseUnits("1000", 18));

    await staking.connect(user1).stake(ethers.utils.parseUnits("500", 18));
    await staking.connect(user1).updateReward();

    await myToken1
      .connect(user1)
      .approve(staking.address, ethers.utils.parseUnits("1000", 18));
    await staking.connect(user1).restake();

    const userBalanceAfterRestake = await myToken1.balanceOf(user1.address);
    const balanceInDecimalAfterRestake = ethers.utils.formatUnits(
      userBalanceAfterRestake,
      18
    );
    expect(Number(balanceInDecimalAfterRestake)).to.equal(500);

    const contractBalanceAfterRestake = await myToken1.balanceOf(
      staking.address
    );
    const contractBalanceAfterRestakeInDecimal = ethers.utils.formatUnits(
      contractBalanceAfterRestake,
      18
    );
    expect(Number(contractBalanceAfterRestakeInDecimal)).to.equal(10500);
    //console.log(Number(contractBalanceAfterRestakeInDecimal));
  });
});
