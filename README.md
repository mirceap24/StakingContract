# Staking Contract

This project demonstrates a staking contract that allows users to stake, unstake, restake, claim rewards and update rewards.

#### Contract Functions

`stake`

- This function allows users to stake a specified amount of tokens in the contract. The staked amount is added to the user's total staked amount, and the staking time is recorded.
- Parameters:
  - `_amount`: The amount of tokens that will be staked by the user

`unstake`

- This function allows users to unstake all their staked tokens. Users can only unstake after 24 hours from their last staking action. The staked amount is removed from the user's total staked amount and returned to the user's wallet.

`claimReward`

- This function allows users to claim their pending rewards. Users can only claim their rewards if they have updated their rewards first. The claimed rewards are removed from the user's pending rewards and transferred to the user's wallet.

`restake`

- This function allows users to restake their rewards and existing stake after updating their rewards and waiting for 24 hours from their last stake. The rewards and existing stake are combined and restaked by the user. The restaked amount is added to the user's total staked amount and the staking time is recorded.

`updateReward`

- This function allows users to update their rewards. Users can only update their rewards once every 24 hours and after 24 hours from their first stake. The rewards are calculated based on the user's staking percentage and the daily reward rate. The calculated rewards are added to the user's pending rewards.
