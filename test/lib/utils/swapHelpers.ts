import { Client, PublicActions, TestActions, WalletActions } from 'viem';
import {
    ChainId,
    Slippage,
    Swap,
    ZERO_ADDRESS,
    SwapBuildOutputExactOut,
    NATIVE_ASSETS,
    SwapBuildOutputExactIn,
    VAULT,
    SwapCallExactIn,
    SwapCallExactOut,
    BALANCER_ROUTER,
} from '../../../src';
import { sendTransactionGetBalances } from '../../lib/utils/helper';

export async function assertSwapExactIn(
    client: Client & PublicActions & TestActions & WalletActions,
    rpcUrl: string,
    chainId: ChainId,
    swap: Swap,
    wethIsEth: boolean,
) {
    const testAddress = (await client.getAddresses())[0];
    const slippage = Slippage.fromPercentage('0.1');
    const deadline = 999999999999999999n;

    const expectedAmountOut = await swap.query(rpcUrl);
    expect(expectedAmountOut.amount > 0n).to.be.true;

    let buildCallInput: SwapCallExactIn = {
        slippage,
        deadline,
        expectedAmountOut,
    };
    let contractToCall = BALANCER_ROUTER[chainId];

    if (swap.balancerVersion === 2) {
        buildCallInput = {
            ...buildCallInput,
            sender: testAddress,
            recipient: testAddress,
        };
        contractToCall = VAULT[chainId];
    }
    const call = swap.buildCall(buildCallInput) as SwapBuildOutputExactIn;

    const isEthInput =
        wethIsEth &&
        swap.inputAmount.token.isSameAddress(NATIVE_ASSETS[chainId].wrapped);

    const expectedValue = isEthInput ? swap.inputAmount.amount : 0n;

    expect(call.to).to.eq(contractToCall);
    expect(call.value).to.eq(expectedValue);
    // send swap transaction and check balance changes
    const { transactionReceipt, balanceDeltas } =
        await sendTransactionGetBalances(
            [
                ZERO_ADDRESS,
                swap.inputAmount.token.address,
                swap.outputAmount.token.address,
            ],
            client,
            testAddress,
            call.to,
            call.callData,
            call.value,
        );
    expect(transactionReceipt.status).to.eq('success');

    const isEthOutput =
        wethIsEth &&
        swap.outputAmount.token.isSameAddress(NATIVE_ASSETS[chainId].wrapped);
    let expectedEthDelta = 0n;
    let expectedTokenInDelta = swap.inputAmount.amount;
    let expectedTokenOutDelta = expectedAmountOut.amount;
    if (isEthInput) {
        // Should send eth instead of tokenIn (weth)
        expectedEthDelta = swap.inputAmount.amount;
        expectedTokenInDelta = 0n;
    }
    if (isEthOutput) {
        // should receive eth instead of tokenOut (weth)
        expectedEthDelta = expectedAmountOut.amount;
        expectedTokenOutDelta = 0n;
    }

    expect(balanceDeltas).to.deep.eq([
        expectedEthDelta,
        expectedTokenInDelta,
        expectedTokenOutDelta,
    ]);
}

export async function assertSwapExactOut(
    client: Client & PublicActions & TestActions & WalletActions,
    rpcUrl: string,
    chainId: ChainId,
    swap: Swap,
    wethIsEth: boolean,
) {
    const testAddress = (await client.getAddresses())[0];
    const slippage = Slippage.fromPercentage('0.1');
    const deadline = 999999999999999999n;

    const expectedAmountIn = await swap.query(rpcUrl);

    let buildCallInput: SwapCallExactOut = {
        slippage,
        deadline,
        expectedAmountIn,
    };
    let contractToCall = BALANCER_ROUTER[chainId];

    if (swap.balancerVersion === 2) {
        buildCallInput = {
            ...buildCallInput,
            sender: testAddress,
            recipient: testAddress,
        };
        contractToCall = VAULT[chainId];
    }
    expect(expectedAmountIn.amount > 0n).to.be.true;

    const call = swap.buildCall(buildCallInput) as SwapBuildOutputExactOut;

    const isEthInput =
        wethIsEth &&
        swap.inputAmount.token.isSameAddress(NATIVE_ASSETS[chainId].wrapped);

    // Caller must send amountIn + slippage if ETH
    const expectedValue = isEthInput ? call.maxAmountIn.amount : 0n;

    expect(call.to).to.eq(contractToCall);
    expect(call.value).to.eq(expectedValue);
    // send swap transaction and check balance changes
    const { transactionReceipt, balanceDeltas } =
        await sendTransactionGetBalances(
            [
                ZERO_ADDRESS,
                swap.inputAmount.token.address,
                swap.outputAmount.token.address,
            ],
            client,
            testAddress,
            call.to,
            call.callData,
            call.value,
        );

    expect(transactionReceipt.status).to.eq('success');

    const isEthOutput =
        wethIsEth &&
        swap.outputAmount.token.isSameAddress(NATIVE_ASSETS[chainId].wrapped);
    let expectedEthDelta = 0n;
    let expectedTokenInDelta = expectedAmountIn.amount;
    let expectedTokenOutDelta = swap.outputAmount.amount;
    if (isEthInput) {
        // Should send eth instead of tokenIn (weth)
        expectedEthDelta = expectedAmountIn.amount;
        expectedTokenInDelta = 0n;
    }
    if (isEthOutput) {
        // should receive eth instead of tokenOut (weth)
        expectedEthDelta = swap.outputAmount.amount;
        expectedTokenOutDelta = 0n;
    }

    expect(balanceDeltas).to.deep.eq([
        expectedEthDelta,
        expectedTokenInDelta,
        expectedTokenOutDelta,
    ]);
}
