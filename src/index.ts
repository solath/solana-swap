import {
    clusterApiUrl,
    sendAndConfirmTransaction,
    Connection,
    Keypair,
    SystemProgram,
    Transaction,
    LAMPORTS_PER_SOL,
    PublicKey,
    TransactionInstruction,
    Account
} from "@solana/web3.js";
import { TokenSwap, TOKEN_SWAP_PROGRAM_ID, TokenSwapLayout, CurveType } from "@solana/spl-token-swap"
import * as token from "@solana/spl-token"

import {
    Metaplex,
    keypairIdentity,
    bundlrStorage,
    toMetaplexFile,
    NftWithToken,
} from "@metaplex-foundation/js"


const fs = require('fs');

// nft part

const tokenName = "chai Nft"
const description = "Chai of gulab"
const symbol = "cchay"
const sellerFeeBasisPoints = 100
const imageFile = "pizza.png"


async function createNft(metaplex: Metaplex, uri: string): Promise<NftWithToken> {
    const { nft } = await metaplex
        .nfts()
        .create({
            uri: uri,
            name: tokenName,
            sellerFeeBasisPoints: sellerFeeBasisPoints,
            symbol: symbol,
        })

    console.log(
        `Token Mint: https://explorer.solana.com/address/${nft.address.toString()}?cluster=devnet`
    )

    return nft
}


function loadKeyPair(filename: string): Keypair {
    const secret = JSON.parse(fs.readFileSync(filename).toString()) as number[]
    const secretKey = Uint8Array.from(secret)
    return Keypair.fromSecretKey(secretKey)
}

async function gettokenAccountCreationInstruction(mint: PublicKey, owner: PublicKey, payer: PublicKey): Promise<[PublicKey, TransactionInstruction]> {
    let tokenAccountAddress = await token.getAssociatedTokenAddress(
        mint, // mint
        owner, // owner
        true // allow owner off curve
    )

    const tokenAccountInstruction = await token.createAssociatedTokenAccountInstruction(
        payer, // payer
        tokenAccountAddress, // ata
        owner, // owner
        mint // mint
    )

    return [tokenAccountAddress, tokenAccountInstruction]

}


async function main() {
    const connection = new Connection(clusterApiUrl("devnet"), "confirmed");
    let transaction = new Transaction()

    const tokenSwapStateAccount = Keypair.generate()
    const tokenSwapStateAccountaccc = new Account(tokenSwapStateAccount.secretKey);

    const rent = await TokenSwap.getMinBalanceRentForExemptTokenSwap(connection)
    const wallet = loadKeyPair('.BobKX3z3oHUBQ3X4eZRGHwfqm18YfhGJuijiUtC2Gy2m.json')

    const tokenAMint = new PublicKey("ATor6ey5yNVLZmCAJUH8EKahinPaAibT8H1ixtd99CnW"); // chai token
    const tokenBMint = new PublicKey("BTo8pPuHq2S8Qg2gwpoWD8FiyjYXrM3qgL69dq7cRPDu"); // noraml spl token

    const pooltokenmint = new PublicKey("LPT2Fk86YDrwRwQHcKogG6BPVMzm8bsCtVq1a59UZmG");
    console.log("pool",pooltokenmint);

    // nft creation 
    const metaplex = Metaplex.make(connection)
        .use(keypairIdentity(wallet))
        .use(
            bundlrStorage({
                address: "https://devnet.bundlr.network",
                providerUrl: "https://api.devnet.solana.com",
                timeout: 60000,
            })
        )
    const buffer = fs.readFileSync("./" + imageFile)
    // buffer to metaplex file
    const file = toMetaplexFile(buffer, imageFile)
    // upload image and get image uri
    const imageUri = await metaplex.storage().upload(file)
    const { uri } = await metaplex
        .nfts()
        .uploadMetadata({
            name: tokenName,
            description: description,
            image: imageUri,
        })
    await createNft(metaplex, uri)
    console.log("metadata uri:", uri)
    console.log("image uri:", imageUri)
    console.log("PublicKey:", wallet.publicKey.toBase58())

    // token creation and token swap part

    const tokenSwapStateAccountCreationInstruction = await SystemProgram.createAccount({
        newAccountPubkey: tokenSwapStateAccount.publicKey,
        fromPubkey: wallet.publicKey,
        lamports: rent,
        space: TokenSwapLayout.span,
        programId: TOKEN_SWAP_PROGRAM_ID
    })
    transaction.add(tokenSwapStateAccountCreationInstruction)

    const [swapAuthority, bump] = await PublicKey.findProgramAddressSync(
        [tokenSwapStateAccount.publicKey.toBuffer()],
        TOKEN_SWAP_PROGRAM_ID,
    )

    // console.log("swap", swapAuthority) // 72QvFT3SK8nAvRfuwaH5p5j7EDjGTmRBXD23iCgB3Njo

    const [tokenAtokenAccount, tokenAAccountInstruction] = await gettokenAccountCreationInstruction(tokenAMint, swapAuthority, wallet.publicKey);
    const [tokenBtokenAccount, tokenBAccountInstruction] = await gettokenAccountCreationInstruction(tokenBMint, swapAuthority, wallet.publicKey);

    console.log('tokenA:', tokenAtokenAccount.toBase58())
    console.log('tokenB:', tokenBtokenAccount.toBase58())

    transaction.add(tokenAAccountInstruction, tokenBAccountInstruction)

    const singx = await connection.sendTransaction(transaction, [wallet, tokenSwapStateAccount])
    console.log("signkey", singx);

    transaction = new Transaction()


    const tokenAccountPool = Keypair.generate()
    const tokenpoolrent = await token.getMinimumBalanceForRentExemptAccount(connection)
    const createTokenAccountPoolInstruction = SystemProgram.createAccount({
        fromPubkey: wallet.publicKey,
        newAccountPubkey: tokenAccountPool.publicKey,
        space: token.ACCOUNT_SIZE,
        lamports: tokenpoolrent,
        programId: token.TOKEN_PROGRAM_ID,
    })
    const initializeTokenAccountPoolInstruction = token.createInitializeAccountInstruction(
        tokenAccountPool.publicKey,
        pooltokenmint,
        wallet.publicKey
    )

    transaction.add(createTokenAccountPoolInstruction)
    transaction.add(initializeTokenAccountPoolInstruction)

    const feeOwner = new PublicKey('HfoTxFR1Tm6kGmWgYWD6J7YHVy1UwqSULUGVLXkJqaKN');
    const [tokenFeeAccountAddress, tokenFeeAccountInstruction] = await gettokenAccountCreationInstruction(pooltokenmint, feeOwner, wallet.publicKey)

    transaction.add(tokenFeeAccountInstruction)


    const tokenswapInitswapInstruction = TokenSwap.createInitSwapInstruction(
        tokenSwapStateAccountaccc,
        swapAuthority,
        tokenAtokenAccount,
        tokenBtokenAccount,
        pooltokenmint,
        tokenFeeAccountAddress,
        tokenAccountPool.publicKey,
        token.TOKEN_PROGRAM_ID,
        TOKEN_SWAP_PROGRAM_ID,
        0,
        10000,
        5,
        10000,
        0,
        0,
        20,
        100,
        CurveType.ConstantProduct
    )

    transaction.add(tokenswapInitswapInstruction)

    const signature = await connection.sendTransaction(transaction, [wallet, tokenAccountPool]);
    console.log("signxxxkey", signature)
}

main()

