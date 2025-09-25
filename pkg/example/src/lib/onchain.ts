import { ethers } from "ethers";
import { getSafeConfig } from "./network-types";
import Safe from "@safe-global/protocol-kit";
import {
  SafeTransaction,
  MetaTransactionData,
  TransactionResult,
} from "@safe-global/types-kit";
import {
  SafeAccountConfig,
  PredictedSafeProps,
} from "@safe-global/protocol-kit";

import {
  getCurrentNetworkConfig,
  createContractNetworksConfig,
  DEFAULT_SAFE_VERSION,
} from "./safe-common";
import { SafeOffChain, UniversalOperationResult } from "./offchain";
import { Network } from "./network-types";
import { ParsedFunction, FunctionFormData } from "./contract-types";
import { contractRegistry } from "./contract-registry";

export interface TransactionParams {
  to: string;
  value: bigint;
  data: string;
}

export interface SafeConnectionForm {
  safeAddress: string;
  owners: string[];
  threshold: number;
  safeVersion?: string;
  fallbackHandler?: string;
}

// Interface for creating a new Safe
export interface SafeCreationForm {
  owners: string[];
  threshold: number;
  safeVersion?: string;
  fallbackHandler?: string;
}

export interface UniversalFunctionCall {
  contractAddress: string;
  functionSignature: string;
  functionParams: any[];
  value?: bigint; // Now in wei as BigInt
}

interface ExecuteTransactionResponse {
  hash: string;
  response: TransactionResult;
  totalSignatures: number;
  threshold: number;
  executedBy: string;
  usedSignatures: number;
}

export class SafeOnChain {
  private network: Network;
  private networkConfig = getCurrentNetworkConfig();
  private contractNetworks = createContractNetworksConfig(this.networkConfig);
  private safeSdk: Safe | null = null;
  currentSafeAddress: string | null = null;

  constructor(network: Network) {
    this.network = network;
  }

  private sortOwners(owners: string[]): string[] {
    return [...owners].sort((a, b) =>
      a.toLowerCase().localeCompare(b.toLowerCase())
    );
  }

  getSafeSdk(): Safe {
    if (!this.safeSdk) {
      throw new Error(
        "Safe not connected. Please create or connect to a Safe first."
      );
    }
    return this.safeSdk;
  }

  isConnected(): boolean {
    const hasSafeSdk = this.safeSdk !== null;
    const hasCurrentSafeAddress = this.currentSafeAddress !== null;
    return hasSafeSdk && hasCurrentSafeAddress;
  }

  async createSafeWithForm(form: SafeCreationForm): Promise<Safe> {
    const { owners, threshold } = form;
    const sortedOwners = this.sortOwners(owners);

    console.log("Creating Safe:", { owners: owners.length, threshold });

    const safeAccountConfig: SafeAccountConfig = {
      owners: sortedOwners,
      threshold,
      fallbackHandler:
        form.fallbackHandler ||
        this.networkConfig.contracts.compatibilityFallbackHandler,
    };

    const predictedSafe: PredictedSafeProps = {
      safeAccountConfig,
      safeDeploymentConfig: {
        safeVersion: DEFAULT_SAFE_VERSION,
      },
    };

    const safeConfig = await getSafeConfig(this.network, {
      predictedSafe,
      contractNetworks: this.contractNetworks,
    });

    try {
      const safeSdk = await Safe.init(safeConfig);
      const predictedAddress = await safeSdk.getAddress();
      console.log("📍 Predicted Safe address:", predictedAddress);

      const existingCode = await this.network.provider.getCode(
        predictedAddress
      );

      if (existingCode && existingCode !== "0x" && existingCode.length > 2) {
        console.log("Safe already exists, connecting...");
        try {
          const existingSafeConfig = await getSafeConfig(this.network, {
            safeAddress: predictedAddress,
            contractNetworks: this.contractNetworks,
          });

          const existingSafeSdk = await Safe.init(existingSafeConfig);
          this.safeSdk = existingSafeSdk;
          this.currentSafeAddress = predictedAddress;
          console.log("Connected to existing Safe");
          return existingSafeSdk;
        } catch (error) {
          console.log("Contract exists but it's not a Safe - creating new one");
        }
      }

      // Deploy new Safe
      console.log("Deploying new Safe...");
      const deploymentTransaction =
        await safeSdk.createSafeDeploymentTransaction();
      const txResponse = await this.network.signer.sendTransaction({
        to: deploymentTransaction.to,
        value: deploymentTransaction.value,
        data: deploymentTransaction.data,
      });

      await txResponse.wait?.();

      const deployedSafeAddress = await safeSdk.getAddress();
      this.safeSdk = safeSdk;
      this.currentSafeAddress = deployedSafeAddress;

      console.log("Safe created:", deployedSafeAddress);
      return safeSdk;
    } catch (error: any) {
      console.error("Safe creation error:", error.message);
      throw error;
    }
  }

  async connectToSafeWithForm(form: SafeConnectionForm): Promise<Safe> {
    console.log("Connecting to Safe:", form.safeAddress);

    try {
      const safeConfig = await getSafeConfig(this.network, {
        safeAddress: form.safeAddress,
        contractNetworks: this.contractNetworks,
      });

      const safeSdk = await Safe.init(safeConfig);
      this.safeSdk = safeSdk;
      this.currentSafeAddress = form.safeAddress;

      console.log("Safe connected:", form.safeAddress);
      return safeSdk;
    } catch (error) {
      console.error("Safe connection error:", error);
      this.safeSdk = null;
      this.currentSafeAddress = null;
      throw error;
    }
  }

  disconnect(): void {
    this.safeSdk = null;
    this.currentSafeAddress = null;
  }

  async getSafeAddressByForm(form: SafeCreationForm): Promise<string> {
    const sortedOwners = this.sortOwners(form.owners);

    const predictedSafe: PredictedSafeProps = {
      safeAccountConfig: {
        owners: sortedOwners,
        threshold: form.threshold,
        fallbackHandler:
          form.fallbackHandler ||
          this.networkConfig.contracts.compatibilityFallbackHandler,
      },
      safeDeploymentConfig: {
        safeVersion: DEFAULT_SAFE_VERSION,
      },
    };

    const safeConfig = await getSafeConfig(this.network, {
      predictedSafe,
      contractNetworks: this.contractNetworks,
    });

    const safeSdk = await Safe.init(safeConfig);
    return await safeSdk.getAddress();
  }

  async isSafeDeployed(safeAddress: string): Promise<boolean> {
    try {
      const code = await this.network.provider.getCode(safeAddress);
      return !!(code && code !== "0x" && code.length > 2);
    } catch (error) {
      return false;
    }
  }

  async getCurrentSafeInfo() {
    const safeSdk = this.getSafeSdk();

    if (!this.currentSafeAddress) {
      throw new Error("Safe address not defined");
    }

    const [owners, threshold, balance, nonce, version, isDeployed] =
      await Promise.all([
        safeSdk.getOwners(),
        safeSdk.getThreshold(),
        safeSdk.getBalance(),
        safeSdk.getNonce(),
        safeSdk.getContractVersion(),
        safeSdk.isSafeDeployed(),
      ]);

    return {
      address: this.currentSafeAddress,
      owners,
      threshold,
      balance: ethers.formatEther(balance),
      nonce,
      version,
      isDeployed,
    };
  }

  encodeFunctionCall(functionCall: UniversalFunctionCall): string {
    try {
      const functionAbi = [`function ${functionCall.functionSignature}`];
      const contractInterface = new ethers.Interface(functionAbi);
      const functionName = functionCall.functionSignature.split("(")[0];

      return contractInterface.encodeFunctionData(
        functionName,
        functionCall.functionParams
      );
    } catch (error) {
      throw new Error(
        `Failed to encode function ${functionCall.functionSignature}: ${error}`
      );
    }
  }

  getContractInfo(contractAddress: string): {
    address: string;
    functions: ParsedFunction[];
  } | null {
    const contract = contractRegistry.getContract(contractAddress);
    if (!contract) {
      return null;
    }

    const functions = contractRegistry.getContractFunctions(contractAddress);

    return {
      address: contractAddress,
      functions,
    };
  }

  async createStructuredTransactionHash(
    contractAddress: string,
    selectedFunction: ParsedFunction,
    formData: FunctionFormData,
    nonce?: number
  ): Promise<UniversalOperationResult> {
    if (!this.currentSafeAddress) {
      throw new Error("Safe address not defined");
    }

    // Convert ETH to wei (BigInt)
    let valueInWei: bigint = 0n;
    if (
      formData.ethValue &&
      formData.ethValue !== "0" &&
      formData.ethValue !== ""
    ) {
      valueInWei = ethers.parseEther(formData.ethValue.toString());
    }

    // Convert structured data to UniversalFunctionCall format
    const functionCall: UniversalFunctionCall = {
      contractAddress,
      functionSignature: selectedFunction.signature,
      functionParams: this.convertFormDataToParams(
        selectedFunction,
        formData.parameters
      ),
      value: valueInWei,
    };

    return await this.createUniversalTransactionHash(functionCall, nonce);
  }

  private convertFormDataToParams(
    selectedFunction: ParsedFunction,
    parameters: { [key: string]: any }
  ): any[] {
    return selectedFunction.inputs.map((input, index) => {
      const paramName = input.name || `param${index}`;
      const value = parameters[paramName];
      return this.convertParameterValue(value, input.type);
    });
  }

  /**
   * Converts parameter value according to Solidity type
   */
  private convertParameterValue(value: any, type: string): any {
    if (!value || value === "") {
      throw new Error(`Parameter of type ${type} cannot be empty`);
    }

    switch (type) {
      case "bool":
        return value === "true" || value === true;

      case "address":
        if (!/^0x[a-fA-F0-9]{40}$/.test(value)) {
          throw new Error(`Invalid address format: ${value}`);
        }
        return value;

      case "string":
        return value.toString();

      case "uint256":
      case "uint":
        return ethers.parseUnits(value.toString(), 0).toString();

      default:
        if (type.startsWith("uint")) {
          return ethers.parseUnits(value.toString(), 0).toString();
        }
        if (type.startsWith("bytes")) {
          if (!/^0x[a-fA-F0-9]*$/.test(value)) {
            throw new Error(`Invalid bytes format for ${type}: ${value}`);
          }
          return value;
        }

        // For other types return as is
        return value;
    }
  }

  async createUniversalTransactionHash(
    functionCall: UniversalFunctionCall,
    nonce?: number
  ): Promise<UniversalOperationResult> {
    if (!this.currentSafeAddress) {
      throw new Error("Safe address not defined");
    }

    console.log("Creating transaction:", {
      contract: functionCall.contractAddress,
      function: functionCall.functionSignature,
      value: ethers.formatEther(functionCall.value || 0n) + " ETH",
      nonce: nonce !== undefined ? nonce : "auto",
    });

    const encodedData = this.encodeFunctionCall(functionCall);

    const transactionParams: TransactionParams = {
      to: functionCall.contractAddress,
      value: functionCall.value || 0n,
      data: encodedData,
    };

    const safeTransaction = await this.createSafeTransaction(
      transactionParams,
      nonce
    );
    const transactionHash = await this.getSafeSdk().getTransactionHash(
      safeTransaction
    );

    console.log("Transaction hash created:", transactionHash);

    return {
      transactionHash,
      safeTransaction,
      encodedData,
      transactionDetails: {
        to: transactionParams.to,
        value: ethers.formatEther(transactionParams.value),
        data: transactionParams.data,
        nonce: safeTransaction.data.nonce,
      },
    };
  }

  async createSafeTransaction(
    transactionParams: TransactionParams,
    nonce?: number
  ): Promise<SafeTransaction> {
    const safeSdk = this.getSafeSdk();
    const valueInWei = transactionParams.value.toString();

    console.log("Transaction params:", transactionParams);

    if (nonce !== undefined) {
      console.log("📍 Using specified nonce:", nonce);
    }

    const metaTransactionData: MetaTransactionData = {
      to: transactionParams.to,
      value: valueInWei,
      data: transactionParams.data,
    };

    const safeTransaction = await safeSdk.createTransaction({
      transactions: [metaTransactionData],
      options: {
        safeTxGas: "0",
        nonce: nonce,
      },
    });

    console.log(
      "Safe transaction created with nonce:",
      safeTransaction.data.nonce
    );
    return safeTransaction;
  }

  async executeTransactionByHash(
    safeTxHash: string,
    safeOffChain?: SafeOffChain
  ): Promise<string> {
    if (!this.isConnected()) {
      throw new Error("Safe not connected");
    }

    if (!safeOffChain) {
      throw new Error(
        "SafeOffChain is required to execute transaction by hash for data recovery"
      );
    }

    const txFromSTS = await safeOffChain.getTransaction(safeTxHash);

    // Convert value from STS to BigInt
    const valueFromSTS =
      txFromSTS.value && txFromSTS.value !== "0" ? BigInt(txFromSTS.value) : 0n;

    console.log("Value from STS:", txFromSTS.value, "wei");
    console.log("Value as BigInt:", valueFromSTS.toString(), "wei");

    // Use nonce from STS transaction
    const nonceFromSTS = txFromSTS.nonce
      ? parseInt(txFromSTS.nonce.toString())
      : undefined;
    console.log("📍 Using nonce from STS:", nonceFromSTS);

    const safeTransaction = await this.createSafeTransaction(
      {
        to: txFromSTS.to,
        value: valueFromSTS,
        data: txFromSTS.data || "0x",
      },
      nonceFromSTS
    );

    // Restore parameters from STS (nonce already set during transaction creation)

    if (txFromSTS.safeTxGas) {
      safeTransaction.data.safeTxGas = txFromSTS.safeTxGas;
    }

    if (txFromSTS.baseGas) {
      safeTransaction.data.baseGas = txFromSTS.baseGas;
    }

    if (txFromSTS.gasPrice) {
      safeTransaction.data.gasPrice = txFromSTS.gasPrice;
    }

    if (txFromSTS.gasToken) {
      safeTransaction.data.gasToken = txFromSTS.gasToken;
    }

    if (txFromSTS.refundReceiver) {
      safeTransaction.data.refundReceiver = txFromSTS.refundReceiver;
    }

    // Check hash
    const restoredTxHash = await this.getSafeSdk().getTransactionHash(
      safeTransaction
    );
    if (restoredTxHash !== safeTxHash) {
      throw new Error("Failed to restore transaction with correct hash");
    }

    // Restore signatures
    if (txFromSTS.confirmations?.length) {
      const sortedConfirmations = [...txFromSTS.confirmations].sort((a, b) =>
        a.owner.toLowerCase().localeCompare(b.owner.toLowerCase())
      );

      for (const confirmation of sortedConfirmations) {
        if (confirmation.signature && confirmation.signature !== "0x") {
          const signature = {
            signer: confirmation.owner.toLowerCase(),
            data: confirmation.signature,
            isContractSignature: false,
            staticPart: () => confirmation.signature,
            dynamicPart: () => "",
          };
          safeTransaction.addSignature(signature);
        } else if (confirmation.signatureType !== "EOA") {
          const approveSignature = {
            signer: confirmation.owner.toLowerCase(),
            data: `0x${confirmation.owner
              .slice(2)
              .padStart(64, "0")}${"0".repeat(64)}01`,
            isContractSignature: false,
            staticPart: () =>
              `0x${confirmation.owner.slice(2).padStart(64, "0")}${"0".repeat(
                64
              )}01`,
            dynamicPart: () => "",
          };
          safeTransaction.addSignature(approveSignature);
        }
      }
    }

    const result = await this.executeTransaction(safeTransaction);
    return result.hash;
  }

  async executeTransaction(
    safeTransaction: SafeTransaction
  ): Promise<ExecuteTransactionResponse> {
    if (!this.currentSafeAddress) {
      throw new Error("Safe address not defined");
    }

    const lazyConfig = await getSafeConfig(this.network, {
      safeAddress: this.currentSafeAddress,
      contractNetworks: this.contractNetworks,
    });

    const safeSdk = await Safe.init(lazyConfig);

    const isDeployed = await safeSdk.isSafeDeployed();
    if (!isDeployed) {
      throw new Error(
        `Safe not deployed! Please create Safe at address first: ${this.currentSafeAddress}`
      );
    }

    const threshold = await safeSdk.getThreshold();
    const signatures = safeTransaction.signatures.size;

    if (signatures < threshold) {
      const missing = threshold - signatures;
      throw new Error(
        `Insufficient signatures! Required: ${threshold}, have: ${signatures}. Need ${missing} more signatures.`
      );
    }

    // Diagnostics before execution
    const txValue = BigInt(safeTransaction.data.value);
    const safeAddress = await safeSdk.getAddress();
    const providerBalance = await this.network.provider.getBalance(safeAddress);

    console.log("🏦 Safe address:", safeAddress);
    console.log("🏦 Safe contract balance:", providerBalance.toString(), "wei");
    console.log("💸 Transaction value:", txValue.toString(), "wei");
    console.log(
      "Safe transaction data:",
      JSON.stringify(safeTransaction.data, null, 2)
    );

    const executeTxResponse = await safeSdk.executeTransaction(safeTransaction);

    return {
      hash: executeTxResponse.hash,
      response: executeTxResponse,
      totalSignatures: signatures,
      threshold: threshold,
      executedBy: await this.network.signer.getAddress(),
      usedSignatures: signatures,
    };
  }
}

// Create Safe connection form
export function createSafeConnectionForm(
  safeAddress: string,
  owners: string[],
  threshold: number,
  options?: {
    safeVersion?: string;
    fallbackHandler?: string;
  }
): SafeConnectionForm {
  return {
    safeAddress,
    owners,
    threshold,
    safeVersion: options?.safeVersion || DEFAULT_SAFE_VERSION,
    fallbackHandler: options?.fallbackHandler,
  };
}

// Create Safe creation form
export function createSafeCreationForm(
  owners: string[],
  threshold: number,
  options?: {
    safeVersion?: string;
    fallbackHandler?: string;
  }
): SafeCreationForm {
  return {
    owners,
    threshold,
    safeVersion: options?.safeVersion || DEFAULT_SAFE_VERSION,
    fallbackHandler: options?.fallbackHandler,
  };
}

export default SafeOnChain;
