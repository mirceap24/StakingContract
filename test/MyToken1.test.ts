import type { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import chai, { expect } from "chai";
import chaiAsPromised from "chai-as-promised";
import { ethers } from "hardhat";

import { MyToken1 } from "../typechain-types";
import { utils } from "../typechain-types/factories/@openzeppelin/contracts";

chai.use(chaiAsPromised);

describe("Contract", function () {
  let myToken1: MyToken1;
  let owner: SignerWithAddress;
  let user: SignerWithAddress;
  let user2: SignerWithAddress;
  let user3: SignerWithAddress;

  beforeEach(async function () {
    [owner, user, user2, user3] = await ethers.getSigners();

    const myToken1Factory = await ethers.getContractFactory("MyToken1");
    myToken1 = (await myToken1Factory.deploy()) as MyToken1;
    await myToken1.deployed();
  });

  it("The constructor should set the correct token name and symbol", async () => {
    expect(await myToken1.name()).to.equal("MyToken1");
    expect(await myToken1.symbol()).to.equal("MTK1");
  });

  it("Owner can mint tokens", async () => {
    await myToken1.mint(user.address, 100);
    const userBalance1 = await myToken1.balanceOf(user.address);
    expect(userBalance1).to.equal(100);
  });

  it("Non-minter account can't mint", async () => {
    await expect(
      myToken1.connect(user).mint(user2.address, 10)
    ).to.be.revertedWith(
      "AccessControl: account " +
        ethers.utils.hexlify(user.address) +
        " is missing role " +
        ethers.utils.hexlify(await myToken1.MINTER_ROLE())
    );
  });

  it("Owner can burn tokens", async () => {
    await myToken1.mint(user.address, 10);
    await myToken1.burn(user.address, 2);
    const userBalance1 = await myToken1.balanceOf(user.address);
    expect(userBalance1).to.equal(8);
  });

  it("Token paused when called by a pauser", async () => {
    await myToken1.pause();
    expect(await myToken1.paused()).to.be.equal(true);
  });

  it("Token unpaused when called by a pauser", async () => {
    await myToken1.pause();
    await myToken1.unpause();
    expect(await myToken1.paused()).to.equal(false);
  });

  it("Non-pauser can't pause the token", async () => {
    await expect(myToken1.connect(user).pause()).to.be.revertedWith(
      "AccessControl: account " +
        ethers.utils.hexlify(user.address) +
        " is missing role " +
        ethers.utils.hexlify(await myToken1.PAUSER_ROLE())
    );
  });

  it("Token transfers aren't allowed when contract is paused", async () => {
    await myToken1.mint(user.address, 10);
    await myToken1.pause();
    await expect(myToken1.connect(user).transfer(user2.address, 5)).to.be
      .reverted;
  });

  it("Minting isn't allowed when contract is paused", async () => {
    await myToken1.mint(user.address, 10);
    await myToken1.pause();
    await expect(myToken1.mint(user.address, 20)).to.be.reverted;
  });

  it("Burning isn't allowed when contract is paused", async () => {
    await myToken1.mint(user.address, 10);
    await myToken1.pause();
    await expect(myToken1.burn(user.address, 5)).to.be.reverted;
  });

  it("Should transfer tokens from the owner to addr1", async () => {
    await myToken1.mint(owner.address, 100);
    await myToken1.transfer(user.address, 50);

    const addr1Balance = await myToken1.balanceOf(user.address);
    expect(addr1Balance).to.equal(50);
  });

  it("Should transfer tokens from user to user2 using transferFrom", async () => {
    await myToken1.mint(user.address, 100);
    await myToken1.connect(user).approve(owner.address, 50);
    await myToken1.transferFrom(user.address, user2.address, 50);

    const addr2Balance = await myToken1.balanceOf(user2.address);
    expect(addr2Balance).to.equal(50);
  });
});
