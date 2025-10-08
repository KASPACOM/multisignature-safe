/**
 * Contract registry for managing ABI and metadata
 * Now loads contracts from Safe Transaction Service API
 */

import { ContractABI, ParsedFunction } from "./contract-types";
import { ContractsAPI } from "./contracts-api";

export class ContractRegistry {
  private static instance: ContractRegistry;
  private contracts: Map<string, ContractABI> = new Map();
  private contractsAPI: ContractsAPI | null = null;
  private isLoading = false;
  private loadingPromise: Promise<void> | null = null;

  private constructor() {
    // Constructor is empty, initialization will be in loadContracts()
  }

  static getInstance(): ContractRegistry {
    if (!ContractRegistry.instance) {
      ContractRegistry.instance = new ContractRegistry();
    }
    return ContractRegistry.instance;
  }

  /**
   * Initializes API client for given chainId
   */
  initializeForChain(chainId: bigint): void {
    console.log(`Initializes ContractRegistry for chainId: ${chainId}`);
    this.contractsAPI = new ContractsAPI(chainId);

    // Clear previous contracts when changing network
    this.contracts.clear();
    this.loadingPromise = null;
  }

  /**
   * Loads contracts from Safe Transaction Service API
   */
  async loadContracts(options?: {
    limit?: number;
    offset?: number;
    trusted?: boolean;
    forceReload?: boolean;
  }): Promise<void> {
    if (!this.contractsAPI) {
      throw new Error(
        "ContractRegistry not initialized. Call initializeForChain() first."
      );
    }

    // If already loading, wait for current loading to complete
    if (this.isLoading && this.loadingPromise) {
      console.log(
        "⏳ Contracts are already loading, waiting for completion..."
      );
      return this.loadingPromise;
    }

    // If already loaded and not force reload
    if (this.contracts.size > 0 && !options?.forceReload) {
      console.log(`Contracts already loaded: ${this.contracts.size}`);
      return;
    }

    console.log("Begin loading contracts from API...");
    this.isLoading = true;

    this.loadingPromise = this.performLoad(options);

    try {
      await this.loadingPromise;
    } finally {
      this.isLoading = false;
      this.loadingPromise = null;
    }
  }

  private async performLoad(options?: {
    limit?: number;
    offset?: number;
    trusted?: boolean;
  }): Promise<void> {
    try {
      const contracts = await this.contractsAPI!.getContracts(options);

      console.log(`Received contracts from API: ${contracts.length}`);

      // Clear old contracts
      this.contracts.clear();

      // Add new contracts
      contracts.forEach((contract) => {
        this.addContract(contract);
      });

      console.log(`Successfully loaded contracts: ${this.contracts.size}`);
    } catch (error: any) {
      console.error("Error loading contracts:", error);
      throw new Error(`Failed to load contracts: ${error.message}`);
    }
  }

  /**
   * Adds contract to registry
   */
  addContract(contract: ContractABI): void {
    const key = contract.address.toLowerCase();

    // Make sure parsedFunctions are set
    if (!contract.parsedFunctions) {
      console.warn(
        `Contract ${contract.name} does not have parsedFunctions, skipping`
      );
      return;
    }

    this.contracts.set(key, contract);

    console.log(`Added contract ${contract.name} (${contract.address})`);
    console.log(
      `Functions for Safe proposals: ${contract.parsedFunctions.length}`
    );
  }

  /**
   * Gets contract by address
   */
  getContract(address: string): ContractABI | null {
    const key = address.toLowerCase();
    return this.contracts.get(key) || null;
  }

  /**
   * Gets all contracts
   */
  getAllContracts(): ContractABI[] {
    return Array.from(this.contracts.values());
  }

  /**
   * Gets functions of contract
   */
  getContractFunctions(address: string): ParsedFunction[] {
    const contract = this.getContract(address);
    return contract?.parsedFunctions || [];
  }

  /**
   * Gets function by address of contract and name of function
   */
  getFunction(address: string, functionName: string): ParsedFunction | null {
    const functions = this.getContractFunctions(address);
    return functions.find((func) => func.name === functionName) || null;
  }

  /**
   * Checks if contract exists
   */
  hasContract(address: string): boolean {
    const key = address.toLowerCase();
    return this.contracts.has(key);
  }

  /**
   * Loads specific contract by address from API
   */
  async loadContract(address: string): Promise<ContractABI | null> {
    if (!this.contractsAPI) {
      throw new Error(
        "ContractRegistry not initialized. Call initializeForChain() first."
      );
    }

    try {
      console.log(`Loading contract from API: ${address}`);
      const contract = await this.contractsAPI.getContract(address);

      if (contract) {
        this.addContract(contract);
        console.log(`Contract loaded and added: ${contract.name}`);
      } else {
        console.log(`Contract not found in API: ${address}`);
      }

      return contract;
    } catch (error: any) {
      console.error(`Error loading contract ${address}:`, error);
      throw error;
    }
  }

  /**
   * Gets loading status
   */
  getLoadingStatus(): {
    isLoading: boolean;
    contractsCount: number;
    hasContracts: boolean;
  } {
    return {
      isLoading: this.isLoading,
      contractsCount: this.contracts.size,
      hasContracts: this.contracts.size > 0,
    };
  }

  /**
   * Clears all contracts
   */
  clear(): void {
    console.log("🧹 Clears contract registry");
    this.contracts.clear();
    this.contractsAPI = null;
    this.loadingPromise = null;
    this.isLoading = false;
  }
}

export const contractRegistry = ContractRegistry.getInstance();
