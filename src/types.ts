import { BigNumber } from '@ethersproject/bignumber';
import { SubgraphProvider } from './poolProvider';
<<<<<<< HEAD
import { Token, TokenAmount, BasePool, BasePoolFactory } from './entities';
=======
import { Token, BasePool } from './entities';
>>>>>>> 7fa57c9 (onchain query and multiple math libs)
import { BaseProvider } from '@ethersproject/providers';

export enum PoolType {
    Weighted = 'Weighted',
    Investment = 'Investment',
    Stable = 'Stable',
    ComposableStable = 'ComposableStable',
    MetaStable = 'MetaStable',
    StablePhantom = 'StablePhantom',
    LiquidityBootstrapping = 'LiquidityBootstrapping',
    AaveLinear = 'AaveLinear',
    ERC4626Linear = 'ERC4626Linear',
    Element = 'Element',
    Gyro2 = 'Gyro2',
    Gyro3 = 'Gyro3',
}

export enum SwapKind {
    GivenIn = 0,
    GivenOut = 1,
}

export interface SwapOptions {
    block?: number;
    slippage?: BigNumber;
    funds?: FundManagement;
    deadline?: BigNumber;
}

export interface FundManagement {
    sender: string;
    fromInternalBalance: boolean;
    recipient: boolean;
    toInternalBalance: boolean;
}

export type SorOptions = {
    onchainBalances: boolean;
    minPercentForPath: number;
};

export type SorConfig = {
    chainId: number;
    provider: BaseProvider;
    poolProvider: SubgraphProvider;
    options?: SorOptions;
    customPoolFactories?: BasePoolFactory[];
};

export type PoolFilters = {
    topN: number;
};

export interface PoolTokenPair {
    id: string;
    pool: BasePool;
    tokenIn: Token;
    tokenOut: Token;
}

export interface SingleSwap {
    poolId: string;
    kind: SwapKind;
    assetIn: string;
    assetOut: string;
    amount: string;
    userData: string;
}

export interface SingleSwap {
    poolId: string;
    kind: SwapKind;
    assetIn: string;
    assetOut: string;
    amount: string;
    userData: string;
}

export interface BatchSwapStep {
    poolId: string;
    assetInIndex: number;
    assetOutIndex: number;
    amount: string;
    userData: string;
}
