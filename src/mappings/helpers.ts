import { BigDecimal, Address, BigInt, Bytes, dataSource, ethereum } from '@graphprotocol/graph-ts';
import { Pool, User, PoolToken, PoolShare, TokenPrice, PoolTransaction, Balancer } from '../types/schema';
import { BToken } from '../types/templates/PoolTokenizer/BToken';
import { CRPFactory } from '../types/Factory/CRPFactory';
import { ConfigurableRightsPool } from '../types/Factory/ConfigurableRightsPool';

export const ZERO_BD = BigDecimal.fromString('0');

const network = dataSource.network();

export const WETH: string =
  network == 'mainnet' ? '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2' : '0xd0a1e359811322d97991e03f863a0c30c2cf029c';

export const USD: string =
  network == 'mainnet'
    ? '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48' // USDC
    : '0x1528f3fcc26d13f7079325fb78d9442607781c8c'; // DAI

export const CRP_FACTORY: string =
  network == 'mainnet' ? '0xed52D8E202401645eDAD1c0AA21e872498ce47D0' : '0x53265f0e014995363AE54DAd7059c018BaDbcD74';

export function hexToDecimal(hexString: string, decimals: i32): BigDecimal {
  const bytes = Bytes.fromHexString(hexString).reverse() as Bytes;
  const bi = BigInt.fromUnsignedBytes(bytes);
  const scale = BigInt.fromI32(10)
    .pow(decimals as u8)
    .toBigDecimal();
  return bi.divDecimal(scale);
}

export function bigIntToDecimal(amount: BigInt, decimals: i32): BigDecimal {
  const scale = BigInt.fromI32(10)
    .pow(decimals as u8)
    .toBigDecimal();
  return amount.toBigDecimal().div(scale);
}

export function tokenToDecimal(amount: BigDecimal, decimals: i32): BigDecimal {
  const scale = BigInt.fromI32(10)
    .pow(decimals as u8)
    .toBigDecimal();
  return amount.div(scale);
}

export function createPoolShareEntity(id: string, pool: string, user: string): void {
  const poolShare = new PoolShare(id);

  createUserEntity(user);

  poolShare.userAddress = user;
  poolShare.poolTokenizerId = pool;
  poolShare.balance = ZERO_BD;
  poolShare.save();
}

export function createPoolTokenEntity(id: string, pool: string, address: string): void {
  const token = BToken.bind(Address.fromString(address));
  //const tokenBytes = BTokenBytes.bind(Address.fromString(address));
  let symbol = '';
  let name = '';
  let decimals = 18;

  // COMMENT THE LINES BELOW OUT FOR LOCAL DEV ON KOVAN

  const symbolCall = token.try_symbol();
  const nameCall = token.try_name();
  const decimalCall = token.try_decimals();

  if (symbolCall.reverted) {
    //const symbolBytesCall = tokenBytes.try_symbol();
    //if (!symbolBytesCall.reverted) {
      //symbol = symbolBytesCall.value.toString();
    //}
  } else {
    symbol = symbolCall.value;
  }

  if (nameCall.reverted) {
    //const nameBytesCall = tokenBytes.try_name();
    //if (!nameBytesCall.reverted) {
      //name = nameBytesCall.value.toString();
    //}
  } else {
    name = nameCall.value;
  }

  if (!decimalCall.reverted) {
    decimals = decimalCall.value;
  }

  const poolToken = new PoolToken(id);
  poolToken.poolId = pool;
  poolToken.address = address;
  poolToken.name = name;
  poolToken.symbol = symbol;
  poolToken.decimals = decimals;
  poolToken.balance = ZERO_BD;
  //poolToken.denormWeight = ZERO_BD
  poolToken.save();
}

export function updatePoolLiquidity(id: string): void {
  const pool = Pool.load(id);
  const tokensList: Array<Bytes> = pool.tokensList;

  if (!tokensList || pool.tokensCount.lt(BigInt.fromI32(2))) return;

  // Find pool liquidity

  let hasPrice = false;
  let hasUsdPrice = false;
  const poolLiquidity = ZERO_BD;

  if (tokensList.includes(Address.fromString(USD))) {
    //const usdPoolTokenId = id.concat('-').concat(USD);
    //const usdPoolToken = PoolToken.load(usdPoolTokenId);
    //poolLiquidity = usdPoolToken.balance.div(usdPoolToken.denormWeight).times(pool.totalWeight)
    hasPrice = true;
    hasUsdPrice = true;
  } else if (tokensList.includes(Address.fromString(WETH))) {
    const wethTokenPrice = TokenPrice.load(WETH);
    if (wethTokenPrice !== null) {
      //const poolTokenId = id.concat('-').concat(WETH);
      //const poolToken = PoolToken.load(poolTokenId);
      //poolLiquidity = wethTokenPrice.price.times(poolToken.balance).div(poolToken.denormWeight).times(pool.totalWeight)
      hasPrice = true;
    }
  }

  // Create or update token price

  if (hasPrice) {
    for (let i: i32 = 0; i < tokensList.length; i++) {
      const tokenPriceId = tokensList[i].toHexString();
      let tokenPrice = TokenPrice.load(tokenPriceId);
      if (tokenPrice == null) {
        tokenPrice = new TokenPrice(tokenPriceId);
        tokenPrice.poolTokenId = '';
        tokenPrice.poolLiquidity = ZERO_BD;
      }

      const poolTokenId = id.concat('-').concat(tokenPriceId);
      const poolToken = PoolToken.load(poolTokenId);

      if (
        (tokenPrice.poolTokenId == poolTokenId || poolLiquidity.gt(tokenPrice.poolLiquidity)) &&
        (tokenPriceId != WETH.toString() || (pool.tokensCount.equals(BigInt.fromI32(2)) && hasUsdPrice))
      ) {
        tokenPrice.price = ZERO_BD;

        if (poolToken.balance.gt(ZERO_BD)) {
          //tokenPrice.price = poolLiquidity.div(pool.totalWeight).times(poolToken.denormWeight).div(poolToken.balance) // TODO
        }

        tokenPrice.symbol = poolToken.symbol;
        tokenPrice.name = poolToken.name;
        tokenPrice.decimals = poolToken.decimals;
        tokenPrice.poolLiquidity = poolLiquidity;
        tokenPrice.poolTokenId = poolTokenId;
        tokenPrice.save();
      }
    }
  }

  // Update pool liquidity

  const liquidity = ZERO_BD;
  //let denormWeight = ZERO_BD

  for (let i: i32 = 0; i < tokensList.length; i++) {
    const tokenPriceId = tokensList[i].toHexString();
    const tokenPrice = TokenPrice.load(tokenPriceId);
    if (tokenPrice !== null) {
      //const poolTokenId = id.concat('-').concat(tokenPriceId);
      //const poolToken = PoolToken.load(poolTokenId);
      //if (poolToken.denormWeight.gt(denormWeight)) {
      //denormWeight = poolToken.denormWeight // TODO
      //liquidity = tokenPrice.price.times(poolToken.balance).div(poolToken.denormWeight).times(pool.totalWeight)
      //}
    }
  }

  const factory = Balancer.load('1');
  factory.totalLiquidity = factory.totalLiquidity.minus(pool.liquidity).plus(liquidity);
  factory.save();

  pool.liquidity = liquidity;
  pool.save();
}

export function decrPoolCount(finalized: boolean): void {
  const factory = Balancer.load('1');
  factory.poolCount -= 1;
  if (finalized) factory.finalizedPoolCount -= 1;
  factory.save();
}

export function saveTransaction(event: ethereum.Event, eventName: string): void {
  const tx = event.transaction.hash.toHexString().concat('-').concat(event.logIndex.toString());
  const userAddress = event.transaction.from.toHex();
  let transaction = PoolTransaction.load(tx);
  if (transaction == null) {
    transaction = new PoolTransaction(tx);
  }
  transaction.event = eventName;
  transaction.poolAddress = event.address.toHex();
  transaction.userAddress = userAddress;
  transaction.gasUsed = event.transaction.gasUsed.toBigDecimal();
  transaction.gasPrice = event.transaction.gasPrice.toBigDecimal();
  transaction.tx = event.transaction.hash;
  transaction.timestamp = event.block.timestamp.toI32();
  transaction.block = event.block.number.toI32();
  transaction.save();

  createUserEntity(userAddress);
}

export function createUserEntity(address: string): void {
  if (User.load(address) == null) {
    const user = new User(address);
    user.save();
  }
}

export function isCrp(address: Address): boolean {
  const crpFactory = CRPFactory.bind(Address.fromString(CRP_FACTORY));
  const isCrp = crpFactory.try_isCrp(address);
  if (isCrp.reverted) return false;
  return isCrp.value;
}

export function getCrpController(crp: ConfigurableRightsPool): string | null {
  const controller = crp.try_getController();
  if (controller.reverted) return null;
  return controller.value.toHexString();
}

export function getCrpSymbol(crp: ConfigurableRightsPool): string {
  const symbol = crp.try_symbol();
  if (symbol.reverted) return '';
  return symbol.value;
}

export function getCrpName(crp: ConfigurableRightsPool): string {
  const name = crp.try_name();
  if (name.reverted) return '';
  return name.value;
}

export function getCrpCap(crp: ConfigurableRightsPool): BigInt {
  const cap = crp.try_getCap();
  if (cap.reverted) return BigInt.fromI32(0);
  return cap.value;
}

export function getCrpRights(crp: ConfigurableRightsPool): string[] {
  const rights = crp.try_rights();
  if (rights.reverted) return [];
  const rightsArr: string[] = [];
  if (rights.value.value0) rightsArr.push('canPauseSwapping');
  if (rights.value.value1) rightsArr.push('canChangeSwapFee');
  if (rights.value.value2) rightsArr.push('canChangeWeights');
  if (rights.value.value3) rightsArr.push('canAddRemoveTokens');
  if (rights.value.value4) rightsArr.push('canWhitelistLPs');
  if (rights.value.value5) rightsArr.push('canChangeCap');
  return rightsArr;
}