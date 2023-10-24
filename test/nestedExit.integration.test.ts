// pnpm test -- nestedExit.integration.test.ts
import { describe, expect, test, beforeAll } from 'vitest';
import dotenv from 'dotenv';
dotenv.config();

import {
    Client,
    createTestClient,
    http,
    parseUnits,
    publicActions,
    PublicActions,
    TestActions,
    TransactionReceipt,
    WalletActions,
    walletActions,
} from 'viem';

import {
    Slippage,
    NestedExit,
    replaceWrapped,
    NestedPoolState,
    TokenAmount,
} from '../src/entities';
import { Address } from '../src/types';

import { BALANCER_RELAYER, CHAINS, ChainId } from '../src/utils';

import {
    approveToken,
    sendTransactionGetBalances,
    setTokenBalance,
} from './lib/utils/helper';
import { Relayer } from '../src/entities/relayer';
import {
    NestedProportionalExitInput,
    NestedSingleTokenExitInput,
} from '../src/entities/nestedExit/types';
import { grantRoles } from './lib/utils/relayerHelper';

/**
 * Deploy the new relayer contract with the new helper address:
 *
 * in the mono repo:
 * cd pkg/standalone-utils
 * forge create --rpc-url http://0.0.0.0:8545 --private-key 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80 contracts/BatchRelayerQueryLibrary.sol:BatchRelayerQueryLibrary --constructor-args "0xBA12222222228d8Ba445958a75a0704d566BF2C8"
 *
 * [take the address]
 *
 * forge create --rpc-url http://0.0.0.0:8545 --private-key 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80 contracts/relayer/BalancerRelayer.sol:BalancerRelayer --constructor-args "0xBA12222222228d8Ba445958a75a0704d566BF2C8" "0xf77018c0d817da22cadbdf504c00c0d32ce1e5c2" "[paste the address]" "5"
 *
 * update `BALANCER_RELAYER` on constants.ts
 *
 */

type TxInput = {
    poolAddress: Address;
    amountIn: bigint;
    chainId: ChainId;
    rpcUrl: string;
    testAddress: Address;
    client: Client & PublicActions & TestActions & WalletActions;
    tokenOut?: Address;
    useNativeAssetAsWrappedAmountOut?: boolean;
};

describe('nested exit test', () => {
    let chainId: ChainId;
    let rpcUrl: string;
    let client: Client & PublicActions & TestActions & WalletActions;
    let poolAddress: Address;
    let testAddress: Address;

    beforeAll(async () => {
        // setup chain and test client
        chainId = ChainId.MAINNET;
        rpcUrl = 'http://127.0.0.1:8545/';
        client = createTestClient({
            mode: 'hardhat',
            chain: CHAINS[chainId],
            transport: http(rpcUrl),
        })
            .extend(publicActions)
            .extend(walletActions);

        testAddress = (await client.getAddresses())[0];

        poolAddress = '0x08775ccb6674d6bdceb0797c364c2653ed84f384'; // WETH-3POOL-BPT

        // Fork setup - done only once per fork reset
        // Governance grant roles to the relayer
        await grantRoles(client);

        // User approve vault to spend their tokens and update user balance
        await approveToken(
            client,
            testAddress,
            '0x08775ccb6674d6bdceb0797c364c2653ed84f384',
        );
        await setTokenBalance(
            client,
            testAddress,
            '0x08775ccb6674d6bdceb0797c364c2653ed84f384',
            0,
            parseUnits('1000', 18),
        );
    });

    test('proportional exit', async () => {
        const amountIn = parseUnits('1', 18);

        const {
            transactionReceipt,
            expectedDeltas,
            balanceDeltas,
            amountsOut,
            slippage,
            minAmountsOut,
        } = await doTransaction({
            poolAddress,
            amountIn,
            chainId,
            rpcUrl,
            testAddress,
            client,
        });

        assertResults(
            transactionReceipt,
            expectedDeltas,
            balanceDeltas,
            amountsOut,
            slippage,
            minAmountsOut,
        );
    });

    test('proportional exit - native asset', async () => {
        const amountIn = parseUnits('1', 18);

        const {
            transactionReceipt,
            expectedDeltas,
            balanceDeltas,
            amountsOut,
            slippage,
            minAmountsOut,
        } = await doTransaction({
            poolAddress,
            amountIn,
            chainId,
            rpcUrl,
            testAddress,
            client,
            useNativeAssetAsWrappedAmountOut: true,
        });

        assertResults(
            transactionReceipt,
            expectedDeltas,
            balanceDeltas,
            amountsOut,
            slippage,
            minAmountsOut,
        );
    });

    test('single token exit', async () => {
        const amountIn = parseUnits('1', 18);
        const tokenOut = '0x6b175474e89094c44da98b954eedeac495271d0f'; // DAI

        const {
            transactionReceipt,
            expectedDeltas,
            balanceDeltas,
            amountsOut,
            slippage,
            minAmountsOut,
        } = await doTransaction({
            poolAddress,
            amountIn,
            chainId,
            rpcUrl,
            testAddress,
            client,
            tokenOut,
        });

        assertResults(
            transactionReceipt,
            expectedDeltas,
            balanceDeltas,
            amountsOut,
            slippage,
            minAmountsOut,
        );
    });

    test('single token exit - native asset', async () => {
        const amountIn = parseUnits('1', 18);
        const tokenOut = '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2'; // WETH

        const {
            transactionReceipt,
            expectedDeltas,
            balanceDeltas,
            amountsOut,
            slippage,
            minAmountsOut,
        } = await doTransaction({
            poolAddress,
            amountIn,
            chainId,
            rpcUrl,
            testAddress,
            client,
            tokenOut,
            useNativeAssetAsWrappedAmountOut: true,
        });

        assertResults(
            transactionReceipt,
            expectedDeltas,
            balanceDeltas,
            amountsOut,
            slippage,
            minAmountsOut,
        );
    });
});

export const doTransaction = async ({
    poolAddress,
    amountIn,
    chainId,
    rpcUrl,
    testAddress,
    client,
    tokenOut,
    useNativeAssetAsWrappedAmountOut = false,
}: TxInput) => {
    // setup mock api
    const api = new MockApi();
    // get pool state from api
    const nestedPoolFromApi = await api.getNestedPool(poolAddress);

    // setup join helper
    const nestedExit = new NestedExit();
    const exitInput: NestedProportionalExitInput | NestedSingleTokenExitInput =
        {
            bptAmountIn: amountIn,
            chainId,
            rpcUrl,
            accountAddress: testAddress,
            useNativeAssetAsWrappedAmountOut,
            tokenOut,
        };
    const queryResult = await nestedExit.query(exitInput, nestedPoolFromApi);

    // build join call with expected minBpOut based on slippage
    const slippage = Slippage.fromPercentage('1'); // 1%

    const signature = await Relayer.signRelayerApproval(
        BALANCER_RELAYER[chainId],
        testAddress,
        client,
    );

    const { call, to, minAmountsOut } = nestedExit.buildCall({
        ...queryResult,
        slippage,
        sender: testAddress,
        recipient: testAddress,
        relayerApprovalSignature: signature,
    });

    let tokensOut = minAmountsOut.map((a) => a.token);
    if (useNativeAssetAsWrappedAmountOut) {
        tokensOut = replaceWrapped(tokensOut, chainId);
    }

    // send join transaction and check balance changes
    const { transactionReceipt, balanceDeltas } =
        await sendTransactionGetBalances(
            [
                queryResult.bptAmountIn.token.address,
                ...tokensOut.map((t) => t.address),
            ],
            client,
            testAddress,
            to,
            call,
        );

    const expectedDeltas = [
        queryResult.bptAmountIn.amount,
        ...queryResult.amountsOut.map((amountOut) => amountOut.amount),
    ];

    return {
        transactionReceipt,
        expectedDeltas,
        balanceDeltas,
        amountsOut: queryResult.amountsOut,
        slippage,
        minAmountsOut,
    };
};

/*********************** Mock To Represent API Requirements **********************/

export class MockApi {
    public async getNestedPool(address: Address): Promise<NestedPoolState> {
        if (address !== '0x08775ccb6674d6bdceb0797c364c2653ed84f384')
            throw Error();
        return {
            pools: [
                {
                    id: '0x08775ccb6674d6bdceb0797c364c2653ed84f3840002000000000000000004f0',
                    address: '0x08775ccb6674d6bdceb0797c364c2653ed84f384',
                    type: 'Weighted',
                    level: 1,
                    tokens: [
                        {
                            address:
                                '0x79c58f70905f734641735bc61e45c19dd9ad60bc', // 3POOL-BPT
                            decimals: 18,
                            index: 0,
                        },
                        {
                            address:
                                '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2', // WETH
                            decimals: 18,
                            index: 1,
                        },
                    ],
                },
                {
                    id: '0x79c58f70905f734641735bc61e45c19dd9ad60bc0000000000000000000004e7',
                    address: '0x79c58f70905f734641735bc61e45c19dd9ad60bc',
                    type: 'ComposableStable',
                    level: 0,
                    tokens: [
                        {
                            address:
                                '0x6b175474e89094c44da98b954eedeac495271d0f', // DAI
                            decimals: 18,
                            index: 0,
                        },
                        {
                            address:
                                '0x79c58f70905f734641735bc61e45c19dd9ad60bc', // 3POOL-BPT
                            decimals: 18,
                            index: 1,
                        },
                        {
                            address:
                                '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48', // USDC
                            decimals: 6,
                            index: 2,
                        },
                        {
                            address:
                                '0xdac17f958d2ee523a2206206994597c13d831ec7', // USDT
                            decimals: 6,
                            index: 3,
                        },
                    ],
                },
            ],
            mainTokens: [
                {
                    address: '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2', // WETH
                    decimals: 18,
                },
                {
                    address: '0x6b175474e89094c44da98b954eedeac495271d0f', // DAI
                    decimals: 18,
                },
                {
                    address: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48', // USDC
                    decimals: 6,
                },
                {
                    address: '0xdac17f958d2ee523a2206206994597c13d831ec7', // USDT
                    decimals: 6,
                },
            ],
        };
    }
}

function assertResults(
    transactionReceipt: TransactionReceipt,
    expectedDeltas: bigint[],
    balanceDeltas: bigint[],
    amountsOut: TokenAmount[],
    slippage: Slippage,
    minAmountsOut: TokenAmount[],
) {
    expect(transactionReceipt.status).to.eq('success');
    amountsOut.map((amountOut) => expect(amountOut.amount > 0n).to.be.true);
    expect(expectedDeltas).to.deep.eq(balanceDeltas);
    const expectedMinAmountsOut = amountsOut.map((amountOut) =>
        slippage.removeFrom(amountOut.amount),
    );
    expect(expectedMinAmountsOut).to.deep.eq(
        minAmountsOut.map((a) => a.amount),
    );
}
/******************************************************************************/
